import { NextResponse } from "next/server";

import { MissingConfigError } from "@/lib/env";
import {
  OAUTH_STATE_COOKIE,
  appBaseUrl,
  createOAuthClient,
  fetchOwnChannel,
  oauthStateMatches,
} from "@/lib/integrations/youtube";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/auth/youtube/callback
 *
 * Completes the OAuth flow: validates the CSRF state, exchanges the code,
 * stores the tokens against the signed-in creator, and caches the channel
 * details their public page displays.
 */

function failure(base: string, reason: string) {
  const response = NextResponse.redirect(
    new URL(`/creator?youtube=error&reason=${encodeURIComponent(reason)}`, base),
  );
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: Request) {
  const base = appBaseUrl();
  const { searchParams } = new URL(request.url);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", base));
  }

  // The creator declined consent on Google's screen.
  const googleError = searchParams.get("error");
  if (googleError) {
    return failure(base, googleError === "access_denied" ? "declined" : "google_error");
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) {
    return failure(base, "invalid_response");
  }

  const cookieState = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${OAUTH_STATE_COOKIE}=`))
    ?.slice(OAUTH_STATE_COOKIE.length + 1);

  if (!oauthStateMatches(state, cookieState)) {
    console.warn("[youtube/callback] OAuth state mismatch");
    return failure(base, "invalid_state");
  }

  let client: ReturnType<typeof createOAuthClient>;
  try {
    client = createOAuthClient();
  } catch (error) {
    if (error instanceof MissingConfigError) {
      return failure(base, "not_configured");
    }
    throw error;
  }

  let tokens;
  try {
    ({ tokens } = await client.getToken(code));
  } catch (error) {
    console.error("[youtube/callback] code exchange failed:", error);
    return failure(base, "exchange_failed");
  }

  if (!tokens.access_token) {
    return failure(base, "no_access_token");
  }

  client.setCredentials(tokens);

  let channel;
  try {
    channel = await fetchOwnChannel(client);
  } catch (error) {
    console.error("[youtube/callback] channel lookup failed:", error);
    return failure(base, "channel_lookup_failed");
  }

  if (!channel) {
    return failure(base, "no_channel");
  }

  // Tokens go in their own table, which is RLS-isolated to the owning creator
  // and never read by any public path.
  const { error: tokenError } = await supabase
    .from("creator_youtube_tokens")
    .upsert(
      {
        creator_id: user.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_at: tokens.expiry_date
          ? new Date(tokens.expiry_date).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "creator_id" },
    );

  if (tokenError) {
    console.error("[youtube/callback] token store failed:", tokenError.message);
    return failure(base, "token_store_failed");
  }

  // Channel display fields are cached on the profile so the public page does
  // not call the YouTube API on every visit, which would burn quota and leak
  // viewer traffic patterns to Google.
  const { error: profileError } = await supabase
    .from("creator_profiles")
    .update({
      youtube_connected: true,
      youtube_channel_id: channel.channelId,
      youtube_channel_name: channel.title,
      youtube_handle: channel.handle,
      youtube_avatar_url: channel.avatarUrl,
      youtube_banner_url: channel.bannerUrl,
      youtube_subscribers: channel.subscribers,
    })
    .eq("id", user.id);

  if (profileError) {
    console.error("[youtube/callback] profile update failed:", profileError.message);
    return failure(base, "profile_update_failed");
  }

  if (!tokens.refresh_token) {
    // Connected, but live chat features will stop working within the hour. Say
    // so rather than letting it look like an intermittent bug later.
    console.warn(
      `[youtube/callback] creator ${user.id} connected without a refresh token`,
    );
    const response = NextResponse.redirect(
      new URL("/creator?youtube=connected&warning=no_refresh_token", base),
    );
    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
  }

  const response = NextResponse.redirect(
    new URL("/creator?youtube=connected", base),
  );
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}
