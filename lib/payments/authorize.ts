import type { SupabaseClient } from "@supabase/supabase-js";

import {
  fetchOrder,
  fetchPayment,
  validateCapturedPayment,
} from "./razorpay.ts";
import { verifyPaymentToken, type PaymentTokenClaims } from "./tokens.ts";
import type { InteractionType } from "../interactions/registry.ts";

/**
 * Turns a client-presented payment token into trusted claims.
 *
 * There is exactly one accepted path: a valid, unexpired token signed by this
 * server. The token is only ever issued by `/api/payments/verify`, after that
 * route has independently asked Razorpay whether the payment was captured.
 *
 * What was removed, and why it mattered
 * -------------------------------------
 * The original routes accepted a token OR, failing that, fell through to
 * "signature if present, then fetch the payment from Razorpay and accept it".
 * Two problems compounded there:
 *
 *   - The signature check was conditional on the client having supplied a
 *     signature. Omit the field and the branch was skipped entirely.
 *   - Fetching a payment by id proves only that the payment exists and was
 *     captured. It does not prove the person presenting it is the person who
 *     made it. Combined with the then-optional order-notes binding, anyone who
 *     learned a captured payment id and its order id could redeem it.
 *
 * So the fallback accepted a bare pair of identifiers as proof of payment. It
 * is gone. A caller without a token must go through `/api/payments/verify`,
 * which requires the checkout signature — something only Razorpay can produce
 * for the paying browser.
 */

export type PaymentAuthorization =
  | { ok: true; claims: PaymentTokenClaims }
  | { ok: false; reason: string; status: "forbidden" | "bad_request" };

export function authorizePaymentToken(
  token: string,
  expected: {
    interactionType?: InteractionType;
    creatorId?: string;
  } = {},
): PaymentAuthorization {
  const verification = verifyPaymentToken(token);

  if (!verification.valid) {
    return {
      ok: false,
      reason: verification.reason,
      status: "forbidden",
    };
  }

  const { claims } = verification;

  // The token's own claims are authoritative. These checks exist so a token
  // issued for one purpose cannot be spent on another — a text-message payment
  // redeemed against the AI sticker endpoint, for instance.
  if (expected.interactionType && claims.interactionType !== expected.interactionType) {
    return {
      ok: false,
      reason: "That payment was made for a different kind of interaction.",
      status: "forbidden",
    };
  }

  if (expected.creatorId && claims.creatorId !== expected.creatorId) {
    return {
      ok: false,
      reason: "That payment was made for a different creator.",
      status: "forbidden",
    };
  }

  return { ok: true, claims };
}

/**
 * Re-confirms a payment directly with Razorpay.
 *
 * Used by the webhook, which has no token, and available as a defence-in-depth
 * check elsewhere. Unlike the removed fallback above, this is never used to
 * authorise a *client* request — the webhook's authorisation comes from its
 * HMAC signature over the raw body.
 */
export async function confirmPaymentWithGateway(paymentId: string, orderId: string) {
  const [paymentResult, orderResult] = await Promise.all([
    fetchPayment(paymentId),
    fetchOrder(orderId),
  ]);

  if (!paymentResult.ok) {
    return {
      ok: false as const,
      error: paymentResult.error,
      retryable: paymentResult.retryable,
    };
  }
  if (!orderResult.ok) {
    return {
      ok: false as const,
      error: orderResult.error,
      retryable: orderResult.retryable,
    };
  }

  const validation = validateCapturedPayment(paymentResult.data, orderResult.data);
  if (!validation.valid) {
    return {
      ok: false as const,
      error: validation.error,
      retryable: validation.retryable,
    };
  }

  return {
    ok: true as const,
    creatorId: validation.creatorId,
    interactionType: validation.interactionType,
    amountInPaise: validation.amountInPaise,
    payment: paymentResult.data,
    order: orderResult.data,
  };
}

/**
 * Claims a single-use AI generation for a payment.
 *
 * Inserts the ledger row *before* the billable upstream call, so a replay loses
 * the race against the primary key rather than against a wall-clock check. The
 * caller releases the claim if the upstream call fails, so a viewer is not
 * charged for a generation that never happened.
 */
export async function claimAiGeneration(
  supabase: SupabaseClient,
  paymentId: string,
  kind: "stickers" | "tts",
  creatorId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("claim_ai_generation", {
    p_razorpay_payment_id: paymentId,
    p_kind: kind,
    p_creator_id: creatorId,
  });

  if (error) {
    console.error("[payments] AI claim failed:", error.message);
    return false;
  }
  return data === true;
}

/** Releases a claim after an upstream failure, so the viewer can retry. */
export async function releaseAiGeneration(
  supabase: SupabaseClient,
  paymentId: string,
  kind: "stickers" | "tts",
): Promise<void> {
  const { error } = await supabase
    .from("ai_generation_claims")
    .delete()
    .eq("razorpay_payment_id", paymentId)
    .eq("kind", kind);

  if (error) {
    // Not fatal: the viewer loses the retry, which is the safe direction to
    // fail. Logged so it can be reconciled.
    console.error("[payments] AI claim release failed:", error.message);
  }
}
