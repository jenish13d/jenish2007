import { serverEnv } from "@/lib/env";
import { apiError, apiSuccess, withErrorHandling } from "@/lib/http/responses";
import { generateOverlayKey } from "@/lib/overlay/tokens";
import {
  RATE_LIMITS,
  clientIdentifier,
  consume,
} from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET  /api/creator/overlay-key — the signed-in creator's OBS browser-source URL.
 * POST /api/creator/overlay-key — rotate the key, invalidating the old URL.
 *
 * The key is a secret that lives in a URL, which means it will eventually be
 * shown on stream by accident. Rotation is therefore a first-class feature, not
 * an afterthought: a creator who leaks their overlay URL can invalidate it in
 * one click rather than having to change their username.
 *
 * Both handlers read and write through the cookie-backed client, so RLS
 * guarantees a creator can only see and rotate their own key.
 */

function overlayUrl(key: string): string {
  const base = serverEnv.appUrl().replace(/\/+$/, "");
  return `${base}/obs?key=${encodeURIComponent(key)}`;
}

export const GET = withErrorHandling("creator/overlay-key#GET", async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("unauthorized", "Sign in to see your overlay URL.");
  }

  const { data, error } = await supabase
    .from("creator_profiles")
    .select("overlay_key")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[overlay-key#GET] query failed:", error.message);
    return apiError("internal_error", "Could not load your overlay URL.");
  }
  if (!data?.overlay_key) {
    return apiError(
      "not_configured",
      "Your overlay key has not been generated yet. Apply supabase/migrations/0002, then reload.",
    );
  }

  return apiSuccess({
    overlay_url: overlayUrl(data.overlay_key),
    // Returned so the dashboard can offer a copy-to-clipboard of the raw key.
    // This is the creator's own secret, over an authenticated channel.
    overlay_key: data.overlay_key,
  });
});

export const POST = withErrorHandling("creator/overlay-key#POST", async (request: Request) => {
  const limit = consume(
    `overlay-key:${clientIdentifier(request)}`,
    RATE_LIMITS.creatorWrite,
  );
  if (!limit.allowed) {
    return apiError("rate_limited", "Too many rotations at once.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("unauthorized", "Sign in to rotate your overlay key.");
  }

  const nextKey = generateOverlayKey();

  const { data, error } = await supabase
    .from("creator_profiles")
    .update({ overlay_key: nextKey })
    .eq("id", user.id)
    .select("overlay_key")
    .maybeSingle();

  if (error) {
    console.error("[overlay-key#POST] rotation failed:", error.code, error.message);
    return apiError("internal_error", "Could not rotate your overlay key.");
  }
  if (!data?.overlay_key) {
    return apiError("forbidden", "That key could not be rotated.");
  }

  return apiSuccess({
    overlay_url: overlayUrl(data.overlay_key),
    overlay_key: data.overlay_key,
    message: "Your old overlay URL has stopped working. Update OBS with the new one.",
  });
});
