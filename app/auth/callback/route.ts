import { NextResponse } from "next/server";

import { safeNextPath } from "@/lib/http/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /auth/callback
 *
 * Landing point for Supabase email links (password reset, sign-up
 * confirmation). Exchanges the one-time `code` for a session cookie, then
 * redirects to `next` (same-site paths only).
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
    console.error("[auth/callback] code exchange failed:", error.message);
  }

  const failure = new URL("/login", url.origin);
  failure.searchParams.set("error", "link_expired");
  return NextResponse.redirect(failure);
}
