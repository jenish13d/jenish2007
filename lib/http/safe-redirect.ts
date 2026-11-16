/**
 * Returns `next` only when it is a same-site path, otherwise `fallback`.
 *
 * Rejects protocol-relative URLs (`//evil.com`) and the backslash forms
 * (`/\evil.com`) that browsers normalise into them.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
