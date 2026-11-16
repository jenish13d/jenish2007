import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CreatorSubmission,
  SubmissionMetadata,
} from "../db/types.ts";
import type { InteractionType } from "../interactions/registry.ts";

/** Postgres unique-violation. */
const UNIQUE_VIOLATION = "23505";

export interface InsertSubmissionInput {
  creatorId: string;
  interactionType: InteractionType;
  senderName: string;
  message: string | null;
  amountRupees: number;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  metadata: SubmissionMetadata;
}

export type InsertSubmissionResult =
  | { status: "created"; submission: CreatorSubmission }
  | { status: "duplicate"; submissionId: string | null }
  | { status: "error"; message: string };

/**
 * Inserts a paid submission exactly once per payment.
 *
 * Replay prevention is delegated to a unique index on
 * `(metadata->>'razorpay_payment_id')` — see migration 0001 — and the unique
 * violation is caught here and reported as a duplicate.
 *
 * This is deliberately not a select-then-insert. The original implementation
 * checked for an existing submission and then inserted, with no transaction
 * between the two, so two requests arriving together both saw no existing row
 * and both inserted. A race that duplicates a *paid* submission means the
 * creator's overlay plays the same alert twice for one payment. The database
 * constraint is the only check that holds under concurrency; the application
 * can only decide how to report it.
 */
export async function insertPaidSubmission(
  supabase: SupabaseClient,
  input: InsertSubmissionInput,
): Promise<InsertSubmissionResult> {
  const { data, error } = await supabase
    .from("creator_submissions")
    .insert({
      creator_id: input.creatorId,
      interaction_type: input.interactionType,
      sender_name: input.senderName,
      message: input.message,
      amount: input.amountRupees,
      payment_status: "paid",
      status: "pending",
      metadata: {
        ...input.metadata,
        razorpay_order_id: input.razorpayOrderId,
        razorpay_payment_id: input.razorpayPaymentId,
        verified_at: new Date().toISOString(),
      } satisfies SubmissionMetadata,
    })
    .select()
    .single<CreatorSubmission>();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      const existingId = await findSubmissionIdByPayment(
        supabase,
        input.razorpayPaymentId,
      );
      return { status: "duplicate", submissionId: existingId };
    }

    console.error("[submissions] insert failed:", error.code, error.message);
    return { status: "error", message: error.message };
  }

  return { status: "created", submission: data };
}

/**
 * Looks up a submission by its Razorpay payment id.
 *
 * Uses `limit(1)` rather than `maybeSingle()`: `maybeSingle` raises when more
 * than one row matches, which turned a diagnostic lookup into a 500 in the
 * original code precisely when duplicates were the thing being investigated.
 */
export async function findSubmissionIdByPayment(
  supabase: SupabaseClient,
  razorpayPaymentId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("creator_submissions")
    .select("id")
    .eq("metadata->>razorpay_payment_id", razorpayPaymentId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    console.error("[submissions] payment lookup failed:", error.message);
    return null;
  }
  return data?.[0]?.id ?? null;
}

/**
 * Gives a webhook-recovered placeholder the viewer's real content.
 *
 * If the webhook recovered a payment before the browser submitted (Razorpay
 * retries, slow networks), the browser's submission hits the unique index.
 * When the recovered row has not been played yet, the viewer's content
 * replaces the placeholder instead of being discarded. Returns the row id when
 * the content was attached.
 */
export async function attachContentToRecoveredSubmission(
  supabase: SupabaseClient,
  razorpayPaymentId: string,
  content: {
    senderName: string;
    message: string | null;
    metadata: SubmissionMetadata;
  },
): Promise<string | null> {
  const { data: rows, error } = await supabase
    .from("creator_submissions")
    .select("id, status, metadata")
    .eq("metadata->>razorpay_payment_id", razorpayPaymentId)
    .limit(1);

  if (error) {
    console.error("[submissions] recovered lookup failed:", error.message);
    return null;
  }

  const existing = rows?.[0] as
    | { id: string; status: string; metadata: SubmissionMetadata | null }
    | undefined;
  if (
    !existing ||
    existing.status !== "pending" ||
    existing.metadata?.recovered_by_webhook !== true
  ) {
    return null;
  }

  const { data: updated, error: updateError } = await supabase
    .from("creator_submissions")
    .update({
      sender_name: content.senderName,
      message: content.message,
      metadata: {
        ...existing.metadata,
        ...content.metadata,
        recovered_by_webhook: false,
        content_attached_at: new Date().toISOString(),
      },
    })
    .eq("id", existing.id)
    // Only while still queued: once the overlay has claimed it, it has played.
    .eq("status", "pending")
    .select("id");

  if (updateError) {
    console.error("[submissions] recovered update failed:", updateError.message);
    return null;
  }
  return updated?.[0]?.id ?? null;
}

export async function paymentAlreadyRedeemed(
  supabase: SupabaseClient,
  razorpayPaymentId: string,
): Promise<boolean> {
  return (await findSubmissionIdByPayment(supabase, razorpayPaymentId)) !== null;
}

/* -------------------------------------------------------------------------- */
/* Overlay queue                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Atomically claims the oldest queued submission for a creator.
 *
 * Implemented as a single `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP
 * LOCKED)` inside the `claim_next_overlay_event` function (migration 0002). Two
 * browser sources polling the same creator therefore cannot both receive the
 * same event, and neither blocks on the other.
 *
 * The original code did a `SELECT` for the candidate followed by a conditional
 * `UPDATE … WHERE status = 'pending'`. That is safe against double-claiming —
 * the second update matches nothing — but it costs an extra round-trip per poll
 * and silently returns "no event" to the loser, which at OBS polling rates
 * showed up as dropped alerts under load.
 */
export async function claimNextOverlayEvent(
  supabase: SupabaseClient,
  creatorId: string,
): Promise<CreatorSubmission | null> {
  const { data, error } = await supabase.rpc("claim_next_overlay_event", {
    p_creator_id: creatorId,
  });

  if (error) {
    console.error("[overlay] claim failed:", error.message);
    return null;
  }

  const rows = (Array.isArray(data) ? data : []) as CreatorSubmission[];
  return rows[0] ?? null;
}

/**
 * Returns stale `processing` rows to the queue, or fails them on a second
 * timeout so one wedged event cannot block the queue forever.
 */
export async function recoverStaleProcessing(
  supabase: SupabaseClient,
  creatorId: string,
  staleBeforeIso: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("recover_stale_overlay_events", {
    p_creator_id: creatorId,
    p_stale_before: staleBeforeIso,
  });

  if (error) {
    console.error("[overlay] stale recovery failed:", error.message);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

export async function completeOverlayEvent(
  supabase: SupabaseClient,
  submissionId: string,
  nextStatus: "completed" | "failed",
  playbackError?: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("complete_overlay_event", {
    p_submission_id: submissionId,
    p_next_status: nextStatus,
    p_playback_error: playbackError ?? null,
  });

  if (error) {
    console.error("[overlay] completion failed:", error.message);
    return false;
  }
  return data === true;
}
