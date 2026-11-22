import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PLATFORM_FEE_BPS,
  computeFeeBreakdown,
  formatBps,
  isPaymentSource,
  isPlatformCollected,
  refundCreatorReversalPaise,
} from "../lib/payments/fees.ts";

test("QR superchat: ₹1,000 → ₹80 platform fee, ₹920 creator gross share", () => {
  const b = computeFeeBreakdown({ source: "STREAMLOUNGE_QR", grossPaise: 100_000 });
  assert.equal(b.platformFeeBps, 800);
  assert.equal(b.platformFeePaise, 8_000);
  assert.equal(b.creatorGrossSharePaise, 92_000);
  assert.equal(b.creatorNetPaise, 92_000);
  assert.equal(b.platformCollected, true);
});

test("QR fee is 8% and external link fee is 0%", () => {
  assert.equal(PLATFORM_FEE_BPS.STREAMLOUNGE_QR, 800);
  assert.equal(PLATFORM_FEE_BPS.EXTERNAL_RAZORPAY_LINK, 0);
  assert.equal(formatBps(800), "8%");
});

test("external Razorpay link: no platform commission, not platform-collected", () => {
  const b = computeFeeBreakdown({ source: "EXTERNAL_RAZORPAY_LINK", grossPaise: 100_000, gatewayFeePaise: 2_360 });
  assert.equal(b.platformFeePaise, 0);
  assert.equal(b.platformNetPaise, 0);
  assert.equal(b.creatorGrossSharePaise, 100_000);
  assert.equal(b.creatorNetPaise, 97_640, "gateway charges are the creator's own and shown, not hidden");
  assert.equal(b.platformCollected, false);
  assert.equal(isPlatformCollected("EXTERNAL_RAZORPAY_LINK"), false);
});

test("external link ignores any QR rate override", () => {
  const b = computeFeeBreakdown({ source: "EXTERNAL_RAZORPAY_LINK", grossPaise: 50_000, qrFeeBps: 2_000 });
  assert.equal(b.platformFeePaise, 0);
});

test("gateway fee is separate from the platform fee (platform bears it by default)", () => {
  const b = computeFeeBreakdown({ source: "STREAMLOUNGE_QR", grossPaise: 100_000, gatewayFeePaise: 2_360 });
  assert.equal(b.platformFeePaise, 8_000);
  assert.equal(b.creatorNetPaise, 92_000);
  assert.equal(b.platformNetPaise, 5_640);
  assert.equal(b.creatorNetPaise + b.platformNetPaise + b.gatewayFeePaise, b.grossPaise, "ledger sums to gross");
});

test("gateway fee borne by creator when configured", () => {
  const b = computeFeeBreakdown({ source: "STREAMLOUNGE_QR", grossPaise: 100_000, gatewayFeePaise: 2_360, gatewayFeeBearer: "creator" });
  assert.equal(b.creatorNetPaise, 89_640);
  assert.equal(b.platformNetPaise, 8_000);
  assert.equal(b.creatorNetPaise + b.platformNetPaise + b.gatewayFeePaise, b.grossPaise);
});

test("rounding matches Postgres round(): half away from zero, integer paise", () => {
  // 8% of 1,234 paise = 98.72 → 99
  assert.equal(computeFeeBreakdown({ source: "STREAMLOUNGE_QR", grossPaise: 1_234 }).platformFeePaise, 99);
  // 8% of 1,250 paise = 100 exactly
  assert.equal(computeFeeBreakdown({ source: "STREAMLOUNGE_QR", grossPaise: 1_250 }).platformFeePaise, 100);
  assert.equal(computeFeeBreakdown({ source: "STREAMLOUNGE_QR", grossPaise: 3_125 }).platformFeePaise, 250);
  // 8% of 1,231 = 98.48 → 98
  assert.equal(computeFeeBreakdown({ source: "STREAMLOUNGE_QR", grossPaise: 1_231 }).platformFeePaise, 98);
});

test("conservation: fee + creator gross share == gross for many amounts", () => {
  for (let gross = 1; gross <= 20_000; gross += 7) {
    const b = computeFeeBreakdown({ source: "STREAMLOUNGE_QR", grossPaise: gross });
    assert.equal(b.platformFeePaise + b.creatorGrossSharePaise, gross);
    assert.ok(Number.isInteger(b.platformFeePaise));
  }
});

test("rejects bad inputs instead of guessing", () => {
  assert.throws(() => computeFeeBreakdown({ source: "STREAMLOUNGE_QR", grossPaise: 10.5 }));
  assert.throws(() => computeFeeBreakdown({ source: "STREAMLOUNGE_QR", grossPaise: -1 }));
  // @ts-expect-error untrusted source string
  assert.throws(() => computeFeeBreakdown({ source: "FREE", grossPaise: 100 }));
  assert.equal(isPaymentSource("streamlounge_qr"), false);
  assert.equal(isPaymentSource("STREAMLOUNGE_QR"), true);
});

test("refund reversal is proportional to the creator share", () => {
  assert.equal(refundCreatorReversalPaise(92_000, 100_000, 100_000), 92_000);
  assert.equal(refundCreatorReversalPaise(92_000, 50_000, 100_000), 46_000);
  assert.equal(refundCreatorReversalPaise(921, 333, 1_001), 306);
  assert.throws(() => refundCreatorReversalPaise(92_000, 100_001, 100_000));
});
