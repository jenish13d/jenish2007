import { isPaymentSource } from "./fees.ts";

/**
 * Parsing for webhooks sent by a creator's OWN Razorpay account (the payment
 * link they put in a YouTube/Twitch description). These payments carry a 0%
 * StreamLounge commission and are recorded for reporting only; they never enter
 * the platform ledger.
 */

export const EXTERNAL_WEBHOOK_AAD = (creatorId: string) => `external-webhook:${creatorId}`;

export interface ExternalCapture {
  id: string;
  amountPaise: number;
  currency: string;
  gatewayFeePaise: number;
  capturedAt: string;
  payerLabel: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isCreatorId(value: string): boolean {
  return UUID.test(value);
}

/**
 * Extracts a captured payment from a verified Razorpay webhook body. Returns
 * null for any event that is not a successful capture, or that is malformed.
 * The caller must have verified the signature first.
 */
export function parseExternalCapture(body: unknown): ExternalCapture | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { event?: unknown; payload?: { payment?: { entity?: Record<string, unknown> } } };
  if (b.event !== "payment.captured") return null;
  const e = b.payload?.payment?.entity;
  if (!e) return null;
  const id = typeof e.id === "string" ? e.id : "";
  const amount = Number(e.amount);
  const fee = Number(e.fee ?? 0);
  const created = Number(e.created_at);
  if (!/^pay_[A-Za-z0-9]+$/.test(id) || id.length > 40) return null;
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  if (e.status !== "captured") return null;
  // A source note can never upgrade an external payment into a platform one.
  const notes = (e.notes ?? {}) as Record<string, unknown>;
  if (isPaymentSource(notes.payment_source) && notes.payment_source === "STREAMLOUNGE_QR") return null;
  const rawName = typeof notes.name === "string" ? notes.name : typeof notes.alias === "string" ? notes.alias : null;
  const payerLabel = rawName
    ? rawName.replace(/[<>{}`\\\u0000-\u001f]/g, "").trim().slice(0, 40) || null
    : null;
  return {
    id,
    amountPaise: amount,
    currency: typeof e.currency === "string" ? e.currency.toUpperCase().slice(0, 3) : "INR",
    gatewayFeePaise: Number.isSafeInteger(fee) && fee >= 0 ? fee : 0,
    capturedAt: new Date((Number.isFinite(created) && created > 0 ? created : Date.now() / 1000) * 1000).toISOString(),
    payerLabel,
  };
}
