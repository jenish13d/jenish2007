import { requireAdmin } from "@/lib/admin/guard";
import { apiError, apiSuccess, withErrorHandling } from "@/lib/http/responses";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling("admin/overview", async (request: Request) => {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { data, error } = await getSupabaseServiceClient().rpc("sl_admin_overview");
  if (error) return apiError("internal_error", "Could not load the overview.");
  return apiSuccess({ overview: data, role: gate.ctx.role });
});
