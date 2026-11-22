import { z } from "zod";

import { serverEnv } from "@/lib/env";
import { apiError, apiSuccess, readJsonBody, withErrorHandling } from "@/lib/http/responses";
import { EXTERNAL_WEBHOOK_AAD } from "@/lib/payments/external";
import { RATE_LIMITS, clientIdentifier, consume } from "@/lib/security/rate-limit";
import { sealToken } from "@/lib/security/token-crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * GET    /api/creator/external-link  status of the creator's own Razorpay link reporting
 * PUT    /api/creator/external-link  { webhook_secret } — stores it sealed (AES-256-GCM)
 * DELETE /api/creator/external-link  removes the stored secret
 *
 * The secret is write-only: it is never returned. The link URL itself is a
 * normal preference (external_payment_url).
 */
export const dynamic = "force-dynamic";

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export const GET = withErrorHandling("creator/external-link#GET", async () => {
  const user = await requireUser();
  if (!user) return apiError("unauthorized", "Sign in first.");
  const service = getSupabaseServiceClient();
  const { data } = await service
    .from("creator_external_webhooks")
    .select("created_at, last_event_at")
    .eq("creator_id", user.id)
    .maybeSingle();
  const base = serverEnv.appUrl().replace(/\/$/, "");
  return apiSuccess({
    webhook_configured: Boolean(data),
    last_event_at: data?.last_event_at ?? null,
    webhook_url: `${base}/api/payments/external-webhook/${user.id}`,
  });
});

const putSchema = z.object({ webhook_secret: z.string().min(16).max(200).regex(/^[\x21-\x7e]+$/) }).strict();

export const PUT = withErrorHandling("creator/external-link#PUT", async (request: Request) => {
  const limit = consume(`extlink:${clientIdentifier(request)}`, RATE_LIMITS.creatorWrite);
  if (!limit.allowed) return apiError("rate_limited", "Too many changes.", { retryAfterSeconds: limit.retryAfterSeconds });
  const user = await requireUser();
  if (!user) return apiError("unauthorized", "Sign in first.");
  const body = await readJsonBody(request, 2048);
  if (!body.ok) return body.response;
  const parsed = putSchema.safeParse(body.value);
  if (!parsed.success) return apiError("validation_failed", "Paste the webhook secret exactly as set in Razorpay (16+ characters).");
  let sealed: string;
  try {
    sealed = sealToken(parsed.data.webhook_secret, serverEnv.tokenEncryptionKey(), EXTERNAL_WEBHOOK_AAD(user.id));
  } catch {
    return apiError("not_configured", "Encryption is not configured on this deployment.");
  }
  const { error } = await getSupabaseServiceClient()
    .from("creator_external_webhooks")
    .upsert({ creator_id: user.id, sealed_secret: sealed }, { onConflict: "creator_id" });
  if (error) return apiError("internal_error", "Could not save the secret.");
  return apiSuccess({ webhook_configured: true });
});

export const DELETE = withErrorHandling("creator/external-link#DELETE", async () => {
  const user = await requireUser();
  if (!user) return apiError("unauthorized", "Sign in first.");
  await getSupabaseServiceClient().from("creator_external_webhooks").delete().eq("creator_id", user.id);
  return apiSuccess({ webhook_configured: false });
});
