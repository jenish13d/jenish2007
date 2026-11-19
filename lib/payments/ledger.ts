import type { SupabaseClient } from "@supabase/supabase-js";

import type { RazorpayPayment } from "./razorpay.ts";

/**
 * Ledger writes. Every function here calls a SECURITY DEFINER function in the
 * database (migration 0008) that is executable by the service role only, and
 * each is idempotent on the Razorpay object id, so retries and replays are
 * harmless.
 *
 * The caller must already have fetched the payment from Razorpay and validated
 * it (amount, currency, order, captured status). Nothing here trusts a value
 * that came from a browser.
 */

export type LedgerResult = { ok: true } | { ok: false; error: string; retryable: boolean };

export async function recordCapturedPayment(
  supabase: SupabaseClient,
  args: {
    payment: RazorpayPayment;
    orderId: string;
    creatorId: string;
    interactionType: string;
    viewerUserId?: string | null;
    displayName?: string | null;
    submissionId?: string | null;
  },
): Promise<LedgerResult> {
  const { payment } = args;
  const { error } = await supabase.rpc("sl_record_payment_capture", {
    p_payment_id: payment.id,
    p_order_id: args.orderId,
    p_creator_id: args.creatorId,
    p_interaction_type: args.interactionType,
    p_amount_paise: payment.amount,
    p_currency: payment.currency,
    p_gateway_fee_paise: payment.fee ?? 0,
    p_gateway_tax_paise: payment.tax ?? 0,
    p_method: payment.method,
    p_viewer_user_id: args.viewerUserId ?? null,
    p_display_name: args.displayName ?? null,
    p_submission_id: args.submissionId ?? null,
    p_captured_at: payment.created_at ? new Date(payment.created_at * 1000).toISOString() : null,
  });
  if (error) {
    // 23505 here means "already recorded with different details": a tampering
    // signal, not something a retry fixes.
    const retryable = error.code !== "23505";
    console.error(`[ledger] capture ${payment.id} failed:`, error.code, error.message);
    return { ok: false, error: error.message, retryable };
  }
  return { ok: true };
}

export async function recordRefund(
  supabase: SupabaseClient,
  refund: { id: string; payment_id: string; amount: number; status: string },
): Promise<LedgerResult> {
  const { error } = await supabase.rpc("sl_record_refund", {
    p_refund_id: refund.id,
    p_payment_id: refund.payment_id,
    p_amount_paise: refund.amount,
    p_status: refund.status,
  });
  if (error) {
    const unknown = /unknown payment/.test(error.message);
    console.error(`[ledger] refund ${refund.id} failed:`, error.message);
    return { ok: false, error: error.message, retryable: !unknown };
  }
  return { ok: true };
}

const DISPUTE_TERMINAL = new Set(["won", "lost", "closed"]);

export async function recordDispute(
  supabase: SupabaseClient,
  dispute: { id: string; payment_id: string; amount: number; status: string },
): Promise<LedgerResult> {
  const status = DISPUTE_TERMINAL.has(dispute.status) ? dispute.status : "open";
  const { error } = await supabase.rpc("sl_record_dispute", {
    p_dispute_id: dispute.id,
    p_payment_id: dispute.payment_id,
    p_amount_paise: dispute.amount,
    p_status: status,
  });
  if (error) {
    const unknown = /unknown payment/.test(error.message);
    console.error(`[ledger] dispute ${dispute.id} failed:`, error.message);
    return { ok: false, error: error.message, retryable: !unknown };
  }
  return { ok: true };
}

/**
 * Records a verified webhook delivery by Razorpay's event id. Returns
 * "duplicate" when that event was already processed successfully, so a
 * replayed (or retried-after-success) delivery does nothing.
 */
export async function claimWebhookEvent(
  supabase: SupabaseClient,
  eventId: string,
  event: string,
  payload: unknown,
): Promise<"new" | "duplicate" | "error"> {
  const { error } = await supabase
    .from("webhook_events")
    .insert({ event_id: eventId, event, payload });
  if (!error) return "new";
  if (error.code !== "23505") {
    console.error("[webhook] event log insert failed:", error.message);
    return "error";
  }
  const { data } = await supabase
    .from("webhook_events")
    .select("processed_at")
    .eq("event_id", eventId)
    .maybeSingle();
  return data?.processed_at ? "duplicate" : "new";
}

export async function finishWebhookEvent(
  supabase: SupabaseClient,
  eventId: string,
  outcome: { processed: true } | { processed: false; error: string },
): Promise<void> {
  await supabase
    .from("webhook_events")
    .update(
      outcome.processed
        ? { processed_at: new Date().toISOString(), error: null }
        : { error: outcome.error.slice(0, 500) },
    )
    .eq("event_id", eventId);
}

/** Links a recorded payment to the viewer's submission and display name. */
export async function linkPaymentToSubmission(
  supabase: SupabaseClient,
  paymentId: string,
  submissionId: string,
  displayName: string,
): Promise<void> {
  const { error } = await supabase.rpc("sl_link_payment_submission", {
    p_payment_id: paymentId,
    p_submission_id: submissionId,
    p_display_name: displayName,
  });
  if (error) console.error(`[ledger] link ${paymentId} failed:`, error.message);
}
