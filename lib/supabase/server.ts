import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { serverEnv } from "../env.ts";

/**
 * Request-scoped Supabase client bound to the caller's session cookies.
 *
 * Use this for anything acting *as the signed-in creator*: reading their own
 * profile, editing their interactions, listing their sounds. RLS applies, which
 * is the point — the policies are the authorisation boundary and this client
 * keeps them in force.
 *
 * Do not use it for work that has no user session (Razorpay webhooks, OBS
 * overlay polling). That was the original implementation's central bug: the
 * webhook built a cookie-backed client, received no cookies from Razorpay, and
 * so ran as `anon`. Its submission insert then either failed under RLS or
 * required `anon` to hold write access on `creator_submissions`. Those paths now
 * use `lib/supabase/service.ts` instead.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    serverEnv.supabaseUrl(),
    serverEnv.supabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Writing cookies throws when called from a Server Component render
            // pass. Session refresh is handled in `proxy.ts`, so ignoring it
            // here is safe.
          }
        },
      },
    },
  );
}

/**
 * Returns the authenticated user, or `null`.
 *
 * Always goes through `getUser()`, which validates the JWT against the auth
 * server, never `getSession()`, which trusts whatever the cookie claims.
 */
export async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }
  return user;
}
