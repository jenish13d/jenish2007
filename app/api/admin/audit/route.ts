import { requireAdmin } from "@/lib/admin/guard";
import { apiError, apiSuccess, withErrorHandling } from "@/lib/http/responses";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling("admin/audit", async (request: Request) => {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { data, error } = await getSupabaseServiceClient()
    .from("admin_audit_log")
    .select("id, admin_id, action, target_type, target_id, reason, before, after, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return apiError("internal_error", "Could not load the audit log.");
  return apiSuccess({ entries: data ?? [] });
});
