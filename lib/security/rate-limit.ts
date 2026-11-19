/**
 * Rate limiting for public endpoints.
 *
 * The original implementation had none, which left `/api/tts` and
 * `/api/stickers/generate` — both of which spend real money per call on the
 * OpenAI account — open to anyone with curl, and left order creation open to
 * flooding Razorpay with orders.
 *
 * Scope and honesty about it: this is an in-process fixed-window counter. On a
 * single long-lived server it is a correct limiter. On a horizontally scaled or
 * serverless deployment each instance keeps its own counter, so the effective
 * limit is the configured limit multiplied by the number of live instances. It
 * is therefore a real mitigation against casual abuse and accidental loops, and
 * it is NOT a substitute for a shared store. For a production deployment behind
 * more than one instance, back `consume()` with Upstash Redis or Postgres; the
 * call sites do not change. This limitation is stated in the README rather than
 * left for someone to discover from a bill.
 *
 * Payment-authorised endpoints do not rely on this alone — they additionally
 * consume a single-use claim row, which is strictly enforced in the database.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Caps memory if a flood arrives with many distinct keys. */
const MAX_TRACKED_KEYS = 20_000;

function sweep(now: number) {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) {
      windows.delete(key);
    }
  }
}

export interface RateLimitRule {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfterSeconds: number;
}

export function consume(
  key: string,
  rule: RateLimitRule,
  now: number = Date.now(),
): RateLimitResult {
  if (windows.size > MAX_TRACKED_KEYS) {
    sweep(now);
  }

  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + rule.windowMs });
    return {
      allowed: true,
      remaining: rule.limit - 1,
      retryAfterSeconds: Math.ceil(rule.windowMs / 1000),
    };
  }

  existing.count += 1;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((existing.resetAt - now) / 1000),
  );

  if (existing.count > rule.limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  return {
    allowed: true,
    remaining: rule.limit - existing.count,
    retryAfterSeconds,
  };
}

/** Clears all counters. Test-only. */
export function resetRateLimits() {
  windows.clear();
}

/**
 * Best-effort client identity for rate limiting.
 *
 * `x-forwarded-for` is client-controllable unless a trusted proxy overwrites
 * it. On Vercel it is set by the platform, so the leftmost entry is the real
 * client. Behind any other proxy, confirm that assumption before relying on
 * per-IP limits for anything stronger than abuse damping.
 */
export function clientIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}

/** Named rules, so limits are visible in one place rather than scattered. */
export const RATE_LIMITS = {
  /** Order creation: enough for genuine retries, not for flooding Razorpay. */
  createOrder: { limit: 10, windowMs: 60_000 },
  /** Payment verification: generous, since a viewer may legitimately retry. */
  verifyPayment: { limit: 20, windowMs: 60_000 },
  /** Submission insertion. */
  submitInteraction: { limit: 15, windowMs: 60_000 },
  /** Billable OpenAI calls, keyed per payment as well as per IP. */
  aiGeneration: { limit: 6, windowMs: 60_000 },
  /** OBS polls once or twice a second; this is a ceiling, not a target. */
  overlayPoll: { limit: 240, windowMs: 60_000 },
  /** Authenticated creator writes. */
  creatorWrite: { limit: 60, windowMs: 60_000 },
  /** Signed upload URL issuance for viewer voice notes. */
  uploadTicket: { limit: 12, windowMs: 60_000 },
  /** Owner/admin panel reads and writes. */
  admin: { limit: 120, windowMs: 60_000 },
  /** Withdrawal requests. */
  payoutRequest: { limit: 5, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;
