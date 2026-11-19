import { NextResponse } from "next/server";

import { MissingConfigError, serverEnv } from "@/lib/env";
import {
  PLATFORM_STATE_COOKIE,
  decodePending,
  exchangeCode,
  fetchAccount,
  isPlatform,
  saveConnection,
  stateMatches,
} from "@/lib/integrations/platforms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** GET /api/auth/{twitch|kick}/callback — completes the consent flow. */
export async function GET(request: Request, ctx: { params: Promise<{ platform: string }> }) {
  const { platform } = await ctx.params;
  const base = serverEnv.appUrl();

  const done = (status: "connected" | "error", reason?: string) => {
    const q = new URLSearchParams({ connect: platform, status });
    if (reason) q.set("reason", reason);
    const res = NextResponse.redirect(new URL(`/dashboard/stream-kit?${q.toString()}`, base));
    res.cookies.set(PLATFORM_STATE_COOKIE, "", { path: "/api/auth", maxAge: 0 });
    return res;
  };

  if (!isPlatform(platform)) return done("error", "unknown_platform");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", base));

  const { searchParams } = new URL(request.url);
  if (searchParams.get("error")) {
    return done("error", searchParams.get("error") === "access_denied" ? "declined" : "provider_error");
  }
  const code = searchParams.get("code");
  if (!code) return done("error", "invalid_response");

  try {
    const cookieValue = request.headers
      .get("cookie")
      ?.split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith(`${PLATFORM_STATE_COOKIE}=`))
      ?.slice(PLATFORM_STATE_COOKIE.length + 1);
    const pending = decodePending(cookieValue ? decodeURIComponent(cookieValue) : null);
    if (!pending || pending.platform !== platform || !stateMatches(searchParams.get("state"), pending.state)) {
      console.warn(`[${platform}/callback] OAuth state mismatch`);
      return done("error", "invalid_state");
    }

    const tokens = await exchangeCode(pending, code).catch((e) => {
      console.error(`[${platform}/callback] code exchange failed:`, e);
      return null;
    });
    if (!tokens) return done("error", "exchange_failed");

    const account = await fetchAccount(platform, tokens.access_token).catch((e) => {
      console.error(`[${platform}/callback] account lookup failed:`, e);
      return null;
    });
    if (!account) return done("error", "account_lookup_failed");

    const saved = await saveConnection(user.id, platform, account, tokens);
    if (saved.error) return done("error", saved.error);
    return done("connected");
  } catch (error) {
    if (error instanceof MissingConfigError) return done("error", "not_configured");
    throw error;
  }
}
