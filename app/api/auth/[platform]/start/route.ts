import { NextResponse } from "next/server";

import { MissingConfigError, serverEnv } from "@/lib/env";
import {
  PLATFORM_STATE_COOKIE,
  PLATFORM_STATE_TTL_SECONDS,
  beginAuthorization,
  encodePending,
  isPlatform,
} from "@/lib/integrations/platforms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** GET /api/auth/{twitch|kick}/start — begins the consent flow. */
export async function GET(_request: Request, ctx: { params: Promise<{ platform: string }> }) {
  const { platform } = await ctx.params;
  const base = serverEnv.appUrl();
  if (!isPlatform(platform)) {
    return NextResponse.redirect(new URL("/dashboard/stream-kit", base));
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", base));

  let url: string;
  let cookie: string;
  try {
    const begun = beginAuthorization(platform);
    url = begun.url;
    cookie = encodePending(begun.pending);
  } catch (error) {
    if (error instanceof MissingConfigError) {
      console.warn(`[${platform}/start] not configured: ${error.variable}`);
      return NextResponse.redirect(
        new URL(`/dashboard/stream-kit?connect=${platform}&status=error&reason=not_configured`, base),
      );
    }
    throw error;
  }

  const response = NextResponse.redirect(url);
  response.cookies.set(PLATFORM_STATE_COOKIE, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: PLATFORM_STATE_TTL_SECONDS,
  });
  return response;
}
