import type { Metadata } from "next";

import SignupClient from "./SignupClient";

/**
 * Dynamic server shell.
 *
 * This route depends on the request — a Supabase session, or the query string —
 * so it must not be prerendered. Without this, `next build` renders the client
 * component at build time, where there is no session and no public environment
 * configured, and the build fails constructing a Supabase client.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create your StreamLounge creator account.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <SignupClient />;
}
