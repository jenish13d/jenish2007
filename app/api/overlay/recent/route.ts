import { apiError, apiSuccess, withErrorHandling } from "@/lib/http/responses";
import { overlayKeyMatches } from "@/lib/overlay/tokens";
import { loadOverlayPreferences } from "@/lib/overlay/preferences";
import { RATE_LIMITS, clientIdentifier, consume } from "@/lib/security/rate-limit";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/overlay/recent?key=<overlay key>
 *
 * The last few delivered superchats, for the on-stream superchat ticker. Read
 * only (never claims), authorised by the creator's revocable overlay key, and
 * limited to what is shown on stream anyway: display name, amount, message.
 */
export const dynamic = "force-dynamic";

export const GET = withErrorHandling("overlay/recent", async (request: Request) => {
  const key = new URL(request.url).searchParams.get("key")?.trim() ?? "";
  if (!key) return apiError("unauthorized", "Missing key.");
  const limit = consume(`recent:${key.slice(0, 16)}:${clientIdentifier(request)}`, RATE_LIMITS.overlayPoll);
  if (!limit.allowed) return apiError("rate_limited", "Polling too fast.", { retryAfterSeconds: limit.retryAfterSeconds });

  const supabase = getSupabaseServiceClient();
  const { data: profile } = await supabase.from("creator_profiles").select("id, overlay_key").eq("overlay_key", key).maybeSingle();
  if (!profile || !overlayKeyMatches(key, profile.overlay_key)) return apiError("unauthorized", "This overlay URL is no longer valid.");

  const prefs = await loadOverlayPreferences(supabase, profile.id);
  const { data } = await supabase
    .from("creator_submissions")
    .select("id, sender_name, amount, message, interaction_type, created_at")
    .eq("creator_id", profile.id)
    .eq("payment_status", "paid")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(8);

  return apiSuccess({
    items: (data ?? []).map((row) => ({
      id: row.id,
      sender_name: prefs.show_sender ? row.sender_name || "Anonymous" : "A viewer",
      amount: prefs.show_amount ? Number(row.amount) : null,
      message: row.interaction_type === "text" ? (row.message ?? "").slice(0, 200) : "",
    })),
  });
});
