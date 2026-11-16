import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/lib/env";

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

const PROTECTED_PREFIXES = ["/dashboard", "/creator"] as const;
const AUTH_PAGES = ["/login", "/signup"] as const;

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Without configuration there is no session to refresh and nothing useful to
  // do; let the request through and let the page report the misconfiguration.
  if (!publicEnv.supabaseUrl || !publicEnv.supabasePublishableKey) {
    return response;
  }

  const supabase = createServerClient(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
    {
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
  // rather than trusting the cookie's contents.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.searchParams.set("next", pathname);
    return NextResponse.redirect(target);
  }

  if (user && AUTH_PAGES.includes(pathname as (typeof AUTH_PAGES)[number])) {
    const target = request.nextUrl.clone();
    target.pathname = "/dashboard";
    target.search = "";
    return NextResponse.redirect(target);
  }

  return response;
}

export const config = {
  /**
   * Skips static assets and the OBS overlay.
   *
   * The overlay is excluded deliberately: it is authorised by its own overlay
   * key, it polls continuously, and it must keep working in an OBS browser
   * source that holds no Supabase session. Running a session refresh against it
   * on every poll would be pure overhead.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|obs|overlay|api/overlay|api/payments/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|webm)$).*)",
  ],
};
