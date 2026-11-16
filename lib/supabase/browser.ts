import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "../env.ts";

/**
 * Browser Supabase client. Carries the publishable key only, so every query it
 * makes is subject to Row Level Security.
 *
 * Created lazily rather than at module scope: a module-scope client is
 * constructed during prerendering, where the public env vars may be absent, and
 * the resulting throw fails the whole production build.
 */
let client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (!client) {
    client = createBrowserClient(
      publicEnv.supabaseUrl,
      publicEnv.supabasePublishableKey,
    );
  }
  return client;
}
