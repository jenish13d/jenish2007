import {
  apiError,
  apiSuccess,
  readJsonBody,
  withErrorHandling,
} from "@/lib/http/responses";
import { RATE_LIMITS, clientIdentifier, consume } from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation/schemas";
import { updatePreferencesSchema } from "@/lib/validation/preferences";

/**
 * GET   /api/creator/preferences  — the signed-in creator's preferences plus
 *                                   the platform bounds the UI must respect.
 * PATCH /api/creator/preferences  — partial update, validated twice: here
 *                                   (shape + owner bounds) and by database CHECKs.
 *
 * Reads and writes go through the cookie-backed client, so RLS restricts every
 * statement to the caller's own row.
 */
export const dynamic = "force-dynamic";

async function platformBounds(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data } = await supabase
    .from("platform_settings")
    .select("message_limit_default, message_limit_min, message_limit_max, platform_fee_bps, gateway_fee_bearer, settlement_hold_days, min_payout_paise")
    .maybeSingle();
  return {
    message_limit_default: data?.message_limit_default ?? 50,
    message_limit_min: data?.message_limit_min ?? 10,
    message_limit_max: data?.message_limit_max ?? 200,
    platform_fee_bps: data?.platform_fee_bps ?? 1000,
    gateway_fee_bearer: data?.gateway_fee_bearer ?? "platform",
    settlement_hold_days: data?.settlement_hold_days ?? 7,
    min_payout_paise: data?.min_payout_paise ?? 50000,
  };
}

export const GET = withErrorHandling("creator/preferences#GET", async () => {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("unauthorized", "Sign in to manage your interactions.");

  const [{ data: preferences, error }, bounds] = await Promise.all([
    supabase.from("creator_preferences").select("*").eq("creator_id", user.id).maybeSingle(),
    platformBounds(supabase),
  ]);
  if (error) {
    console.error("[preferences#GET]", error.message);
    return apiError("internal_error", "Could not load your settings.");
  }
  return apiSuccess({ preferences, platform: bounds });
});

export const PATCH = withErrorHandling("creator/preferences#PATCH", async (request: Request) => {
  const limit = consume(`preferences:${clientIdentifier(request)}`, RATE_LIMITS.creatorWrite);
  if (!limit.allowed) {
    return apiError("rate_limited", "Too many changes at once.", { retryAfterSeconds: limit.retryAfterSeconds });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("unauthorized", "Sign in to manage your interactions.");

  const body = await readJsonBody(request, 16 * 1024);
  if (!body.ok) return body.response;

  const parsed = updatePreferencesSchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError("validation_failed", "Check your settings.", { fields: fieldErrors(parsed.error) });
  }

  const bounds = await platformBounds(supabase);
  const update = parsed.data;
  if (
    update.message_max_length !== undefined &&
    (update.message_max_length < bounds.message_limit_min || update.message_max_length > bounds.message_limit_max)
  ) {
    return apiError(
      "validation_failed",
      `Message limit must be between ${bounds.message_limit_min} and ${bounds.message_limit_max} characters.`,
    );
  }
  if (Object.keys(update).length === 0) {
    return apiError("validation_failed", "Nothing to update.");
  }

  const { data, error } = await supabase
    .from("creator_preferences")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("creator_id", user.id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[preferences#PATCH]", error.code, error.message);
    return apiError(error.code === "23514" ? "validation_failed" : "internal_error", "Could not save your settings.");
  }
  return apiSuccess({ preferences: data });
});
