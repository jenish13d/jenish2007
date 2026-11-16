import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PAYMENT_TOKEN_TTL_MS,
  generatePaymentToken,
  verifyPaymentToken,
  type PaymentTokenClaims,
} from "../lib/payments/tokens.ts";

/**
 * The payment token is what every paid endpoint accepts as proof of purchase,
 * so these tests cover forgery, tampering, expiry and cross-purpose reuse.
 *
 * Secrets are passed explicitly rather than read from the environment, so the
 * suite needs no configuration and cannot accidentally sign with a real key.
 */

const SECRET = "a".repeat(64);
const OTHER_SECRET = "b".repeat(64);

const CLAIMS: PaymentTokenClaims = {
  paymentId: "pay_TESTPAYMENT001",
  orderId: "order_TESTORDER001",
  creatorId: "11111111-1111-4111-8111-111111111111",
  interactionType: "text",
  amountInPaise: 5000,
};

describe("payment tokens", () => {
  it("round-trips the claims it was signed with", () => {
    const token = generatePaymentToken(CLAIMS, PAYMENT_TOKEN_TTL_MS, 1000, SECRET);
    const result = verifyPaymentToken(token, 2000, SECRET);

    assert.equal(result.valid, true);
    assert.ok(result.valid);
    assert.deepEqual(result.claims, CLAIMS);
  });

  it("carries every signed field in the token itself", () => {
    // The previous format was paymentId.orderId.amount.exp.sig while the
    // signature covered creator and interaction type, so verification had to be
    // told those out of band — in practice, from the request body. A
    // self-describing token removes that opportunity.
    const token = generatePaymentToken(CLAIMS, PAYMENT_TOKEN_TTL_MS, 1000, SECRET);
    assert.equal(token.split(".").length, 7);
    assert.ok(token.includes(CLAIMS.creatorId));
    assert.ok(token.includes(CLAIMS.interactionType));
  });

  it("rejects a token signed with a different key", () => {
    const token = generatePaymentToken(CLAIMS, PAYMENT_TOKEN_TTL_MS, 1000, OTHER_SECRET);
    const result = verifyPaymentToken(token, 2000, SECRET);

    assert.equal(result.valid, false);
    assert.ok(!result.valid);
    assert.match(result.reason, /signature/i);
  });

  it("rejects a tampered creator id", () => {
    const token = generatePaymentToken(CLAIMS, PAYMENT_TOKEN_TTL_MS, 1000, SECRET);
    const parts = token.split(".");
    parts[2] = "22222222-2222-4222-8222-222222222222";

    const result = verifyPaymentToken(parts.join("."), 2000, SECRET);
    assert.ok(!result.valid);
    assert.match(result.reason, /signature/i);
  });

  it("rejects a tampered amount", () => {
    const token = generatePaymentToken(CLAIMS, PAYMENT_TOKEN_TTL_MS, 1000, SECRET);
    const parts = token.split(".");
    parts[4] = "100000";

    const result = verifyPaymentToken(parts.join("."), 2000, SECRET);
    assert.ok(!result.valid);
    assert.match(result.reason, /signature/i);
  });

  it("rejects an extended expiry", () => {
    const token = generatePaymentToken(CLAIMS, 1000, 0, SECRET);
    const parts = token.split(".");
    parts[5] = String(Number(parts[5]) + 10_000_000);

    const result = verifyPaymentToken(parts.join("."), 500, SECRET);
    assert.ok(!result.valid);
    // Re-signing is required to change the expiry, so this fails on signature
    // rather than on time.
    assert.match(result.reason, /signature/i);
  });

  it("rejects an expired token", () => {
    const token = generatePaymentToken(CLAIMS, 1000, 0, SECRET);
    const result = verifyPaymentToken(token, 1001, SECRET);

    assert.ok(!result.valid);
    assert.match(result.reason, /expired/i);
  });

  it("accepts a token right up to its expiry", () => {
    const token = generatePaymentToken(CLAIMS, 1000, 0, SECRET);
    assert.equal(verifyPaymentToken(token, 1000, SECRET).valid, true);
  });

  it("reports a bad signature rather than expiry for a tampered expired token", () => {
    // Order matters: a forged token must read as invalid, not merely stale,
    // otherwise the error distinguishes "well-formed but old" from "forged" and
    // becomes an oracle.
    const token = generatePaymentToken(CLAIMS, 1000, 0, SECRET);
    const parts = token.split(".");
    parts[6] = "0".repeat(64);

    const result = verifyPaymentToken(parts.join("."), 99_999_999, SECRET);
    assert.ok(!result.valid);
    assert.match(result.reason, /signature/i);
  });

  it("rejects malformed tokens", () => {
    for (const bad of [
      "",
      "not-a-token",
      "a.b.c",
      "a.b.c.d.e.f",
      "a.b.c.d.e.f.g.h",
      [
        CLAIMS.paymentId,
        CLAIMS.orderId,
        CLAIMS.creatorId,
        CLAIMS.interactionType,
        "not-a-number",
        "123",
        "0".repeat(64),
      ].join("."),
    ]) {
      const result = verifyPaymentToken(bad, 1000, SECRET);
      assert.equal(result.valid, false, `expected ${JSON.stringify(bad)} to be rejected`);
    }
  });

  it("refuses to sign without a complete set of claims", () => {
    assert.throws(() =>
      generatePaymentToken(
        { ...CLAIMS, creatorId: "" },
        PAYMENT_TOKEN_TTL_MS,
        1000,
        SECRET,
      ),
    );
  });

  it("refuses to sign a non-positive amount", () => {
    assert.throws(() =>
      generatePaymentToken(
        { ...CLAIMS, amountInPaise: 0 },
        PAYMENT_TOKEN_TTL_MS,
        1000,
        SECRET,
      ),
    );
  });
});
