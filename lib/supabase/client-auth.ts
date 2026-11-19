import { getSupabaseBrowserClient } from "./browser.ts";

/**
 * Resolves the browser session into one of three states.
 *
 * The old pages treated *any* failure of `auth.getUser()` as "signed out" and
 * pushed to /login. When the failure was really a network or auth-server
 * hiccup, the server-side proxy still saw a valid session and sent the user
 * straight back to the page — an endless loader/redirect loop. Only a missing
 * or rejected session means signed out; everything else is a retryable error.
 */
import { classifyAuthResult, type ClientAuth } from "./auth-state.ts";

export { classifyAuthResult, type ClientAuth };

export async function resolveClientAuth(timeoutMs = 12_000): Promise<ClientAuth> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      getSupabaseBrowserClient().auth.getUser(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("auth timeout")), timeoutMs);
      }),
    ]);
    return classifyAuthResult(result.data.user, result.error);
  } catch {
    return { status: "error", message: "This is taking longer than usual. Check your connection and try again." };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Full-page navigation to sign-in, preserving where the user was going. */
export function loginUrl(nextPath: string): string {
  return `/login?next=${encodeURIComponent(nextPath)}`;
}
