import { z } from "zod";

import { requireAdmin } from "@/lib/admin/guard";
import { apiError, apiSuccess, readJsonBody, withErrorHandling } from "@/lib/http/responses";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling("admin/settings#GET", async (request: Request) => {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { data, error } = await getSupabaseServiceClient().from("platform_settings").select("*").maybeSingle();
  if (error) return apiError("internal_error", "Could not load settings.");
  return apiSuccess({ settings: data, role: gate.ctx.role });
});

const schema = z.object({
  changes: z.object({
    platform_fee_bps: z.number().int().min(0).max(5000),
    gateway_fee_bearer: z.enum(["platform", "creator"]),
    settlement_hold_days: z.number().int().min(0).max(60),
    min_payout_paise: z.number().int().min(100).max(10_000_000),
    message_limit_default: z.number().int().min(10).max(500),
    message_limit_min: z.number().int().min(1).max(500),
    message_limit_max: z.number().int().min(1).max(500),
    points_per_rupee: z.number().int().min(0).max(100),
    points_per_redemption: z.number().int().min(1).max(1_000_000),
    redemption_value_paise: z.number().int().min(0).max(1_000_000),
    points_enabled: z.boolean(),
  }).partial().strict(),
  reason: z.string().trim().min(10).max(500),
}).strict();

export const PATCH = withErrorHandling("admin/settings#PATCH", async (request: Request) => {
  const gate = await requireAdmin(request, { ownerOnly: true });
  if (!gate.ok) return gate.response;
  const body = await readJsonBody(request, 4 * 1024);
  if (!body.ok) return body.response;
  const parsed = schema.safeParse(body.value);
  if (!parsed.success || Object.keys(parsed.data.changes).length === 0) {
    return apiError("validation_failed", "Choose at least one change and give a reason (10+ characters).");
  }
  const { data, error } = await getSupabaseServiceClient().rpc("sl_admin_update_settings", {
    p_admin: gate.ctx.userId, p_changes: parsed.data.changes, p_reason: parsed.data.reason,
  });
  if (error) return apiError("validation_failed", error.message.replace(/^.*?:\s*/, ""));
  return apiSuccess({ settings: data });
});
