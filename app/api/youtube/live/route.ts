import { google } from "googleapis";

import { apiError, apiSuccess, withErrorHandling } from "@/lib/http/responses";
import { authorizedClientForCreator } from "@/lib/integrations/youtube";
import {
  RATE_LIMITS,
  clientIdentifier,
  consume,
} from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/youtube/live
 *
 * Reports the signed-in creator's current live broadcast, if any, so the
 * dashboard can show live status and the chat panel knows which chat to read.
 *
 * Creator-only: the YouTube quota and the stored OAuth grant both belong to the
 * creator, so this is never a public endpoint.
 */
export const GET = withErrorHandling("youtube/live", async (request: Request) => {
  const limit = consume(
    `yt-live:${clientIdentifier(request)}`,
    RATE_LIMITS.creatorWrite,
  );
  if (!limit.allowed) {
    return apiError("rate_limited", "Checking too often.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("unauthorized", "Sign in to check your live status.");
  }

  const auth = await authorizedClientForCreator(user.id);
  if (!auth) {
    return apiSuccess({
      connected: false,
      live: false,
      broadcast: null,
      message: "Connect your YouTube channel to see live status.",
    });
  }

  const youtube = google.youtube({ version: "v3", auth });

  let broadcast;
  try {
    const response = await youtube.liveBroadcasts.list({
      part: ["snippet", "status", "contentDetails"],
      mine: true,
      broadcastStatus: "active",
      maxResults: 1,
    });
    broadcast = response.data.items?.[0] ?? null;
  } catch (error) {
    console.error("[youtube/live] broadcast lookup failed:", error);
    return apiError("upstream_unavailable", "Could not reach YouTube right now.", {
      retryable: true,
    });
  }

  if (!broadcast) {
    return apiSuccess({ connected: true, live: false, broadcast: null });
  }

  return apiSuccess({
    connected: true,
    live: true,
    broadcast: {
      id: broadcast.id ?? null,
      title: broadcast.snippet?.title ?? null,
      started_at: broadcast.snippet?.actualStartTime ?? null,
      // The chat endpoint needs this id; it is the creator's own and is only
      // returned over this authenticated channel.
      live_chat_id: broadcast.snippet?.liveChatId ?? null,
      concurrent_viewers: null,
    },
  });
});
