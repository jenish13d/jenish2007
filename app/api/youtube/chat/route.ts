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
 * GET /api/youtube/chat
 *
 * Reads the signed-in creator's live chat, for the dashboard's chat panel.
 *
 * Creator-only, and the broadcast is resolved from the creator's own account
 * rather than from a client-supplied chat id — otherwise this endpoint would
 * read any live chat on YouTube on the platform's behalf, using the creator's
 * grant and quota.
 */
export const GET = withErrorHandling("youtube/chat", async (request: Request) => {
  const limit = consume(
    `yt-chat:${clientIdentifier(request)}`,
    RATE_LIMITS.creatorWrite,
  );
  if (!limit.allowed) {
    return apiError("rate_limited", "Polling too often.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("unauthorized", "Sign in to read your live chat.");
  }

  const auth = await authorizedClientForCreator(supabase, user.id);
  if (!auth) {
    return apiSuccess({
      connected: false,
      live: false,
      messages: [],
      next_page_token: null,
    });
  }

  const youtube = google.youtube({ version: "v3", auth });

  // `pageToken` is an opaque YouTube cursor. Length-capped so a long query
  // string cannot be used to push oversized requests upstream.
  const rawPageToken = new URL(request.url).searchParams.get("pageToken");
  const pageToken =
    rawPageToken && rawPageToken.length <= 512 ? rawPageToken : undefined;

  let liveChatId: string | null = null;
  try {
    const broadcasts = await youtube.liveBroadcasts.list({
      part: ["snippet"],
      mine: true,
      broadcastStatus: "active",
      maxResults: 1,
    });
    liveChatId = broadcasts.data.items?.[0]?.snippet?.liveChatId ?? null;
  } catch (error) {
    console.error("[youtube/chat] broadcast lookup failed:", error);
    return apiError("upstream_unavailable", "Could not reach YouTube right now.", {
      retryable: true,
    });
  }

  if (!liveChatId) {
    return apiSuccess({
      connected: true,
      live: false,
      messages: [],
      next_page_token: null,
    });
  }

  try {
    const response = await youtube.liveChatMessages.list({
      liveChatId,
      part: ["snippet", "authorDetails"],
      maxResults: 50,
      pageToken,
    });

    const messages = (response.data.items ?? []).map((item) => ({
      id: item.id ?? null,
      author: item.authorDetails?.displayName ?? "Unknown",
      author_avatar: item.authorDetails?.profileImageUrl ?? null,
      is_moderator: item.authorDetails?.isChatModerator ?? false,
      is_owner: item.authorDetails?.isChatOwner ?? false,
      text: item.snippet?.displayMessage ?? "",
      published_at: item.snippet?.publishedAt ?? null,
    }));

    return apiSuccess({
      connected: true,
      live: true,
      messages,
      next_page_token: response.data.nextPageToken ?? null,
      // YouTube tells callers how long to wait; honouring it is what keeps the
      // creator inside their daily quota.
      polling_interval_ms: response.data.pollingIntervalMillis ?? 5000,
    });
  } catch (error) {
    console.error("[youtube/chat] message fetch failed:", error);
    return apiError("upstream_unavailable", "Could not read live chat right now.", {
      retryable: true,
    });
  }
});
