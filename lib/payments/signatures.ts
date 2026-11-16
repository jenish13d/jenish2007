import crypto from "node:crypto";

import { serverEnv } from "../env.ts";

/**
 * HMAC verification for Razorpay signatures.
 *
 * Both comparisons are constant-time. `timingSafeEqual` throws on unequal
 * buffer lengths, so length is checked first — and length is compared on the
 * decoded bytes, not the hex strings, because a non-hex character silently
 * decodes to a shorter buffer and would otherwise make a malformed signature
 * look like a length mismatch rather than a rejection.
 */

function timingSafeHexEqual(a: string, b: string): boolean {
  // A valid hex digest of SHA-256 is exactly 64 characters.
  if (!/^[0-9a-f]{64}$/i.test(a) || !/^[0-9a-f]{64}$/i.test(b)) {
    return false;
  }
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifies the signature Razorpay Checkout returns to the browser.
 *
 * Formula: HMAC_SHA256(order_id + "|" + payment_id, key_secret)
 */
export function verifyCheckoutSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string = serverEnv.razorpayKeySecret(),
): boolean {
  if (!orderId || !paymentId || !signature || !keySecret) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  return timingSafeHexEqual(signature, expected);
}

/**
 * Verifies a Razorpay webhook against the exact bytes of the request body.
 *
 * The raw text must be used; re-serialising the parsed JSON changes key order
 * and whitespace and breaks the digest.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  webhookSecret: string = serverEnv.razorpayWebhookSecret(),
): boolean {
  if (!rawBody || !signature || !webhookSecret) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  return timingSafeHexEqual(signature, expected);
}
