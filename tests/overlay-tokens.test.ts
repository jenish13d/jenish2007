import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";

import {
  canTransitionFromProcessing,
  generateOverlayKey,
  generateOverlayToken,
  isEligibleForOverlayQueue,
  overlayKeyMatches,
  verifyOverlayToken,
} from "../lib/overlay/tokens.ts";

const SECRET = "c".repeat(64);
const OTHER_SECRET = "d".repeat(64);

const SUBMISSION = "33333333-3333-4333-8333-333333333333";
const CREATOR = "44444444-4444-4444-8444-444444444444";
const OTHER_CREATOR = "55555555-5555-4555-8555-555555555555";

describe("overlay keys", () => {
  it("generates keys with at least 128 bits of entropy", () => {
    const key = generateOverlayKey();
    // 32 random bytes, base64url: 43 characters with no padding.
    assert.ok(key.length >= 43, `key too short: ${key.length}`);
    assert.match(key, /^[A-Za-z0-9_-]+$/);
  });

  it("generates distinct keys", () => {
    const keys = new Set(Array.from({ length: 200 }, () => generateOverlayKey()));
    assert.equal(keys.size, 200);
  });

  it("matches a key against itself and rejects anything else", () => {
    const key = generateOverlayKey();
    assert.equal(overlayKeyMatches(key, key), true);
    assert.equal(overlayKeyMatches(key, generateOverlayKey()), false);
    assert.equal(overlayKeyMatches(key, `${key}x`), false);
    assert.equal(overlayKeyMatches(key.slice(0, -1), key), false);
  });

  it("rejects absent keys rather than treating them as equal", () => {
    // Two creators with no key must not authenticate as each other, which is
    // what a naive `a === b` on two nulls would do.
    assert.equal(overlayKeyMatches(null, null), false);
    assert.equal(overlayKeyMatches("", ""), false);
    assert.equal(overlayKeyMatches(undefined, generateOverlayKey()), false);
    assert.equal(overlayKeyMatches(generateOverlayKey(), null), false);
  });
});

describe("overlay playback tokens", () => {
  it("verifies a token against the submission and creator it was issued for", () => {
    const token = generateOverlayToken(SUBMISSION, CREATOR, 60_000, 0, SECRET);
    const result = verifyOverlayToken(token, SUBMISSION, CREATOR, 1000, SECRET);

    assert.ok(result.valid);
    assert.equal(result.submissionId, SUBMISSION);
    assert.equal(result.creatorId, CREATOR);
  });

  it("rejects a token presented for a different submission", () => {
    const token = generateOverlayToken(SUBMISSION, CREATOR, 60_000, 0, SECRET);
    const result = verifyOverlayToken(
      token,
      "66666666-6666-4666-8666-666666666666",
      CREATOR,
      1000,
      SECRET,
    );

    assert.ok(!result.valid);
    assert.match(result.reason, /different submission/i);
  });

  it("rejects a token presented for a different creator", () => {
    // This is the cross-account check: a token issued to one creator's overlay
    // must not complete another creator's event.
    const token = generateOverlayToken(SUBMISSION, CREATOR, 60_000, 0, SECRET);
    const result = verifyOverlayToken(token, SUBMISSION, OTHER_CREATOR, 1000, SECRET);

    assert.ok(!result.valid);
    assert.match(result.reason, /different creator/i);
  });

  it("rejects a forged signature", () => {
    const token = generateOverlayToken(SUBMISSION, CREATOR, 60_000, 0, SECRET);
    const parts = token.split(".");
    parts[3] = crypto.randomBytes(32).toString("hex");

    const result = verifyOverlayToken(parts.join("."), SUBMISSION, CREATOR, 1000, SECRET);
    assert.ok(!result.valid);
    assert.match(result.reason, /signature/i);
  });

  it("rejects a token signed with the payment key", () => {
    // The overlay and payment signing keys are independent, so a token from one
    // subsystem cannot be replayed into the other.
    const token = generateOverlayToken(SUBMISSION, CREATOR, 60_000, 0, OTHER_SECRET);
    const result = verifyOverlayToken(token, SUBMISSION, CREATOR, 1000, SECRET);

    assert.ok(!result.valid);
    assert.match(result.reason, /signature/i);
  });

  it("rejects a token whose creator was swapped in the encoded form", () => {
    const token = generateOverlayToken(SUBMISSION, CREATOR, 60_000, 0, SECRET);
    const parts = token.split(".");
    parts[1] = OTHER_CREATOR;

    const result = verifyOverlayToken(
      parts.join("."),
      SUBMISSION,
      OTHER_CREATOR,
      1000,
      SECRET,
    );
    assert.ok(!result.valid);
    assert.match(result.reason, /signature/i);
  });

  it("rejects an expired token", () => {
    const token = generateOverlayToken(SUBMISSION, CREATOR, 1000, 0, SECRET);
    const result = verifyOverlayToken(token, SUBMISSION, CREATOR, 1001, SECRET);

    assert.ok(!result.valid);
    assert.match(result.reason, /expired/i);
  });

  it("rejects malformed tokens", () => {
    for (const bad of ["", "x", "a.b.c", "a.b.c.d.e"]) {
      assert.equal(
        verifyOverlayToken(bad, SUBMISSION, CREATOR, 1000, SECRET).valid,
        false,
      );
    }
  });

  it("refuses to sign without a submission or creator", () => {
    assert.throws(() => generateOverlayToken("", CREATOR, 60_000, 0, SECRET));
    assert.throws(() => generateOverlayToken(SUBMISSION, "", 60_000, 0, SECRET));
  });
});

describe("overlay queue eligibility", () => {
  it("queues only paid, pending submissions", () => {
    assert.equal(
      isEligibleForOverlayQueue({ payment_status: "paid", status: "pending" }),
      true,
    );
    // An unpaid submission must never reach the stream.
    assert.equal(
      isEligibleForOverlayQueue({ payment_status: "pending", status: "pending" }),
      false,
    );
    assert.equal(
      isEligibleForOverlayQueue({ payment_status: "failed", status: "pending" }),
      false,
    );
    // Nor may an already-played one be replayed.
    assert.equal(
      isEligibleForOverlayQueue({ payment_status: "paid", status: "completed" }),
      false,
    );
    assert.equal(
      isEligibleForOverlayQueue({ payment_status: "paid", status: "processing" }),
      false,
    );
  });
});

describe("overlay state transitions", () => {
  it("allows a processing submission belonging to the creator", () => {
    const result = canTransitionFromProcessing(
      { status: "processing", creator_id: CREATOR },
      CREATOR,
    );
    assert.equal(result.allowed, true);
  });

  it("refuses a submission belonging to another creator", () => {
    const result = canTransitionFromProcessing(
      { status: "processing", creator_id: OTHER_CREATOR },
      CREATOR,
    );
    assert.equal(result.allowed, false);
    assert.match(result.reason ?? "", /another creator/i);
  });

  it("refuses a replayed completion", () => {
    // The second report for the same event finds it already completed.
    const result = canTransitionFromProcessing(
      { status: "completed", creator_id: CREATOR },
      CREATOR,
    );
    assert.equal(result.allowed, false);
  });

  it("refuses a pending submission that was never claimed", () => {
    const result = canTransitionFromProcessing(
      { status: "pending", creator_id: CREATOR },
      CREATOR,
    );
    assert.equal(result.allowed, false);
  });

  it("refuses a missing submission", () => {
    assert.equal(canTransitionFromProcessing(null, CREATOR).allowed, false);
  });
});
