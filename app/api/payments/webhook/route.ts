import { NextResponse } from "next/server";

import { integrationStatus, serverEnv } from "@/lib/env";
import { withErrorHandling } from "@/lib/http/responses";
import { isInteractionType } from "@/lib/interactions/registry";
import {
  fetchCapturedPaymentForOrder,
  fetchOrder,
  fetchPayment,
  validateCapturedPayment,
} from "@/lib/payments/razorpay";
import {
  claimWebhookEvent,
  finishWebhookEvent,
  recordCapturedPayment,
  recordDispute,
  recordRefund,
} from "@/lib/payments/ledger";
import { verifyWebhookSignature } from "@/lib/payments/signatures";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import {
  findSubmissionIdByPayment,
  insertPaidSubmission,
} from "@/lib/submissions/repository";

/**
 * Razorpay webhook.
 *
 * This is the safety net for a viewer who paid and then closed the tab before
 * the browser could call `/api/payments/verify` and `/api/interactions`. It
 * recovers the payment into a submission so the creator is not left with money
 * and no alert.
 *
 * The bug this route previously had
 * ---------------------------------
 * It built a cookie-backed Supabase client. Razorpay sends no cookies, so that
 * client ran as `anon`, and its insert into `creator_submissions` either failed
 * under RLS or depended on `anon` holding write access to the submissions
 * table. Either way the recovery path did not work as written. It now uses the
 * service-role client, which is the correct tool for a request with no user
 * session, and `anon` has been stripped of all access to that table in
 * migration 0004.
 *
 * Idempotency
 * -----------
 * Razorpay retries until it gets a 2xx. Recovery is idempotent by virtue of the
 * unique index on the payment id: a retry hits the constraint and is reported
 * as already-processed with a 200, so Razorpay stops. Transient failures return
 * 5xx deliberately, because those are the cases where a retry should happen.
 */

export const dynamic = "force-dynamic";

/**
 * How long a fresh payment is left for the viewer's browser to submit.
 *
 * Razorpay usually delivers `payment.captured` within seconds, which is before
 * the browser has called /api/interactions (AI stickers take 10-30 seconds to
 * generate first). Recovering immediately inserted a placeholder alert and the
 * viewer's real message was then rejected as a duplicate. Inside this window
 * the webhook answers 503 so Razorpay retries later; by then the browser has
 * normally submitted and the retry is a no-op.
 */
const RECOVERY_GRACE_MS = 10 * 60 * 1000;

/** Health probe. Reports configuration without revealing any secret. */
export async function GET() {
  const status = integrationStatus();
  const ready = status.razorpayWebhook && status.serviceRole && status.razorpay;

  return NextResponse.json(
    {
      endpoint: "/api/payments/webhook",
      status: ready ? "healthy" : "unconfigured",
      webhook_secret_configured: status.razorpayWebhook,
      service_role_configured: status.serviceRole,
      razorpay_keys_configured: status.razorpay,
    },
    { status: ready ? 200 : 503 },
  );
}

type WebhookPayload = {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string } };
    order?: { entity?: { id?: string } };
    refund?: { entity?: { id?: string; payment_id?: string; amount?: number; status?: string } };
    dispute?: { entity?: { id?: string; payment_id?: string; amount?: number; status?: string } };
  };
};

const CAPTURE_EVENTS = new Set(["payment.captured", "order.paid"]);
const REFUND_EVENTS = new Set(["refund.processed"]);
const DISPUTE_EVENTS = new Set([
  "payment.dispute.created",
  "payment.dispute.under_review",
  "payment.dispute.action_required",
  "payment.dispute.won",
  "payment.dispute.lost",
  "payment.dispute.closed",
]);

export const POST = withErrorHandling("payments/webhook", async (request: Request) => {
  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) {
    return NextResponse.json(
      { status: "rejected", reason: "missing_signature" },
      { status: 400 },
    );
  }

  // The raw bytes, verbatim. Re-serialising parsed JSON changes key order and
  // whitespace and invalidates the digest.
  const rawBody = await request.text();
  if (rawBody.length > 256 * 1024) {
    return NextResponse.json(
      { status: "rejected", reason: "payload_too_large" },
      { status: 413 },
    );
  }

  if (!verifyWebhookSignature(rawBody, signature, serverEnv.razorpayWebhookSecret())) {
    console.warn("[webhook] signature verification failed");
    return NextResponse.json(
      { status: "rejected", reason: "invalid_signature" },
      { status: 400 },
    );
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return NextResponse.json(
      { status: "rejected", reason: "invalid_json" },
      { status: 400 },
    );
  }

  const event = payload.event ?? "";
  if (!CAPTURE_EVENTS.has(event) && !REFUND_EVENTS.has(event) && !DISPUTE_EVENTS.has(event)) {
    // A 200 here tells Razorpay not to retry an event we simply do not act on.
    return NextResponse.json({ status: "ignored", event: event || null });
  }

  // Replay protection: Razorpay sends a unique id per event. A signed body
  // replayed later carries the same id and is acknowledged without effect.
  const eventId = request.headers.get("x-razorpay-event-id");
  if (!eventId || eventId.length > 100) {
    return NextResponse.json({ status: "rejected", reason: "missing_event_id" }, { status: 400 });
  }
  const db = getSupabaseServiceClient();
  const claim = await claimWebhookEvent(db, eventId, event, payload);
  if (claim === "duplicate") {
    return NextResponse.json({ status: "ok", replay: true });
  }
  if (claim === "error") {
    return NextResponse.json({ status: "deferred", reason: "database_unavailable" }, { status: 503 });
  }

  const response = await handleEvent(event, payload);
  await finishWebhookEvent(
    db,
    eventId,
    response.status < 500
      ? { processed: true }
      : { processed: false, error: `HTTP ${response.status}` },
  );
  return response;
});

async function handleEvent(event: string, payload: WebhookPayload): Promise<NextResponse> {
  const supabase = getSupabaseServiceClient();

  if (REFUND_EVENTS.has(event)) {
    const r = payload.payload?.refund?.entity;
    if (!r?.id || !r.payment_id || !r.amount) {
      return NextResponse.json({ status: "rejected", reason: "missing_refund" });
    }
    const result = await recordRefund(supabase, {
      id: r.id, payment_id: r.payment_id, amount: r.amount, status: r.status ?? "processed",
    });
    if (!result.ok) {
      return result.retryable
        ? NextResponse.json({ status: "deferred", reason: "ledger_unavailable" }, { status: 503 })
        : NextResponse.json({ status: "ignored", reason: "unknown_payment" });
    }
    return NextResponse.json({ status: "ok", refund: r.id });
  }

  if (DISPUTE_EVENTS.has(event)) {
    const d = payload.payload?.dispute?.entity;
    if (!d?.id || !d.payment_id || !d.amount) {
      return NextResponse.json({ status: "rejected", reason: "missing_dispute" });
    }
    const result = await recordDispute(supabase, {
      id: d.id, payment_id: d.payment_id, amount: d.amount, status: d.status ?? "open",
    });
    if (!result.ok) {
      return result.retryable
        ? NextResponse.json({ status: "deferred", reason: "ledger_unavailable" }, { status: 503 })
        : NextResponse.json({ status: "ignored", reason: "unknown_payment" });
    }
    return NextResponse.json({ status: "ok", dispute: d.id });
  }

  let paymentId =
    payload.payload?.payment?.entity?.id ?? null;
  const orderId =
    payload.payload?.payment?.entity?.order_id ??
    payload.payload?.order?.entity?.id ??
    null;

  if (!orderId) {
    return NextResponse.json(
      { status: "rejected", reason: "missing_order_id" },
      { status: 400 },
    );
  }

  // `order.paid` need not carry a payment entity. Ask Razorpay which payment
  // actually captured against the order rather than assuming one.
  if (!paymentId) {
    const lookup = await fetchCapturedPaymentForOrder(orderId);
    if (!lookup.ok) {
      // Transient: 5xx so Razorpay retries.
      return NextResponse.json(
        { status: "deferred", reason: "gateway_unavailable" },
        { status: 503 },
      );
    }
    paymentId = lookup.data?.id ?? null;
  }

  if (!paymentId) {
    // Paid order with no captured payment yet. Nothing to record, and nothing
    // Razorpay should retry — the eventual payment.captured will arrive.
    return NextResponse.json({ status: "pending_capture" });
  }

  const [paymentResult, orderResult] = await Promise.all([
    fetchPayment(paymentId),
    fetchOrder(orderId),
  ]);

  if (!paymentResult.ok || !orderResult.ok) {
    const notFound =
      (!paymentResult.ok && paymentResult.notFound) ||
      (!orderResult.ok && orderResult.notFound);
    if (notFound) {
      // A signed webhook naming entities Razorpay does not have is not
      // something a retry fixes.
      return NextResponse.json({ status: "rejected", reason: "unknown_entity" });
    }
    return NextResponse.json(
      { status: "deferred", reason: "gateway_unavailable" },
      { status: 503 },
    );
  }

  const validation = validateCapturedPayment(paymentResult.data, orderResult.data);
  if (!validation.valid) {
    if (validation.retryable) {
      return NextResponse.json(
        { status: "deferred", reason: "not_captured_yet" },
        { status: 503 },
      );
    }
    console.warn(`[webhook] rejected payment ${paymentId}: ${validation.error}`);
    return NextResponse.json({ status: "rejected", reason: "validation_failed" });
  }

  if (!isInteractionType(validation.interactionType)) {
    // The original code defaulted an unknown or missing type to "text" and
    // inserted a submission anyway, which fabricated a text alert out of an
    // order that was never for one.
    console.warn(
      `[webhook] order ${orderId} has unsupported interaction_type '${validation.interactionType}'`,
    );
    return NextResponse.json({ status: "rejected", reason: "unsupported_interaction" });
  }

  // The ledger records the money as soon as the capture is verified, whether
  // or not the viewer's alert has been submitted yet.
  const ledger = await recordCapturedPayment(supabase, {
    payment: paymentResult.data,
    orderId,
    creatorId: validation.creatorId,
    interactionType: validation.interactionType,
  });
  if (!ledger.ok && ledger.retryable) {
    return NextResponse.json({ status: "deferred", reason: "ledger_unavailable" }, { status: 503 });
  }

  const existingSubmissionId = await findSubmissionIdByPayment(supabase, paymentId);
  if (existingSubmissionId) {
    return NextResponse.json({
      status: "ok",
      already_processed: true,
      submission_id: existingSubmissionId,
    });
  }

  const paymentCreatedAt = Number(paymentResult.data.created_at ?? 0) * 1000;
  if (paymentCreatedAt > 0 && Date.now() - paymentCreatedAt < RECOVERY_GRACE_MS) {
    return NextResponse.json(
      { status: "deferred", reason: "awaiting_browser_submission" },
      { status: 503 },
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("creator_profiles")
    .select("id")
    .eq("id", validation.creatorId)
    .maybeSingle();

  if (profileError) {
    console.error("[webhook] profile lookup failed:", profileError.message);
    return NextResponse.json(
      { status: "deferred", reason: "database_unavailable" },
      { status: 503 },
    );
  }
  if (!profile) {
    return NextResponse.json({ status: "rejected", reason: "unknown_creator" });
  }

  // Note: `public_page_enabled` is deliberately not checked. The viewer paid
  // while the page was live; a creator toggling their page off afterwards must
  // not cause the platform to silently keep the money with no alert recorded.

  const result = await insertPaidSubmission(supabase, {
    creatorId: validation.creatorId,
    interactionType: validation.interactionType,
    senderName: "Anonymous",
    // Flagged in the message so a creator can see at a glance that this alert
    // was recovered from a payment rather than submitted with content. The
    // viewer never got to type anything — they closed the tab.
    message: "Recovered payment — the viewer did not complete their message.",
    amountRupees: validation.amountInPaise / 100,
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    metadata: {
      recovered_by_webhook: true,
      webhook_event: event,
    },
  });

  if (result.status === "duplicate") {
    // The normal case on a Razorpay retry, and the normal case when the browser
    // already submitted successfully. Both are successes from the webhook's
    // point of view.
    return NextResponse.json({
      status: "ok",
      already_processed: true,
      submission_id: result.submissionId,
    });
  }

  if (result.status === "error") {
    return NextResponse.json(
      { status: "deferred", reason: "insert_failed" },
      { status: 503 },
    );
  }

  console.info(
    `[webhook] recovered payment ${paymentId} as submission ${result.submission.id}`,
  );
  return NextResponse.json({
    status: "ok",
    recovered: true,
    submission_id: result.submission.id,
  });
}
