import { z } from "zod";

import { requireAdmin } from "@/lib/admin/guard";
import { apiError, apiSuccess, readJsonBody, withErrorHandling } from "@/lib/http/responses";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const STATUSES = ["requested", "approved", "processing", "completed", "failed", "cancelled"] as const;

export const GET = withErrorHandling("admin/payouts#GET", async (request: Request) => {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const status = new URL(request.url).searchParams.get("status");
  let query = getSupabaseServiceClient()
    .from("payouts")
    .select("id, creator_id, amount_paise, status, provider, provider_ref, failure_reason, requested_at, updated_at, completed_at, creator_profiles(username, creator_name)")
    .order("requested_at", { ascending: false })
    .limit(200);
  if (status && (STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return apiError("internal_error", "Could not load payouts.");
  return apiSuccess({ payouts: data ?? [] });
});

// Admins may approve or cancel a request. Moving money (processing, completed,
// failed) happens only through the payout provider's confirmed callbacks, so
// no one can mark a payout as paid by hand.
const transitionSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "cancelled"]),
  reason: z.string().trim().min(10).max(500),
  confirm: z.literal(true),
}).strict();

export const POST = withErrorHandling("admin/payouts#POST", async (request: Request) => {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const body = await readJsonBody(request, 4 * 1024);
  if (!body.ok) return body.response;
  const parsed = transitionSchema.safeParse(body.value);
  if (!parsed.success) return apiError("validation_failed", "Give a reason (10+ characters) and confirm the action.");
  const { data, error } = await getSupabaseServiceClient().rpc("sl_set_payout_status", {
    p_payout_id: parsed.data.id, p_status: parsed.data.status, p_actor: gate.ctx.userId,
    p_provider_ref: null, p_reason: parsed.data.reason,
  });
  if (error) return apiError("validation_failed", error.message.replace(/^.*?:\s*/, ""));
  return apiSuccess({ payout: data });
});
