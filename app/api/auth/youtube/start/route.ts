import { NextResponse } from "next/server";

import { MissingConfigError } from "@/lib/env";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
  YOUTUBE_SCOPES,
  appBaseUrl,
  createOAuthClient,
  generateOAuthState,
} from "@/lib/integrations/youtube";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/auth/youtube/start
 *
 * Begins the YouTube OAuth consent flow for the signed-in creator.
 *
 * This is a browser redirect endpoint rather than a JSON API, so failures
 * redirect back to the dashboard with a reason the UI can render, instead of
 * returning a status code the user would never see.
 */
export async function GET() {
  const base = appBaseUrl();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", base));
  }

  let authorizationUrl: string;
  const state = generateOAuthState();

  try {
    authorizationUrl = createOAuthClient().generateAuthUrl({
      // `offline` is what yields a refresh token, which the dashboard needs to
      // read live chat without the creator re-consenting every hour.
      access_type: "offline",
      // Google only returns a refresh token on first consent unless prompted
      // again, and a creator who reconnects after revoking needs a new one.
      prompt: "consent",
      scope: [...YOUTUBE_SCOPES],
      state,
      include_granted_scopes: true,
    });
  } catch (error) {
    if (error instanceof MissingConfigError) {
      console.warn(`[youtube/start] not configured: ${error.variable}`);
      return NextResponse.redirect(
        new URL("/creator?youtube=error&reason=not_configured", base),
      );
    }
    throw error;
  }

  const response = NextResponse.redirect(authorizationUrl);

  // CSRF protection: the callback requires this cookie to match the `state` it
  // receives, so a forged callback cannot bind someone else's Google account to
  // this creator.
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });

  return response;
}
