import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "../env.ts";
import { createTimeoutFetch } from "./timeout-fetch.ts";

/**
 * Privileged Supabase client. Uses the service-role key, so it bypasses RLS
 * entirely.
 *
 * It exists for exactly three callers, each of which has no user session and so
 * cannot be authorised by RLS:
 *
 *   1. The Razorpay webhook, which arrives from Razorpay's servers with no
 *      cookies and must still record a payment.
 *   2. The OBS overlay event endpoint, which is authorised by a creator's
 *      secret overlay key rather than by a Supabase session, and must claim a
 *      queued submission atomically.
 *   3. Viewer submission insertion, after the server has independently verified
 *      the payment with Razorpay.
 *
 * The alternative — granting `anon` insert and update rights on
 * `creator_submissions` so a cookie-less client could write — is what the
 * original implementation effectively required, and it hands every anonymous
 * visitor write access to the submissions table. A server-only privileged
 * client with the authorisation decision made in application code above it is
 * the narrower choice.
 *
 * Every caller MUST establish authorisation before using this client. There is
 * no RLS backstop here.
 */

let cached: SupabaseClient | null = null;

export function getSupabaseServiceClient(): SupabaseClient {
  // Guard against this module ever being pulled into a client bundle. If that
  // happens the service-role key would be serialised into JavaScript served to
  // browsers, which is the single worst outcome available in this codebase.
  if (typeof window !== "undefined") {
    throw new Error(
      "lib/supabase/service.ts was imported in a browser context. " +
        "The service-role client is server-only.",
    );
  }

  if (!cached) {
    cached = createClient(
      serverEnv.supabaseUrl(),
      serverEnv.supabaseServiceRoleKey(),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          fetch: createTimeoutFetch(15_000),
          headers: { "X-Client-Info": "streamlounge-server" },
        },
      },
    );
  }

  return cached;
}
