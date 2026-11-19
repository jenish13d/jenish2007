import { requireAdmin } from "@/lib/admin/guard";
import { apiError, apiSuccess, withErrorHandling } from "@/lib/http/responses";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling("admin/overview", async (request: Request) => {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const db = getSupabaseServiceClient();
  const [{ data, error }, liability] = await Promise.all([db.rpc("sl_admin_overview"), db.rpc("sl_reward_liability")]);
  if (error) return apiError("internal_error", "Could not load the overview.");
  return apiSuccess({ overview: { ...data, rewards: liability.data ?? null }, role: gate.ctx.role });
});
