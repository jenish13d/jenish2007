import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/http/safe-redirect";
import { classifyAuthResult, type ClientAuth } from "@/lib/supabase/auth-state";
import { createTimeoutFetch } from "@/lib/supabase/timeout-fetch";

/**
 * Session refresh and route protection.
 *
 * Named `proxy` rather than `middleware`: Next.js 16 renamed the convention,
 * and the named export must match. The runtime is Node, not Edge, and is not
 * configurable.
 *
 * Two jobs:
 *   1. Refresh the Supabase session cookie on navigation, so a creator is not
 *      logged out mid-session. Server Components cannot write cookies, so this
 *      is the only place the refresh can be persisted.
 *   2. Keep unauthenticated visitors out of the dashboard. This is a redirect
 *      for the sake of the user experience and is NOT the authorisation
 *      boundary — every API route re-checks the session, and RLS is the real
 *      control. A cookie check at the edge of the app is not something to rely
 *      on for access control.
 */

const PROTECTED_PREFIXES = ["/dashboard", "/creator", "/admin", "/me"] as const;
const AUTH_PAGES = ["/login", "/signup"] as const;

/** Old links that should keep working. */
const LEGACY_REDIRECTS: Record<string, string> = {
  "/dashboard/settings": "/dashboard/interactions",
};

/**
 * Segment-aware prefix match. A plain `startsWith("/creator")` also matched
 * public creator pages such as `/creator_a` or `/meera`, sending their viewers
 * to the login screen.
 */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

const PROXY_AUTH_TIMEOUT_MS = 5_000;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const legacy = LEGACY_REDIRECTS[pathname];
  if (legacy) {
    const target = request.nextUrl.clone();
    target.pathname = legacy;
    return NextResponse.redirect(target, 308);
  }

  const isAuthPage = AUTH_PAGES.includes(pathname as (typeof AUTH_PAGES)[number]);
  const isProtected = isProtectedPath(pathname);

  let response = NextResponse.next({ request });

  // Public pages (home, creator pages, LoungeBoard) never need the auth
  // round trip; skipping it removes a Supabase call from every public view.
  if (!isAuthPage && !isProtected) {
    return response;
  }

  // Without configuration there is no session to refresh and nothing useful to
  // do; let the request through and let the page report the misconfiguration.
  if (!publicEnv.supabaseUrl || !publicEnv.supabasePublishableKey) {
    return response;
  }

  const supabase = createServerClient(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
    {
      global: { fetch: createTimeoutFetch(PROXY_AUTH_TIMEOUT_MS) },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser, not getSession: this validates the token with the auth server
  // rather than trusting the cookie's contents. A network failure or timeout
  // is NOT treated as "signed out": redirecting on it is what created the
  // dashboard <-> login loop. The page itself re-checks and can show a retry.
  let auth: ClientAuth;
  try {
    const { data, error } = await supabase.auth.getUser();
    auth = classifyAuthResult(data.user, error);
  } catch {
    auth = { status: "error", message: "auth unavailable" };
  }

  if (auth.status === "signed_out" && isProtected) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.search = "";
    target.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(target);
  }

  if (auth.status === "signed_in" && isAuthPage) {
    let next = safeNextPath(request.nextUrl.searchParams.get("next"));
    // Never bounce back onto an auth page (that would loop).
    if (AUTH_PAGES.some((page) => next === page || next.startsWith(`${page}?`))) next = "/dashboard";
    return NextResponse.redirect(new URL(next, request.url));
  }

  return response;
}

export const config = {
  /**
   * Only pages that need a session decision run the proxy. The OBS overlay,
   * webhooks, static assets and public creator pages are skipped entirely.
   * API routes validate the session themselves.
   */
  matcher: [
    "/dashboard/:path*",
    "/creator/:path*",
    "/admin/:path*",
    "/me/:path*",
    "/login",
    "/signup",
  ],
};
