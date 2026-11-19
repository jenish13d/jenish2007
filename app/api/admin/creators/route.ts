import { requireAdmin } from "@/lib/admin/guard";
import { apiError, apiSuccess, withErrorHandling } from "@/lib/http/responses";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling("admin/creators", async (request: Request) => {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const url = new URL(request.url);
  const search = (url.searchParams.get("search") ?? "").trim().slice(0, 60) || null;
  const page = Math.max(0, Math.min(1000, Number(url.searchParams.get("page")) || 0));
  const { data, error } = await getSupabaseServiceClient().rpc("sl_admin_creators", {
    p_search: search, p_limit: 50, p_offset: page * 50,
  });
  if (error) return apiError("internal_error", "Could not load creators.");
  return apiSuccess({ creators: data ?? [], page });
});
