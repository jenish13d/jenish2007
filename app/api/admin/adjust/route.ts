import { z } from "zod";

import { requireAdmin } from "@/lib/admin/guard";
import { apiError, apiSuccess, readJsonBody, withErrorHandling } from "@/lib/http/responses";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * Audited ledger adjustment. Owner only, reason mandatory, explicit typed
 * confirmation. The database records before/after balances and the admin id.
 */
const schema = z.object({
  creator_id: z.string().uuid(),
  amount_paise: z.number().int().refine((v) => v !== 0 && Math.abs(v) <= 10_000_000, "Amount out of range."),
  reason: z.string().trim().min(10).max(500),
  confirmation: z.literal("ADJUST"),
}).strict();

export const POST = withErrorHandling("admin/adjust", async (request: Request) => {
  const gate = await requireAdmin(request, { ownerOnly: true });
  if (!gate.ok) return gate.response;
  const body = await readJsonBody(request, 4 * 1024);
  if (!body.ok) return body.response;
  const parsed = schema.safeParse(body.value);
  if (!parsed.success) return apiError("validation_failed", "Check the amount, give a reason, and type ADJUST to confirm.");
  const { data, error } = await getSupabaseServiceClient().rpc("sl_admin_adjust_creator", {
    p_admin: gate.ctx.userId, p_creator: parsed.data.creator_id,
    p_amount_paise: parsed.data.amount_paise, p_reason: parsed.data.reason,
  });
  if (error) return apiError("validation_failed", error.message.replace(/^.*?:\s*/, ""));
  return apiSuccess({ ledger_entry_id: data });
});
