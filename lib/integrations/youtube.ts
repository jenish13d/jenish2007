import crypto from "node:crypto";

import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "../env.ts";

/**
 * YouTube OAuth and Data API helpers.
 *
 * Read-only scope only. StreamLounge shows a creator's channel details on their
 * public page and reads live chat; it never needs write access to a channel, so
 * requesting more than `youtube.readonly` would be asking creators for
 * permissions the product cannot use.
 */

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
] as const;

export const OAUTH_STATE_COOKIE = "youtube_oauth_state";
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

/**
 * Resolves the application's own base URL.
 *
 * Always from configuration, never from request headers. The original derived
 * it from `x-forwarded-host` when the env var was absent, which lets a caller
 * choose the host used to build the OAuth `redirect_uri` and the post-login
 * redirect. Google rejects an unregistered `redirect_uri`, so that was not
 * directly exploitable for token theft, but a configuration value should not be
 * attacker-influenced in the first place.
 */
export function appBaseUrl(): string {
  return serverEnv.appUrl().replace(/\/+$/, "");
}

export function oauthRedirectUri(): string {
  return `${appBaseUrl()}/api/auth/youtube/callback`;
}

export function createOAuthClient() {
  return new google.auth.OAuth2(
    serverEnv.googleClientId(),
    serverEnv.googleClientSecret(),
    oauthRedirectUri(),
  );
}

export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Constant-time state comparison. */
export function oauthStateMatches(
  fromQuery: string | null | undefined,
  fromCookie: string | null | undefined,
): boolean {
  if (!fromQuery || !fromCookie) return false;
  const a = crypto.createHash("sha256").update(fromQuery).digest();
  const b = crypto.createHash("sha256").update(fromCookie).digest();
  return crypto.timingSafeEqual(a, b);
}

export interface YoutubeChannelSummary {
  channelId: string;
  title: string;
  handle: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  subscribers: number | null;
}

export async function fetchOwnChannel(
  auth: ReturnType<typeof createOAuthClient>,
): Promise<YoutubeChannelSummary | null> {
  const youtube = google.youtube({ version: "v3", auth });

  const response = await youtube.channels.list({
    part: ["snippet", "statistics", "brandingSettings"],
    mine: true,
  });

  const channel = response.data.items?.[0];
  if (!channel?.id) return null;

  const subscriberCount = channel.statistics?.subscriberCount;

  return {
    channelId: channel.id,
    title: channel.snippet?.title ?? "",
    handle: channel.snippet?.customUrl ?? null,
    avatarUrl:
      channel.snippet?.thumbnails?.high?.url ??
      channel.snippet?.thumbnails?.default?.url ??
      null,
    bannerUrl:
      channel.brandingSettings?.image?.bannerExternalUrl ?? null,
    // Hidden subscriber counts come back undefined rather than zero, and
    // rendering "0 subscribers" for a creator who has hidden the count is worse
    // than rendering nothing.
    subscribers:
      subscriberCount !== undefined && subscriberCount !== null
        ? Number(subscriberCount)
        : null,
  };
}

/**
 * Loads a creator's stored tokens and returns an authorised client, refreshing
 * the access token when it has expired.
 *
 * Returns `null` when the creator has not connected a channel, or when the
 * refresh token has been revoked — in which case the stored row is cleared so
 * the dashboard prompts a reconnect rather than retrying a dead token forever.
 */
export async function authorizedClientForCreator(
  supabase: SupabaseClient,
  creatorId: string,
): Promise<ReturnType<typeof createOAuthClient> | null> {
  const { data, error } = await supabase
    .from("creator_youtube_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("creator_id", creatorId)
    .maybeSingle();

  if (error) {
    console.error("[youtube] token lookup failed:", error.message);
    return null;
  }
  if (!data?.refresh_token && !data?.access_token) {
    return null;
  }

  const client = createOAuthClient();
  client.setCredentials({
    access_token: data.access_token ?? undefined,
    refresh_token: data.refresh_token ?? undefined,
    expiry_date: data.expires_at ? new Date(data.expires_at).getTime() : undefined,
  });

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  const needsRefresh = !data.access_token || expiresAt - Date.now() < 60_000;

  if (needsRefresh) {
    if (!data.refresh_token) {
      return null;
    }
    try {
      const { credentials } = await client.refreshAccessToken();
      await supabase
        .from("creator_youtube_tokens")
        .update({
          access_token: credentials.access_token ?? null,
          // Google does not always return a new refresh token; keep the old one
          // when it does not.
          refresh_token: credentials.refresh_token ?? data.refresh_token,
          expires_at: credentials.expiry_date
            ? new Date(credentials.expiry_date).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq("creator_id", creatorId);
    } catch (refreshError) {
      console.error("[youtube] refresh failed:", refreshError);
      // A revoked grant is permanent. Clearing the row turns an endless retry
      // loop into a visible "reconnect your channel" state.
      await supabase
        .from("creator_youtube_tokens")
        .delete()
        .eq("creator_id", creatorId);
      await supabase
        .from("creator_profiles")
        .update({ youtube_connected: false })
        .eq("id", creatorId);
      return null;
    }
  }

  return client;
}
