import crypto from "node:crypto";

import { serverEnv } from "../env.ts";
import {
  MAX_AMOUNT_RUPEES,
  type InteractionType,
} from "../interactions/registry.ts";

/**
 * Razorpay REST client and order/payment validation.
 *
 * Everything the application believes about a payment comes from this module
 * querying Razorpay directly. Nothing is taken from the browser.
 */

const API_BASE = "https://api.razorpay.com/v1";

function authHeader(): string {
  const id = serverEnv.razorpayKeyId();
  const secret = serverEnv.razorpayKeySecret();
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

export type GatewayResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; retryable: boolean; notFound?: boolean };

async function gatewayFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<GatewayResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return {
      ok: false,
      error: "Could not reach the payment gateway. Please try again.",
      retryable: true,
    };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    // Upstream error descriptions are logged but not forwarded verbatim: they
    // can carry account-level detail.
    const description =
      (body as { error?: { description?: string } } | null)?.error?.description ??
      `HTTP ${response.status}`;
    console.error(`[razorpay] ${init?.method ?? "GET"} ${path} -> ${description}`);

    if (response.status >= 500) {
      return {
        ok: false,
        error: "The payment gateway is temporarily unavailable. Please retry.",
        retryable: true,
      };
    }
    if (response.status === 404) {
      return {
        ok: false,
        error: "That payment could not be found at the gateway.",
        retryable: false,
        notFound: true,
      };
    }
    return {
      ok: false,
      error: "The payment gateway rejected the request.",
      retryable: false,
    };
  }

  return { ok: true, data: body as T };
}

/* -------------------------------------------------------------------------- */
/* Entities                                                                   */
/* -------------------------------------------------------------------------- */

export interface RazorpayOrderNotes {
  creator_id?: string;
  creator_username?: string;
  interaction_type?: string;
  min_price?: string;
  charged_amount?: string;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  amount_paid: number;
  currency: string;
  status: string;
  receipt: string | null;
  notes: RazorpayOrderNotes | null;
}

export interface RazorpayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  captured: boolean;
  /** Unix seconds. */
  created_at?: number;
}

export function createOrder(params: {
  amountInPaise: number;
  creatorId: string;
  creatorUsername: string;
  interactionType: InteractionType;
  minimumPriceRupees: number;
}): Promise<GatewayResult<RazorpayOrder>> {
  const receipt = `sl_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  return gatewayFetch<RazorpayOrder>("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: params.amountInPaise,
      currency: "INR",
      receipt,
      // These notes are the binding between a payment and what it buys. The
      // verification path treats them as mandatory, so an order created outside
      // this function cannot be redeemed for a submission.
      notes: {
        creator_id: params.creatorId,
        creator_username: params.creatorUsername,
        interaction_type: params.interactionType,
        min_price: String(params.minimumPriceRupees),
        charged_amount: String(Math.round(params.amountInPaise / 100)),
      } satisfies RazorpayOrderNotes,
    }),
  });
}

export function fetchPayment(
  paymentId: string,
): Promise<GatewayResult<RazorpayPayment>> {
  return gatewayFetch<RazorpayPayment>(
    `/payments/${encodeURIComponent(paymentId)}`,
  );
}

export function fetchOrder(
  orderId: string,
): Promise<GatewayResult<RazorpayOrder>> {
  return gatewayFetch<RazorpayOrder>(`/orders/${encodeURIComponent(orderId)}`);
}

export async function fetchCapturedPaymentForOrder(
  orderId: string,
): Promise<GatewayResult<RazorpayPayment | null>> {
  const result = await gatewayFetch<{ items?: RazorpayPayment[] }>(
    `/orders/${encodeURIComponent(orderId)}/payments`,
  );
  if (!result.ok) return result;

  const captured =
    result.data.items?.find((item) => item.status === "captured") ?? null;
  return { ok: true, data: captured };
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export type PaymentValidation =
  | {
      valid: true;
      creatorId: string;
      interactionType: string;
      amountInPaise: number;
    }
  | { valid: false; error: string; retryable: boolean };

/**
 * Validates a captured payment against its order and the order's bound notes.
 *
 * Every check here is mandatory. The original version made the creator and
 * interaction-type checks conditional on the note being present
 * (`if (expectedCreatorId && notes.creator_id && ...)`), so an order carrying no
 * notes passed validation, and the caller then fell back to the creator id from
 * the request body. An attacker who knew any captured payment id and its order
 * id could therefore redeem someone else's payment against a creator of their
 * choosing. A missing note is now a rejection.
 */
export function validateCapturedPayment(
  payment: RazorpayPayment | null,
  order: RazorpayOrder | null,
): PaymentValidation {
  if (!payment) {
    return { valid: false, error: "Payment details are missing.", retryable: false };
  }
  if (!order) {
    return { valid: false, error: "Order details are missing.", retryable: false };
  }

  if (payment.order_id !== order.id) {
    return {
      valid: false,
      error: "That payment does not belong to the order it was presented with.",
      retryable: false,
    };
  }

  if (payment.currency !== "INR" || order.currency !== "INR") {
    return {
      valid: false,
      error: "Only payments in INR are supported.",
      retryable: false,
    };
  }

  if (payment.status === "authorized") {
    return {
      valid: false,
      error: "The payment is authorised but not captured yet. Please retry shortly.",
      retryable: true,
    };
  }

  if (payment.status !== "captured") {
    return {
      valid: false,
      error: "That payment has not been captured.",
      retryable: false,
    };
  }

  if (Number(payment.amount) !== Number(order.amount)) {
    return {
      valid: false,
      error: "The payment amount does not match the order amount.",
      retryable: false,
    };
  }

  const notes = order.notes ?? {};

  if (!notes.creator_id) {
    return {
      valid: false,
      error: "That order was not created by StreamLounge and cannot be redeemed.",
      retryable: false,
    };
  }

  if (!notes.interaction_type) {
    return {
      valid: false,
      error: "That order is not bound to an interaction and cannot be redeemed.",
      retryable: false,
    };
  }

  const amountInPaise = Number(payment.amount);
  if (
    !Number.isInteger(amountInPaise) ||
    amountInPaise <= 0 ||
    amountInPaise > MAX_AMOUNT_RUPEES * 100
  ) {
    return {
      valid: false,
      error: "The payment amount is outside the supported range.",
      retryable: false,
    };
  }

  return {
    valid: true,
    creatorId: notes.creator_id,
    interactionType: notes.interaction_type,
    amountInPaise,
  };
}
