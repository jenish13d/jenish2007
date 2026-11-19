import { z } from "zod";

import { MissingConfigError, integrationStatus } from "@/lib/env";
import { apiError, apiSuccess, readJsonBody } from "@/lib/http/responses";
import { clearYoutubeConnection } from "@/lib/integrations/youtube";
import { disconnect, isPlatform } from "@/lib/integrations/platforms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET    /api/creator/connections — connection status (never tokens) plus
 *                                   which providers are configured.
 * DELETE /api/creator/connections — { platform } disconnects and revokes.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("unauthorized", "Sign in first.");

  const { data, error } = await supabase.rpc("sl_my_connections");
  if (error) {
    console.error("[connections] status failed:", error.message);
    return apiError("internal_error", "Could not load connections.");
  }
  const status = integrationStatus();
  return apiSuccess({
    connections: data ?? [],
    available: {
      youtube: status.youtube && status.serviceRole && status.tokenEncryption,
      twitch: status.twitch && status.serviceRole && status.tokenEncryption,
      kick: status.kick && status.serviceRole && status.tokenEncryption,
    },
  });
}

const bodySchema = z.object({ platform: z.enum(["youtube", "twitch", "kick"]) }).strict();

export async function DELETE(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("unauthorized", "Sign in first.");

  const body = await readJsonBody(request, 1024);
  if (!body.ok) return body.response;
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return apiError("validation_failed", "Unknown platform.");

  try {
    if (parsed.data.platform === "youtube") {
      await clearYoutubeConnection(user.id);
    } else if (isPlatform(parsed.data.platform)) {
      await disconnect(user.id, parsed.data.platform);
    }
  } catch (error) {
    if (error instanceof MissingConfigError) {
      return apiError("not_configured", "Connections are not configured on this deployment.");
    }
    throw error;
  }
  return apiSuccess({ disconnected: parsed.data.platform });
}
