import {
  apiError,
  apiSuccess,
  readJsonBody,
  withErrorHandling,
} from "@/lib/http/responses";
import type { SubmissionMetadata } from "@/lib/db/types";
import {
  STALE_PROCESSING_TIMEOUT_MS,
  canTransitionFromProcessing,
  generateOverlayToken,
  overlayKeyMatches,
  verifyOverlayToken,
} from "@/lib/overlay/tokens";
import { resolveOverlayTheme } from "@/lib/overlay/themes";
import { announcementFor, loadOverlayPreferences, overlayHeartbeat } from "@/lib/overlay/preferences";
import {
  RATE_LIMITS,
  clientIdentifier,
  consume,
} from "@/lib/security/rate-limit";
import {
  resolveSoundForCreator,
  signInteractionAudio,
  signStickerImage,
} from "@/lib/storage/soundboard";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import {
  claimNextOverlayEvent,
  completeOverlayEvent,
  recoverStaleProcessing,
} from "@/lib/submissions/repository";
import { fieldErrors, overlayCompleteSchema } from "@/lib/validation/schemas";

/**
 * The OBS browser source's event channel.
 *
 * GET  — claim the next queued alert for a creator.
 * POST — report that an alert finished playing.
 *
 * Authorisation
 * -------------
 * The GET is authorised by the creator's secret `overlay_key`, supplied as a
 * query parameter because an OBS browser source can only carry credentials in
 * its URL. Previously this endpoint was keyed on the creator's public username
 * with no secret at all, and since polling *claims* the next event, anyone could
 * drain a creator's paid alerts: the viewer is charged, the creator's stream
 * shows nothing, and the caller receives the signed media URLs plus a valid
 * playback token.
 *
 * Because the key lives in a URL, two things follow and are handled: it is
 * rotatable from the dashboard, and it is never written to a log line here.
 */

export const dynamic = "force-dynamic";

/** Masks the key when a diagnostic needs to mention it. */
function maskKey(key: string): string {
  return key.length <= 8 ? "****" : `${key.slice(0, 4)}…${key.slice(-2)}`;
}

export const GET = withErrorHandling("overlay/event#GET", async (request: Request) => {
  const url = new URL(request.url);
  const overlayKey = url.searchParams.get("key")?.trim() ?? "";

  if (!overlayKey) {
    return apiError("unauthorized", "This overlay URL is missing its key.");
  }

  const limit = consume(
    `overlay:${overlayKey.slice(0, 16)}:${clientIdentifier(request)}`,
    RATE_LIMITS.overlayPoll,
  );
  if (!limit.allowed) {
    return apiError("rate_limited", "Polling too fast.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const supabase = getSupabaseServiceClient();

  // Looked up by the key itself, which is indexed and unique. The key is the
  // identifier here; no username is involved.
  const { data: profile, error: profileError } = await supabase
    .from("creator_profiles")
    .select("id, username, overlay_key, overlay_theme")
    .eq("overlay_key", overlayKey)
    .maybeSingle();

  if (profileError) {
    console.error("[overlay#GET] profile lookup failed:", profileError.message);
    return apiError("internal_error", "Could not load the overlay.");
  }

  // Constant-time comparison even though the lookup was by equality: the
  // equality match tells us a row exists, and this keeps the accept/reject
  // decision itself free of a timing signal.
  if (!profile || !overlayKeyMatches(overlayKey, profile.overlay_key)) {
    console.warn(`[overlay#GET] rejected unknown key ${maskKey(overlayKey)}`);
    return apiError("unauthorized", "This overlay URL is no longer valid.");
  }

  const theme = resolveOverlayTheme(profile.overlay_theme);
  const [preferences] = await Promise.all([
    loadOverlayPreferences(supabase, profile.id),
    overlayHeartbeat(supabase, profile.id),
  ]);
  const creator = { username: profile.username };

  // ?peek=1 returns settings without claiming an alert, so a busy overlay can
  // still pick up an emergency mute within a couple of seconds.
  if (url.searchParams.get("peek") === "1") {
    return apiSuccess({ event: null, theme, preferences, creator });
  }

  // Return anything wedged in `processing` to the queue before claiming, so a
  // crashed browser source does not lose the alert.
  await recoverStaleProcessing(
    supabase,
    profile.id,
    new Date(Date.now() - STALE_PROCESSING_TIMEOUT_MS).toISOString(),
  );

  const claimed = await claimNextOverlayEvent(supabase, profile.id);
  if (!claimed) {
    return apiSuccess({ event: null, theme, preferences, creator });
  }

  /* ---------------------------------------------------------------------- */
  /* Media signing                                                          */
  /* ---------------------------------------------------------------------- */

  const metadata: SubmissionMetadata = { ...(claimed.metadata ?? {}) };

  if (claimed.interaction_type === "soundboard" && metadata.sound_id) {
    const resolution = await resolveSoundForCreator(
      supabase,
      metadata.sound_id,
      claimed.creator_id,
    );
    if (resolution.ok) {
      metadata.sound_url = resolution.signedUrl;
      metadata.storage_path = resolution.sound.storage_path;
    } else {
      // Surfaced to the overlay so it can skip cleanly and report a failure,
      // rather than silently playing nothing or — as the old resolver did —
      // falling back to a different creator's audio.
      console.error(
        `[overlay#GET] sound ${metadata.sound_id} unresolved for submission ${claimed.id}`,
      );
      metadata.playback_error = "The sound file could not be loaded.";
    }
  }

  if (claimed.interaction_type === "audio" && metadata.storage_path) {
    const signed = await signInteractionAudio(
      supabase,
      metadata.storage_path,
      claimed.creator_id,
    );
    if (signed) {
      metadata.audio_url = signed;
    } else {
      metadata.playback_error = "The voice note could not be loaded.";
    }
  }

  // Sticker images are only ever served from our own bucket. Any other image
  // URL that reached the metadata is dropped rather than shown on stream.
  delete metadata.sticker_url;
  delete metadata.image_url;
  delete metadata.imageData;
  delete metadata.image;
  if (claimed.interaction_type === "stickers") {
    const stickerPath =
      typeof metadata.sticker_path === "string" ? metadata.sticker_path : null;
    const signed = stickerPath
      ? await signStickerImage(supabase, stickerPath, claimed.creator_id)
      : null;
    if (signed) {
      metadata.sticker_url = signed;
    } else {
      metadata.playback_error = "The sticker image could not be loaded.";
    }
  }
  delete metadata.sticker_path;

  // Never hand the raw storage path to the browser source; it only needs the
  // signed URL, and the path is internal layout.
  delete metadata.storage_path;

  const token = generateOverlayToken(claimed.id, claimed.creator_id);

  const amountPaise = Math.round(Number(claimed.amount ?? 0) * 100);
  const announcement = announcementFor(preferences, {
    senderName: claimed.sender_name || "Anonymous",
    amountPaise,
    message: claimed.message ?? null,
    interactionType: claimed.interaction_type,
  });

  return apiSuccess({
    event: {
      id: claimed.id,
      token,
      interaction_type: claimed.interaction_type,
      // Hidden server-side so the browser source never receives what the
      // creator chose not to show.
      sender_name: preferences.show_sender ? claimed.sender_name || "Anonymous" : "A viewer",
      message: claimed.message ?? "",
      amount: preferences.show_amount ? Number(claimed.amount ?? 0) : null,
      metadata,
      announce: announcement.announce,
      announcement: announcement.text,
    },
    theme,
    preferences,
    creator,
  });
});

/**
 * Playback completion.
 *
 * Authorised by the short-lived token issued with the claim, which proves the
 * reporter is the browser source that received the event. The token is checked
 * against the submission row read from the database, not against anything in
 * the request body.
 */
export const POST = withErrorHandling("overlay/event#POST", async (request: Request) => {
  const body = await readJsonBody(request, 4 * 1024);
  if (!body.ok) return body.response;

  const parsed = overlayCompleteSchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError("validation_failed", "Invalid completion report.", {
      fields: fieldErrors(parsed.error),
    });
  }

  const { id, token, status, error: playbackError } = parsed.data;
  const supabase = getSupabaseServiceClient();

  const { data: submission, error: fetchError } = await supabase
    .from("creator_submissions")
    .select("id, creator_id, status, payment_status")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    console.error("[overlay#POST] lookup failed:", fetchError.message);
    return apiError("internal_error", "Could not update that event.");
  }
  if (!submission) {
    return apiError("not_found", "That event does not exist.");
  }

  // Signature first: a forged token must be rejected as unauthorised, not as a
  // state-machine error, so the response does not confirm the row's state to a
  // caller who was never entitled to know it.
  const verification = verifyOverlayToken(token, submission.id, submission.creator_id);
  if (!verification.valid) {
    return apiError("forbidden", "This overlay token is not valid.");
  }

  const transition = canTransitionFromProcessing(submission, submission.creator_id);
  if (!transition.allowed) {
    // A replayed report lands here. It is a no-op, reported as a conflict.
    return apiError("conflict", transition.reason ?? "That event cannot be updated.");
  }

  const updated = await completeOverlayEvent(
    supabase,
    submission.id,
    status,
    playbackError,
  );

  if (!updated) {
    // Lost a race with another report, or with stale recovery. Either way the
    // row is no longer `processing`.
    return apiError("conflict", "That event was already updated.");
  }

  return apiSuccess({ id: submission.id, status });
});
