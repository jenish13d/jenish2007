/**
 * fetch with a hard deadline, for every Supabase request.
 *
 * Without it a single hung request (mobile network drop, a stalled token
 * refresh, a slow auth server) leaves `await supabase...` pending forever and
 * every page that awaits it sits on its loading screen with no way out. With a
 * deadline the promise rejects, callers fall into their error path, and the UI
 * can offer a retry.
 *
 * Storage uploads (voice notes, sounds, images) legitimately take longer, so
 * they get a longer budget rather than none.
 */
export const DEFAULT_TIMEOUT_MS = 15_000;
export const STORAGE_TIMEOUT_MS = 180_000;

export function pickTimeout(url: string, method: string, fallback: number): number {
  const isUpload =
    (method === "POST" || method === "PUT") &&
    url.includes("/storage/v1/object/") &&
    !url.includes("/storage/v1/object/sign/");
  return isUpload ? STORAGE_TIMEOUT_MS : fallback;
}

export function createTimeoutFetch(defaultMs: number = DEFAULT_TIMEOUT_MS): typeof fetch {
  return (input, init = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const ms = pickTimeout(url, method, defaultMs);
    const timeout = AbortSignal.timeout(ms);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetch(input, { ...init, signal });
  };
}
