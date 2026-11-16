import crypto from "node:crypto";

import { serverEnv } from "../env.ts";
import type { InteractionType } from "../interactions/registry.ts";

/**
 * Short-lived payment authorisation token.
 *
 * Issued by `/api/payments/verify` once the server has independently confirmed
 * with Razorpay that a payment was captured, and presented to
 * `/api/interactions` or `/api/stickers/generate` as proof. It saves those
 * endpoints a second pair of Razorpay round-trips without ever trusting the
 * client's claim that a payment succeeded.
 *
 * Two changes from the original design:
 *
 *  - The signed payload is bound to creator and interaction type, and the
 *    *encoded* token now carries them too. Previously the token string was
 *    `paymentId.orderId.amount.exp.sig` while the signature covered creator and
 *    interaction type, so verification could only succeed if the caller
 *    independently supplied the right creator — which it took from the request
 *    body. Carrying every signed field makes the token self-describing and
 *    removes the chance of verifying against attacker-chosen context.
 *  - The signing key is required and independent. There is no derivation from
 *    the Razorpay secret and no hardcoded fallback.
 */

export const PAYMENT_TOKEN_TTL_MS = 15 * 60 * 1000;

export interface PaymentTokenClaims {
  paymentId: string;
  orderId: string;
  creatorId: string;
  interactionType: InteractionType;
  amountInPaise: number;
}

const FIELD_SEPARATOR = ".";
const PAYLOAD_SEPARATOR = ":";

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function canonicalPayload(claims: PaymentTokenClaims, exp: number): string {
  // A fixed field order with a separator that cannot appear in any field. UUIDs,
  // Razorpay ids and interaction types are all free of ":".
  return [
    "streamlounge:payment:v2",
    claims.paymentId,
    claims.orderId,
    claims.creatorId,
    claims.interactionType,
    String(claims.amountInPaise),
    String(exp),
  ].join(PAYLOAD_SEPARATOR);
}

export function generatePaymentToken(
  claims: PaymentTokenClaims,
  ttlMs: number = PAYMENT_TOKEN_TTL_MS,
  now: number = Date.now(),
  secret: string = serverEnv.paymentSigningSecret(),
): string {
  for (const [field, value] of Object.entries(claims)) {
    if (value === undefined || value === null || value === "") {
      throw new Error(`Cannot sign a payment token without ${field}.`);
    }
  }
  if (!Number.isInteger(claims.amountInPaise) || claims.amountInPaise <= 0) {
    throw new Error("Cannot sign a payment token with a non-positive amount.");
  }

  const exp = now + ttlMs;
  const signature = sign(canonicalPayload(claims, exp), secret);

  return [
    claims.paymentId,
    claims.orderId,
    claims.creatorId,
    claims.interactionType,
    String(claims.amountInPaise),
    String(exp),
    signature,
  ].join(FIELD_SEPARATOR);
}

export type PaymentTokenVerification =
  | { valid: true; claims: PaymentTokenClaims; expiresAt: number }
  | { valid: false; reason: string };

/**
 * Verifies a token and returns the claims it carries.
 *
 * The caller then checks those claims against what it is about to do. It must
 * not take the creator or amount from the request body and feed them in here as
 * "expected" values — the token is the authority, the body is not.
 */
export function verifyPaymentToken(
  token: string,
  now: number = Date.now(),
  secret: string = serverEnv.paymentSigningSecret(),
): PaymentTokenVerification {
  if (!token || typeof token !== "string") {
    return { valid: false, reason: "Missing payment token." };
  }

  const parts = token.split(FIELD_SEPARATOR);
  if (parts.length !== 7) {
    return { valid: false, reason: "Malformed payment token." };
  }

  const [paymentId, orderId, creatorId, interactionType, amountStr, expStr, signature] =
    parts;

  const amountInPaise = Number(amountStr);
  const exp = Number(expStr);

  if (!Number.isInteger(amountInPaise) || amountInPaise <= 0) {
    return { valid: false, reason: "Malformed payment token amount." };
  }
  if (!Number.isFinite(exp)) {
    return { valid: false, reason: "Malformed payment token expiry." };
  }

  const claims: PaymentTokenClaims = {
    paymentId,
    orderId,
    creatorId,
    interactionType: interactionType as InteractionType,
    amountInPaise,
  };

  // Signature is checked before expiry so that a tampered token is reported as
  // invalid rather than as merely expired.
  const expected = sign(canonicalPayload(claims, exp), secret);
  let signatureOk = false;
  if (/^[0-9a-f]{64}$/i.test(signature)) {
    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(expected, "hex");
    signatureOk = a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  if (!signatureOk) {
    return { valid: false, reason: "Invalid payment token signature." };
  }

  if (now > exp) {
    return { valid: false, reason: "Payment token has expired." };
  }

  return { valid: true, claims, expiresAt: exp };
}
