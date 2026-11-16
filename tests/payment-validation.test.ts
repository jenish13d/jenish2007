import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";

import {
  validateCapturedPayment,
  type RazorpayOrder,
  type RazorpayPayment,
} from "../lib/payments/razorpay.ts";
import {
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from "../lib/payments/signatures.ts";
import { validateAmount, effectiveMinimum } from "../lib/payments/pricing.ts";

const KEY_SECRET = "razorpay_test_secret_value";

const ORDER: RazorpayOrder = {
  id: "order_TESTORDER001",
  amount: 5000,
  amount_paid: 5000,
  currency: "INR",
  status: "paid",
  receipt: "sl_1",
  notes: {
    creator_id: "77777777-7777-4777-8777-777777777777",
    creator_username: "testcreator",
    interaction_type: "text",
    min_price: "10",
    charged_amount: "50",
  },
};

const PAYMENT: RazorpayPayment = {
  id: "pay_TESTPAYMENT001",
  order_id: ORDER.id,
  amount: 5000,
  currency: "INR",
  status: "captured",
  method: "upi",
  captured: true,
};

function checkoutSignature(orderId: string, paymentId: string, secret = KEY_SECRET) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

describe("checkout signature verification", () => {
  it("accepts the signature Razorpay produces", () => {
    const signature = checkoutSignature(ORDER.id, PAYMENT.id);
    assert.equal(
      verifyCheckoutSignature(ORDER.id, PAYMENT.id, signature, KEY_SECRET),
      true,
    );
  });

  it("rejects a signature for a different order", () => {
    const signature = checkoutSignature("order_SOMETHINGELSE", PAYMENT.id);
    assert.equal(
      verifyCheckoutSignature(ORDER.id, PAYMENT.id, signature, KEY_SECRET),
      false,
    );
  });

  it("rejects a signature made with the wrong secret", () => {
    const signature = checkoutSignature(ORDER.id, PAYMENT.id, "wrong_secret");
    assert.equal(
      verifyCheckoutSignature(ORDER.id, PAYMENT.id, signature, KEY_SECRET),
      false,
    );
  });

  it("rejects non-hex, truncated and empty signatures without throwing", () => {
    // timingSafeEqual throws on unequal buffer lengths, so these must be
    // length-checked on the decoded bytes before comparison.
    for (const bad of [
      "",
      "zzzz",
      "deadbeef",
      "0".repeat(63),
      "0".repeat(65),
      "g".repeat(64),
    ]) {
      assert.equal(
        verifyCheckoutSignature(ORDER.id, PAYMENT.id, bad, KEY_SECRET),
        false,
        `expected ${JSON.stringify(bad)} to be rejected`,
      );
    }
  });

  it("rejects missing identifiers", () => {
    const signature = checkoutSignature(ORDER.id, PAYMENT.id);
    assert.equal(verifyCheckoutSignature("", PAYMENT.id, signature, KEY_SECRET), false);
    assert.equal(verifyCheckoutSignature(ORDER.id, "", signature, KEY_SECRET), false);
  });
});

describe("webhook signature verification", () => {
  const body = JSON.stringify({ event: "payment.captured", payload: {} });

  it("accepts a signature over the exact raw body", () => {
    const signature = crypto
      .createHmac("sha256", "webhook_secret")
      .update(body)
      .digest("hex");
    assert.equal(verifyWebhookSignature(body, signature, "webhook_secret"), true);
  });

  it("rejects a signature over re-serialised JSON", () => {
    // Re-serialising changes key order and whitespace, which is why the route
    // must verify the raw text rather than the parsed object.
    const signature = crypto
      .createHmac("sha256", "webhook_secret")
      .update(body)
      .digest("hex");
    const reserialised = JSON.stringify(JSON.parse(body), null, 2);
    assert.equal(
      verifyWebhookSignature(reserialised, signature, "webhook_secret"),
      false,
    );
  });

  it("rejects an empty body or signature", () => {
    assert.equal(verifyWebhookSignature("", "0".repeat(64), "s"), false);
    assert.equal(verifyWebhookSignature(body, "", "s"), false);
  });
});

describe("captured payment validation", () => {
  it("accepts a captured payment bound to its order", () => {
    const result = validateCapturedPayment(PAYMENT, ORDER);
    assert.equal(result.valid, true);
    assert.ok(result.valid);
    assert.equal(result.creatorId, ORDER.notes?.creator_id);
    assert.equal(result.interactionType, "text");
    assert.equal(result.amountInPaise, 5000);
  });

  it("rejects a payment belonging to a different order", () => {
    const result = validateCapturedPayment(
      { ...PAYMENT, order_id: "order_SOMETHINGELSE" },
      ORDER,
    );
    assert.ok(!result.valid);
    assert.match(result.error, /does not belong/i);
  });

  it("rejects an order with no creator binding", () => {
    // This is the central fix. The previous implementation only compared the
    // creator note when it was present, so an order carrying no notes passed
    // validation and the caller fell back to the creator id in the request
    // body — letting anyone who knew a captured payment id redeem it against a
    // creator of their choosing.
    const result = validateCapturedPayment(PAYMENT, { ...ORDER, notes: null });
    assert.ok(!result.valid);
    assert.match(result.error, /not created by StreamLounge/i);
  });

  it("rejects an order with no interaction binding", () => {
    const result = validateCapturedPayment(PAYMENT, {
      ...ORDER,
      notes: { creator_id: ORDER.notes?.creator_id },
    });
    assert.ok(!result.valid);
    assert.match(result.error, /not bound to an interaction/i);
  });

  it("rejects an uncaptured payment, and marks authorised ones retryable", () => {
    const authorised = validateCapturedPayment(
      { ...PAYMENT, status: "authorized" },
      ORDER,
    );
    assert.ok(!authorised.valid);
    assert.equal(authorised.retryable, true);

    const failed = validateCapturedPayment({ ...PAYMENT, status: "failed" }, ORDER);
    assert.ok(!failed.valid);
    assert.equal(failed.retryable, false);
  });

  it("rejects a currency other than INR", () => {
    const result = validateCapturedPayment(
      { ...PAYMENT, currency: "USD" },
      { ...ORDER, currency: "USD" },
    );
    assert.ok(!result.valid);
    assert.match(result.error, /INR/);
  });

  it("rejects an amount that disagrees with the order", () => {
    const result = validateCapturedPayment({ ...PAYMENT, amount: 100 }, ORDER);
    assert.ok(!result.valid);
    assert.match(result.error, /amount/i);
  });

  it("rejects an amount beyond the supported ceiling", () => {
    const huge = 500_001 * 100;
    const result = validateCapturedPayment(
      { ...PAYMENT, amount: huge },
      { ...ORDER, amount: huge },
    );
    assert.ok(!result.valid);
    assert.match(result.error, /range/i);
  });

  it("rejects missing entities", () => {
    assert.equal(validateCapturedPayment(null, ORDER).valid, false);
    assert.equal(validateCapturedPayment(PAYMENT, null).valid, false);
  });
});

describe("amount validation", () => {
  it("accepts a whole rupee amount at or above the minimum", () => {
    const result = validateAmount(50, 50);
    assert.ok(result.valid);
    assert.equal(result.rupees, 50);
    assert.equal(result.paise, 5000);
  });

  it("rejects an amount below the minimum", () => {
    const result = validateAmount(49, 50);
    assert.ok(!result.valid);
    assert.match(result.error, /minimum/i);
  });

  it("rejects fractional, zero, negative and non-numeric amounts", () => {
    for (const bad of [10.5, 0, -10, "abc", null, undefined, NaN, Infinity, {}]) {
      assert.equal(
        validateAmount(bad, 10).valid,
        false,
        `expected ${JSON.stringify(bad)} to be rejected`,
      );
    }
  });

  it("rejects an amount above the ceiling", () => {
    assert.equal(validateAmount(500_001, 10).valid, false);
    assert.equal(validateAmount(500_000, 10).valid, true);
  });

  it("takes the higher of the creator price and the platform floor", () => {
    assert.equal(effectiveMinimum(10, 25), 25);
    assert.equal(effectiveMinimum(40, 25), 40);
  });
});
