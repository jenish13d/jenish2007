import { apiError, apiSuccess, withErrorHandling } from "@/lib/http/responses";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/creator/overview
 *
 * Everything the creator overview, Superchats and Finance screens need, read
 * with the creator's own session (RLS confines every query to their rows).
 * Optional data that depends on migration 0013 degrades to null rather than
 * failing the page.
 */
export const dynamic = "force-dynamic";

export const GET = withErrorHandling("creator/overview#GET", async () => {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("unauthorized", "Sign in to see your studio.");

  const since = new Date(Date.now() - 120 * 86_400_000).toISOString();

  const [balance, summary, payments, profile, interactions, settings] = await Promise.all([
    supabase.rpc("sl_my_balance"),
    supabase.rpc("sl_my_earnings_summary"),
    supabase
      .from("payments")
      .select("id, submission_id, display_name, interaction_type, amount_paise, platform_fee_bps, platform_fee_paise, gateway_fee_paise, gateway_fee_bearer, creator_share_paise, refunded_paise, status, method, captured_at")
      .eq("creator_id", user.id)
      .gte("captured_at", since)
      .order("captured_at", { ascending: false })
      .limit(400),
    supabase.from("creator_profiles").select("creator_name, username, public_page_enabled, profile_image_url").eq("id", user.id).maybeSingle(),
    supabase.from("creator_interactions").select("interaction_type, enabled").eq("creator_id", user.id),
    supabase.from("platform_settings").select("platform_fee_bps, gateway_fee_bearer, settlement_hold_days, min_payout_paise").maybeSingle(),
  ]);

  const core = [balance, summary, payments].find((r) => r.error);
  if (core?.error) {
    console.error("[creator/overview] load failed:", core.error.message);
    return apiError("upstream_unavailable", "Your studio data is not available right now.", { retryable: true });
  }

  // Optional (migration 0013). Each is allowed to fail independently.
  const [sources, external, prefs] = await Promise.all([
    supabase.rpc("sl_my_source_summary"),
    supabase
      .from("external_payments")
      .select("id, amount_paise, gateway_fee_paise, payer_label, status, captured_at")
      .eq("creator_id", user.id)
      .order("captured_at", { ascending: false })
      .limit(100),
    supabase.from("creator_preferences").select("dashboard_layout, external_payment_url").eq("creator_id", user.id).maybeSingle(),
  ]);

  const rows = payments.data ?? [];
  const submissionIds = rows.map((p) => p.submission_id).filter((v): v is string => typeof v === "string");
  const messages: Record<string, { message: string | null; status: string }> = {};
  if (submissionIds.length) {
    const { data: subs } = await supabase
      .from("creator_submissions")
      .select("id, message, status")
      .in("id", submissionIds.slice(0, 400));
    for (const s of subs ?? []) messages[s.id] = { message: s.message ?? null, status: s.status };
  }

  const b = Array.isArray(balance.data) ? balance.data[0] : balance.data;
  return apiSuccess({
    balance: b ?? { earned_paise: 0, pending_paise: 0, available_paise: 0, reserved_paise: 0, paid_out_paise: 0 },
    summary: summary.data ?? null,
    sources: sources.error ? null : sources.data ?? null,
    payments: rows.map((p) => ({
      ...p,
      payment_source: "STREAMLOUNGE_QR" as const,
      message: p.submission_id ? messages[p.submission_id]?.message ?? null : null,
      delivery_status: p.submission_id ? messages[p.submission_id]?.status ?? null : null,
    })),
    external: external.error ? [] : (external.data ?? []).map((e) => ({ ...e, payment_source: "EXTERNAL_RAZORPAY_LINK" as const })),
    layout: prefs.error ? null : prefs.data?.dashboard_layout ?? null,
    external_payment_url: prefs.error ? null : prefs.data?.external_payment_url ?? null,
    migration_0013: !sources.error,
    profile: profile.data ?? null,
    interactions_enabled: (interactions.data ?? []).filter((i) => i.enabled).length,
    platform: settings.data ?? null,
  });
});
