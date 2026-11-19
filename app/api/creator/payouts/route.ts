import { z } from "zod";

import { apiError, apiSuccess, readJsonBody, withErrorHandling } from "@/lib/http/responses";
import { RATE_LIMITS, clientIdentifier, consume } from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET  /api/creator/payouts — balance, earnings summary, payment and
 *                             withdrawal history for the signed-in creator.
 * POST /api/creator/payouts — { amount_paise } requests a withdrawal.
 *
 * A request only creates a `requested` row. Money moves only after an admin
 * approves it and the licensed payout provider (Razorpay Route) confirms; the
 * status becomes `completed` only with a provider reference. The database
 * refuses requests while `platform_settings.payouts_enabled` is false.
 */
export const GET = withErrorHandling("creator/payouts#GET", async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("unauthorized", "Sign in to see your earnings.");

  const [balance, summary, payments, payouts] = await Promise.all([
    supabase.rpc("sl_my_balance"),
    supabase.rpc("sl_my_earnings_summary"),
    supabase
      .from("payments")
      .select("id, display_name, interaction_type, amount_paise, creator_share_paise, platform_fee_paise, refunded_paise, status, captured_at")
      .eq("creator_id", user.id)
      .order("captured_at", { ascending: false })
      .limit(50),
    supabase
      .from("payouts")
      .select("id, amount_paise, status, failure_reason, requested_at, completed_at")
      .eq("creator_id", user.id)
      .order("requested_at", { ascending: false })
      .limit(20),
  ]);

  const failed = [balance, summary, payments, payouts].find((r) => r.error);
  if (failed?.error) {
    console.error("[creator/payouts] load failed:", failed.error.message);
    return apiError("upstream_unavailable", "Earnings are not available yet.", { retryable: true });
  }

  const b = Array.isArray(balance.data) ? balance.data[0] : balance.data;
  return apiSuccess({
    balance: b ?? { earned_paise: 0, pending_paise: 0, available_paise: 0, reserved_paise: 0, paid_out_paise: 0 },
    summary: summary.data ?? null,
    payments: payments.data ?? [],
    payouts: payouts.data ?? [],
  });
});

const requestSchema = z.object({ amount_paise: z.number().int().positive().max(100_000_000) }).strict();

export const POST = withErrorHandling("creator/payouts#POST", async (request: Request) => {
  const limit = consume(`payout:${clientIdentifier(request)}`, RATE_LIMITS.payoutRequest);
  if (!limit.allowed) {
    return apiError("rate_limited", "Too many withdrawal requests.", { retryAfterSeconds: limit.retryAfterSeconds });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("unauthorized", "Sign in to request a withdrawal.");

  const body = await readJsonBody(request, 1024);
  if (!body.ok) return body.response;
  const parsed = requestSchema.safeParse(body.value);
  if (!parsed.success) return apiError("validation_failed", "Enter a valid amount.");

  const { data, error } = await supabase.rpc("sl_request_payout", { p_amount_paise: parsed.data.amount_paise });
  if (error) {
    if (error.code === "0A000") {
      return apiError("not_configured", "Withdrawals open once our payout partner approves the account. Your balance is safe and keeps accruing.");
    }
    if (error.message.includes("below minimum")) return apiError("validation_failed", "That's below the minimum withdrawal.");
    if (error.message.includes("insufficient")) return apiError("validation_failed", "That's more than your available balance.");
    console.error("[creator/payouts] request failed:", error.message);
    return apiError("internal_error", "Could not request the withdrawal.");
  }
  return apiSuccess({ payout: { id: data?.id, amount_paise: data?.amount_paise, status: data?.status } });
});
