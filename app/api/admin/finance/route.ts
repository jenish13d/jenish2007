import { requireAdmin } from "@/lib/admin/guard";
import { apiError, apiSuccess, withErrorHandling } from "@/lib/http/responses";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/** Recent payments, refunds, disputes and reconciliation problems. */
export const GET = withErrorHandling("admin/finance", async (request: Request) => {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const db = getSupabaseServiceClient();
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  let payments = db.from("payments")
    .select("id, order_id, creator_id, interaction_type, display_name, amount_paise, platform_fee_paise, gateway_fee_paise, creator_share_paise, refunded_paise, status, method, captured_at, submission_id")
    .order("captured_at", { ascending: false }).limit(200);
  if (from && !Number.isNaN(Date.parse(from))) payments = payments.gte("captured_at", new Date(from).toISOString());
  if (to && !Number.isNaN(Date.parse(to))) payments = payments.lte("captured_at", new Date(to).toISOString());

  const [p, r, d, w, unlinked] = await Promise.all([
    payments,
    db.from("refunds").select("id, payment_id, amount_paise, status, created_at").order("created_at", { ascending: false }).limit(100),
    db.from("disputes").select("id, payment_id, amount_paise, status, created_at, updated_at").order("created_at", { ascending: false }).limit(100),
    db.from("webhook_events").select("event_id, event, received_at, error").is("processed_at", null).order("received_at", { ascending: false }).limit(50),
    // Reconciliation: captured money with no alert delivered after an hour.
    db.from("payments").select("id, creator_id, amount_paise, captured_at").is("submission_id", null)
      .lt("captured_at", new Date(Date.now() - 3600_000).toISOString()).limit(50),
  ]);
  if (p.error || r.error || d.error || w.error || unlinked.error) return apiError("internal_error", "Could not load finance data.");
  return apiSuccess({
    payments: p.data, refunds: r.data, disputes: d.data,
    discrepancies: { unprocessed_webhooks: w.data, payments_without_alert: unlinked.data },
  });
});
