import assert from "node:assert/strict";
import { test } from "node:test";

import { isCreatorId, parseExternalCapture } from "../lib/payments/external.ts";

const capture = (entity: Record<string, unknown>, event = "payment.captured") => ({
  event,
  payload: { payment: { entity: { id: "pay_Ext1", amount: 50000, currency: "inr", status: "captured", created_at: 1_790_000_000, fee: 1180, ...entity } } },
});

test("parses a captured payment from the creator's own Razorpay account", () => {
  const c = parseExternalCapture(capture({ notes: { name: "Asha <b>" } }));
  assert.ok(c);
  assert.equal(c.amountPaise, 50000);
  assert.equal(c.currency, "INR");
  assert.equal(c.gatewayFeePaise, 1180);
  assert.equal(c.payerLabel, "Asha b");
});

test("ignores non-capture events and malformed payloads", () => {
  assert.equal(parseExternalCapture(capture({}, "payment.authorized")), null);
  assert.equal(parseExternalCapture(capture({ status: "failed" })), null);
  assert.equal(parseExternalCapture(capture({ amount: -5 })), null);
  assert.equal(parseExternalCapture(capture({ id: "order_1" })), null);
  assert.equal(parseExternalCapture(null), null);
});

test("a note cannot turn an external payment into a platform QR payment", () => {
  assert.equal(parseExternalCapture(capture({ notes: { payment_source: "STREAMLOUNGE_QR" } })), null);
});

test("creator ids must be UUIDs", () => {
  assert.equal(isCreatorId("11111111-1111-1111-1111-111111111111"), true);
  assert.equal(isCreatorId("../admin"), false);
});
