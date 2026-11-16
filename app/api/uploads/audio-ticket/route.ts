import crypto from "node:crypto";

import {
  apiError,
  apiSuccess,
  readJsonBody,
  withErrorHandling,
} from "@/lib/http/responses";
import { authorizePaymentToken } from "@/lib/payments/authorize";
import {
  RATE_LIMITS,
  clientIdentifier,
  consume,
} from "@/lib/security/rate-limit";
import {
  INTERACTION_AUDIO_BUCKET,
  extensionForAudioMime,
} from "@/lib/storage/soundboard";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { audioUploadTicketSchema, fieldErrors } from "@/lib/validation/schemas";

/**
 * POST /api/uploads/audio-ticket
 *
 * Issues a one-object signed upload URL for a viewer's voice note.
 *
 * Why this route exists
 * --------------------
 * Viewers previously uploaded straight from the browser with the anon Supabase
 * client. That required `anon` to hold INSERT on the `interaction-audio`
 * bucket, and the audit found the consequence: anon could also call
 * `list('')` and enumerate the bucket's top-level folders, which are creator
 * UUIDs. Routing the upload through a server-issued signed URL means anon needs
 * no bucket privileges at all, and the object path is chosen by the server
 * rather than the client.
 *
 * The path is `<creator_id>/<random>.<ext>`, derived from the payment token's
 * creator — so a viewer cannot write into another creator's folder, and the
 * submission endpoint can verify ownership from the path alone.
 */
export const POST = withErrorHandling("uploads/audio-ticket", async (request: Request) => {
  const limit = consume(
    `upload-ticket:${clientIdentifier(request)}`,
    RATE_LIMITS.uploadTicket,
  );
  if (!limit.allowed) {
    return apiError("rate_limited", "Too many uploads. Please wait a moment.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const body = await readJsonBody(request, 4 * 1024);
  if (!body.ok) return body.response;

  const parsed = audioUploadTicketSchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError("validation_failed", "That recording cannot be uploaded.", {
      fields: fieldErrors(parsed.error),
    });
  }

  const authorization = authorizePaymentToken(parsed.data.payment_token, {
    interactionType: "audio",
  });
  if (!authorization.ok) {
    return apiError(authorization.status, authorization.reason);
  }

  const { creatorId } = authorization.claims;
  const supabase = getSupabaseServiceClient();

  const { data: profile, error: profileError } = await supabase
    .from("creator_profiles")
    .select("id, public_page_enabled, audio_upload_enabled")
    .eq("id", creatorId)
    .maybeSingle();

  if (profileError) {
    console.error("[audio-ticket] profile lookup failed:", profileError.message);
    return apiError("internal_error", "Could not prepare the upload.");
  }
  if (!profile?.public_page_enabled) {
    return apiError("forbidden", "That creator page is not available.");
  }
  if (profile.audio_upload_enabled === false) {
    return apiError("forbidden", "This creator has turned voice notes off.");
  }

  const extension = extensionForAudioMime(parsed.data.content_type);
  const objectPath = `${creatorId}/${crypto.randomUUID()}.${extension}`;

  const { data, error } = await supabase.storage
    .from(INTERACTION_AUDIO_BUCKET)
    .createSignedUploadUrl(objectPath);

  if (error || !data?.signedUrl) {
    console.error("[audio-ticket] could not sign upload:", error?.message);
    return apiError("internal_error", "Could not prepare the upload.");
  }

  return apiSuccess({
    upload_url: data.signedUrl,
    // Supabase's signed upload flow needs this token in the PUT.
    upload_token: data.token,
    // Echoed back so the client can present it with the submission. The
    // submission endpoint re-derives and re-checks the prefix regardless.
    storage_path: objectPath,
    content_type: parsed.data.content_type,
  });
});
