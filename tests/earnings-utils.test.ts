import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PLATFORM_FEE,
  money,
  getCycleStart,
  getCycleEnd,
  getCycleByOffset,
  formatDate,
  formatShortDate,
  formatDateTime,
  isCompleted,
  calculateEarningsTotals,
  calculateCycleProgress,
  aggregateDailyEarnings,
  interactionName,
  aggregateInteractionBreakdown,
} from "../lib/earnings/utils.ts";
import type { Submission } from "../lib/earnings/utils.ts";

describe("StreamLounge Earnings Utilities", () => {
  describe("1. isCompleted() status filtering", () => {
    it("accepts valid payment_status values case-insensitively", () => {
      assert.equal(isCompleted({ payment_status: "paid" }), true);
      assert.equal(isCompleted({ payment_status: "success" }), true);
      assert.equal(isCompleted({ payment_status: "successful" }), true);
      assert.equal(isCompleted({ payment_status: "completed" }), true);
      assert.equal(isCompleted({ payment_status: "PAID" }), true);
      assert.equal(isCompleted({ payment_status: "Success" }), true);
      assert.equal(isCompleted({ payment_status: "SUCCESSFUL" }), true);
      assert.equal(isCompleted({ payment_status: "Completed" }), true);
    });

    it("accepts valid status values case-insensitively", () => {
      assert.equal(isCompleted({ status: "paid" }), true);
      assert.equal(isCompleted({ status: "success" }), true);
      assert.equal(isCompleted({ status: "successful" }), true);
      assert.equal(isCompleted({ status: "completed" }), true);
      assert.equal(isCompleted({ status: "PAID" }), true);
      assert.equal(isCompleted({ status: "SUCCESS" }), true);
    });

    it("accepts when either payment_status or status is completed", () => {
      assert.equal(isCompleted({ payment_status: "failed", status: "paid" }), true);
      assert.equal(isCompleted({ payment_status: "success", status: "pending" }), true);
    });

    it("rejects unsuccessful, pending, and invalid statuses", () => {
      assert.equal(isCompleted({ payment_status: "pending" }), false);
      assert.equal(isCompleted({ payment_status: "failed" }), false);
      assert.equal(isCompleted({ payment_status: "initiated" }), false);
      assert.equal(isCompleted({ payment_status: "refunded" }), false);
      assert.equal(isCompleted({ payment_status: "" }), false);
      assert.equal(isCompleted({ payment_status: null }), false);
      assert.equal(isCompleted({ status: undefined }), false);
      assert.equal(isCompleted({}), false);
    });

    it("preserves exact existing non-trimming behavior", () => {
      // Existing implementation does String(...).toLowerCase() without .trim()
      assert.equal(isCompleted({ payment_status: " paid" }), false);
      assert.equal(isCompleted({ payment_status: "paid " }), false);
      assert.equal(isCompleted({ status: " success" }), false);
    });
  });

  describe("2. Earnings & Fee Calculations", () => {
    it("handles empty transaction lists with zeroes", () => {
      const result = calculateEarningsTotals([]);
      assert.deepEqual(result, {
        totalEarnings: 0,
        platformFee: 0,
        creatorReceive: 0,
        totalSupports: 0,
      });
    });

    it("filters out uncompleted transactions from earnings", () => {
      const submissions = [
        { id: "1", amount: 100, payment_status: "paid", status: "paid" },
        { id: "2", amount: 200, payment_status: "failed", status: "failed" },
        { id: "3", amount: 150, payment_status: "pending", status: "pending" },
      ];
      const result = calculateEarningsTotals(submissions);
      assert.equal(result.totalEarnings, 100);
      assert.equal(result.platformFee, 10);
      assert.equal(result.creatorReceive, 90);
      assert.equal(result.totalSupports, 1);
    });

    it("calculates exact 10% fee on whole amounts", () => {
      const submissions = [
        { amount: 100, payment_status: "paid" },
        { amount: 50, payment_status: "paid" },
        { amount: 250, payment_status: "paid" },
      ];
      const result = calculateEarningsTotals(submissions);
      assert.equal(result.totalEarnings, 400);
      assert.equal(result.platformFee, 40);
      assert.equal(result.creatorReceive, 360);
      assert.equal(result.totalSupports, 3);
      assert.equal(result.platformFee + result.creatorReceive, result.totalEarnings);
    });

    it("applies Math.round correctly to fractional platform fees", () => {
      // 25 * 0.1 = 2.5 -> Math.round is 3
      const t1 = calculateEarningsTotals([{ amount: 25, payment_status: "paid" }]);
      assert.equal(t1.totalEarnings, 25);
      assert.equal(t1.platformFee, 3);
      assert.equal(t1.creatorReceive, 22);
      assert.equal(t1.platformFee + t1.creatorReceive, 25);

      // 14 * 0.1 = 1.4 -> Math.round is 1
      const t2 = calculateEarningsTotals([{ amount: 14, payment_status: "paid" }]);
      assert.equal(t2.totalEarnings, 14);
      assert.equal(t2.platformFee, 1);
      assert.equal(t2.creatorReceive, 13);
      assert.equal(t2.platformFee + t2.creatorReceive, 14);

      // 15 * 0.1 = 1.5 -> Math.round is 2
      const t3 = calculateEarningsTotals([{ amount: 15, payment_status: "paid" }]);
      assert.equal(t3.totalEarnings, 15);
      assert.equal(t3.platformFee, 2);
      assert.equal(t3.creatorReceive, 13);
      assert.equal(t3.platformFee + t3.creatorReceive, 15);

      // Invariant check: fee + receive === totalEarnings always
      for (let amt = 1; amt <= 100; amt++) {
        const res = calculateEarningsTotals([{ amount: amt, payment_status: "paid" }]);
        assert.equal(res.platformFee + res.creatorReceive, amt);
      }
    });

    it("handles null or missing amounts safely as 0", () => {
      const submissions = [
        { amount: null, payment_status: "paid" },
        { amount: undefined, payment_status: "paid" },
        { amount: 50, payment_status: "paid" },
      ];
      const result = calculateEarningsTotals(submissions);
      assert.equal(result.totalEarnings, 50);
      assert.equal(result.platformFee, 5);
      assert.equal(result.creatorReceive, 45);
      assert.equal(result.totalSupports, 3);
    });
  });

  describe("3. 15-Day Rolling Cycle Boundaries & Offsets", () => {
    it("anchors to 2026-10-07T00:00:00 with exact 15-day length", () => {
      const anchorDate = new Date("2026-10-07T14:30:00");
      const start = getCycleStart(anchorDate);
      const end = getCycleEnd(start);

      assert.equal(start.getFullYear(), 2026);
      assert.equal(start.getMonth(), 9); // October is month 9 (0-indexed)
      assert.equal(start.getDate(), 7);
      assert.equal(start.getHours(), 0);
      assert.equal(start.getMinutes(), 0);
      assert.equal(start.getSeconds(), 0);
      assert.equal(start.getMilliseconds(), 0);

      assert.equal(end.getFullYear(), 2026);
      assert.equal(end.getMonth(), 9);
      assert.equal(end.getDate(), 21);
      assert.equal(end.getHours(), 23);
      assert.equal(end.getMinutes(), 59);
      assert.equal(end.getSeconds(), 59);
      assert.equal(end.getMilliseconds(), 999);

      // Exactly 15 days in milliseconds minus 1 millisecond
      assert.equal(end.getTime() - start.getTime() + 1, 15 * 24 * 60 * 60 * 1000);
    });

    it("places days inside the anchor cycle into Oct 07 - Oct 21", () => {
      const d1 = new Date("2026-10-07T00:00:00");
      const d2 = new Date("2026-10-14T12:00:00");
      const d3 = new Date("2026-10-21T23:59:59");

      assert.equal(getCycleStart(d1).toISOString(), getCycleStart(d2).toISOString());
      assert.equal(getCycleStart(d2).toISOString(), getCycleStart(d3).toISOString());
    });

    it("starts the next 15-day cycle on Oct 22", () => {
      const nextCycleDate = new Date("2026-10-22T00:00:00");
      const start = getCycleStart(nextCycleDate);
      const end = getCycleEnd(start);

      assert.equal(start.getDate(), 22);
      assert.equal(start.getMonth(), 9); // October
      assert.equal(end.getDate(), 5);
      assert.equal(end.getMonth(), 10); // November
    });

    it("historical offsets have zero gaps and zero overlaps between adjacent cycles", () => {
      const fixedToday = new Date("2026-10-18T12:00:00");

      for (let offset = 0; offset < 10; offset++) {
        const current = getCycleByOffset(offset, fixedToday);
        const previous = getCycleByOffset(offset + 1, fixedToday);

        // Previous cycle end must be exactly 1 ms before current cycle start
        assert.equal(
          previous.end.getTime() + 1,
          current.start.getTime(),
          `Cycle offset ${offset + 1} and ${offset} should be strictly continuous`
        );

        // Each cycle must span exactly 15 full days
        assert.equal(
          current.end.getTime() - current.start.getTime() + 1,
          15 * 86400 * 1000,
          `Cycle offset ${offset} must span 15 full days`
        );
      }
    });

    it("calculates cycle progress correctly for current vs past cycles", () => {
      const cycleStart = new Date("2026-10-07T00:00:00");
      const day1 = new Date("2026-10-07T12:00:00");
      const day10 = new Date("2026-10-16T12:00:00");

      const prog1 = calculateCycleProgress(cycleStart, true, day1);
      assert.equal(prog1.currentDay, 1);
      assert.equal(Math.round(prog1.progress), Math.round((1 / 15) * 100));

      const prog10 = calculateCycleProgress(cycleStart, true, day10);
      assert.equal(prog10.currentDay, 10);
      assert.equal(Math.round(prog10.progress), Math.round((10 / 15) * 100));

      // Archived / past cycle is always 15 of 15 (100%)
      const past = calculateCycleProgress(cycleStart, false, day10);
      assert.equal(past.currentDay, 15);
      assert.equal(past.progress, 100);
    });
  });

  describe("4. Month-Boundary Dates Across Various Months", () => {
    // Tests the 1st, 15th, 16th, and last day of months across Feb (leap & non-leap), 30-day, and 31-day months
    const boundaryDates = [
      // 31-day month: January 2026
      { name: "Jan 1, 2026 (31-day start)", date: new Date("2026-01-01T12:00:00") },
      { name: "Jan 15, 2026", date: new Date("2026-01-15T12:00:00") },
      { name: "Jan 16, 2026", date: new Date("2026-01-16T12:00:00") },
      { name: "Jan 31, 2026 (31-day end)", date: new Date("2026-01-31T12:00:00") },

      // Non-leap February 2026 (28 days)
      { name: "Feb 1, 2026 (non-leap Feb start)", date: new Date("2026-02-01T12:00:00") },
      { name: "Feb 15, 2026", date: new Date("2026-02-15T12:00:00") },
      { name: "Feb 16, 2026", date: new Date("2026-02-16T12:00:00") },
      { name: "Feb 28, 2026 (non-leap Feb end)", date: new Date("2026-02-28T23:59:00") },

      // Leap year February 2024 (29 days)
      { name: "Feb 1, 2024 (leap Feb start)", date: new Date("2024-02-01T12:00:00") },
      { name: "Feb 15, 2024", date: new Date("2024-02-15T12:00:00") },
      { name: "Feb 16, 2024", date: new Date("2024-02-16T12:00:00") },
      { name: "Feb 29, 2024 (leap Feb 29 end)", date: new Date("2024-02-29T23:59:00") },

      // 30-day month: April 2026
      { name: "Apr 1, 2026 (30-day start)", date: new Date("2026-04-01T12:00:00") },
      { name: "Apr 15, 2026", date: new Date("2026-04-15T12:00:00") },
      { name: "Apr 16, 2026", date: new Date("2026-04-16T12:00:00") },
      { name: "Apr 30, 2026 (30-day end)", date: new Date("2026-04-30T23:59:00") },

      // 31-day month: October 2026 (containing anchor)
      { name: "Oct 1, 2026", date: new Date("2026-10-01T12:00:00") },
      { name: "Oct 15, 2026", date: new Date("2026-10-15T12:00:00") },
      { name: "Oct 16, 2026", date: new Date("2026-10-16T12:00:00") },
      { name: "Oct 31, 2026", date: new Date("2026-10-31T23:59:00") },
    ];

    for (const { name, date } of boundaryDates) {
      it(`reliably bounds ${name} in a valid 15-day rolling cycle`, () => {
        const start = getCycleStart(date);
        const end = getCycleEnd(start);

        // Date must be strictly inside [start, end]
        assert.ok(
          date.getTime() >= start.getTime(),
          `${name} (${date.toISOString()}) must be >= cycle start (${start.toISOString()})`
        );
        assert.ok(
          date.getTime() <= end.getTime(),
          `${name} (${date.toISOString()}) must be <= cycle end (${end.toISOString()})`
        );

        // Cycle must be exactly 15 days long
        assert.equal(
          end.getTime() - start.getTime() + 1,
          15 * 86400 * 1000,
          `Cycle containing ${name} must be exactly 15 days`
        );
      });
    }
  });

  describe("5. Daily Chart & Breakdown Aggregations", () => {
    it("generates exactly 15 daily entries starting from cycleStart", () => {
      const cycleStart = new Date("2026-10-07T00:00:00");
      const daily = aggregateDailyEarnings([], cycleStart);

      assert.equal(daily.length, 15);
      assert.equal(daily[0].total, 0);
      assert.equal(daily[0].receive, 0);
      assert.equal(daily[14].total, 0);
    });

    it("accurately attributes transactions to days including midnight boundaries", () => {
      const cycleStart = new Date("2026-10-07T00:00:00");
      const transactions = [
        // Day 0: 2026-10-07
        { created_at: new Date(cycleStart.getTime() + 1000).toISOString(), amount: 100 },
        { created_at: new Date(cycleStart.getTime() + 12 * 3600 * 1000).toISOString(), amount: 50 },
        // Day 1: 2026-10-08
        { created_at: new Date(cycleStart.getTime() + 26 * 3600 * 1000).toISOString(), amount: 200 },
        // Day 14: 2026-10-21 (last day of 15-day cycle)
        { created_at: new Date(cycleStart.getTime() + (14 * 24 + 10) * 3600 * 1000).toISOString(), amount: 300 },
        // Out of cycle (before or after): should not be aggregated
        { created_at: new Date(cycleStart.getTime() - 1000).toISOString(), amount: 500 },
        { created_at: new Date(cycleStart.getTime() + 15 * 86400 * 1000 + 1000).toISOString(), amount: 999 },
      ];

      const daily = aggregateDailyEarnings(transactions, cycleStart);

      assert.equal(daily[0].total, 150);
      assert.equal(daily[0].receive, 150 * 0.9);
      assert.equal(daily[1].total, 200);
      assert.equal(daily[1].receive, 200 * 0.9);
      assert.equal(daily[14].total, 300);
      assert.equal(daily[14].receive, 300 * 0.9);

      // Verify intermediate empty days are 0
      assert.equal(daily[2].total, 0);
      assert.equal(daily[5].total, 0);
    });

    it("aggregates interaction breakdown by type", () => {
      const transactions = [
        { interaction_type: "text", amount: 100 },
        { interaction_type: "text", amount: 150 },
        { interaction_type: "audio", amount: 200 },
        { interaction_type: "soundboard", amount: 50 },
      ];

      const breakdown = aggregateInteractionBreakdown(transactions);
      assert.deepEqual(breakdown.text, { count: 2, totalAmount: 250, label: "Text" });
      assert.deepEqual(breakdown.audio, { count: 1, totalAmount: 200, label: "Voice Message" });
      assert.deepEqual(breakdown.soundboard, { count: 1, totalAmount: 50, label: "Soundboard" });
    });

    it("formats currency with money() properly", () => {
      assert.equal(money(0), "₹0");
      assert.equal(money(100), "₹100");
      assert.equal(money(1500), "₹1,500");
      assert.equal(money(1500.4), "₹1,500");
      assert.equal(money(1500.6), "₹1,501");
    });

    it("maps interaction names accurately", () => {
      assert.equal(interactionName("text"), "Text");
      assert.equal(interactionName("audio"), "Voice Message");
      assert.equal(interactionName("soundboard"), "Soundboard");
      assert.equal(interactionName("stickers"), "AI Sticker");
      assert.equal(interactionName("spin_wheel"), "Spin Wheel");
      assert.equal(interactionName("tasks"), "Task");
      assert.equal(interactionName("custom_type"), "custom_type");
    });
  });
});
