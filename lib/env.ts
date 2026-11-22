/**
 * Centralised environment access.
 *
 * Design rules:
 * - Secrets are read lazily, at the point of use, so that a missing optional
 *   credential never breaks an unrelated feature or the production build.
 * - There are NO fallback or derived secrets. The previous implementation
 *   derived the overlay and payment signing keys from RAZORPAY_KEY_SECRET and,
 *   failing that, from a hardcoded string literal. That meant a deployment with
 *   no configured secret still produced verifiable tokens using a value that is
 *   public in the source history. Every signing key is now required and
 *   independent, and the relevant operation fails closed when one is absent.
 * - Nothing in this module is importable into client bundles except the
 *   explicitly public values.
 */

/** Thrown when a server-only secret is required but not configured. */
export class MissingConfigError extends Error {
  readonly variable: string;

  constructor(variable: string, hint?: string) {
    super(
      `Required environment variable ${variable} is not configured.${
        hint ? ` ${hint}` : ""
      }`,
    );
    this.name = "MissingConfigError";
    this.variable = variable;
  }
}

function required(name: string, hint?: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new MissingConfigError(name, hint);
  }
  return value.trim();
}

function optional(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

/**
 * Minimum entropy for an HMAC signing key, in characters.
 *
 * 32 characters of hex is 128 bits, which is the floor for a key that signs
 * capability tokens. Anything shorter is rejected rather than silently accepted,
 * because a short key is the failure mode that looks like a working config.
 */
const MIN_SIGNING_SECRET_LENGTH = 32;

function requiredSigningSecret(name: string): string {
  const value = required(
    name,
    `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
  );
  if (value.length < MIN_SIGNING_SECRET_LENGTH) {
    throw new MissingConfigError(
      name,
      `It must be at least ${MIN_SIGNING_SECRET_LENGTH} characters of cryptographically random data.`,
    );
  }
  return value;
}

/* -------------------------------------------------------------------------- */
/* Public values — safe to reach client bundles                               */
/* -------------------------------------------------------------------------- */

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabasePublishableKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
} as const;

/* -------------------------------------------------------------------------- */
/* Server-only accessors                                                      */
/* -------------------------------------------------------------------------- */

export const serverEnv = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabasePublishableKey: () =>
    required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),

  /**
   * Service-role key. Grants full database access and bypasses RLS, so it is
   * only ever read inside `lib/supabase/service.ts`, which is import-guarded
   * against client bundles.
   */
  supabaseServiceRoleKey: () =>
    required(
      "SUPABASE_SERVICE_ROLE_KEY",
      "It is needed for webhook processing and overlay event claiming, which run without a user session.",
    ),

  razorpayKeyId: () => required("RAZORPAY_KEY_ID"),
  razorpayKeySecret: () => required("RAZORPAY_KEY_SECRET"),
  razorpayWebhookSecret: () => required("RAZORPAY_WEBHOOK_SECRET"),

  /** Independent HMAC key for overlay capability tokens. */
  overlaySigningSecret: () => requiredSigningSecret("OVERLAY_SIGNING_SECRET"),
  /** Independent HMAC key for payment authorisation tokens. */
  paymentSigningSecret: () => requiredSigningSecret("PAYMENT_SIGNING_SECRET"),

  openaiApiKey: () =>
    required(
      "OPENAI_API_KEY",
      "It is needed for text-to-speech and AI sticker generation.",
    ),


  twitchClientId: () => required("TWITCH_CLIENT_ID"),
  twitchClientSecret: () => required("TWITCH_CLIENT_SECRET"),
  kickClientId: () => required("KICK_CLIENT_ID"),
  kickClientSecret: () => required("KICK_CLIENT_SECRET"),

  /**
   * AES-256-GCM key (64 hex characters) for platform OAuth tokens at rest.
   * Independent of every other secret.
   */
  tokenEncryptionKey: () => {
    const value = required(
      "TOKEN_ENCRYPTION_KEY",
      `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
    if (!/^[0-9a-fA-F]{64}$/.test(value)) {
      throw new MissingConfigError(
        "TOKEN_ENCRYPTION_KEY",
        "It must be exactly 64 hexadecimal characters (32 random bytes).",
      );
    }
    return value;
  },

  appUrl: () => optional("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000",
} as const;

/** Reports which optional integrations are configured, without reading values. */
export function integrationStatus() {
  return {
    razorpay: Boolean(
      optional("RAZORPAY_KEY_ID") && optional("RAZORPAY_KEY_SECRET"),
    ),
    razorpayWebhook: Boolean(optional("RAZORPAY_WEBHOOK_SECRET")),
    overlaySigning: Boolean(optional("OVERLAY_SIGNING_SECRET")),
    paymentSigning: Boolean(optional("PAYMENT_SIGNING_SECRET")),
    openai: Boolean(optional("OPENAI_API_KEY")),
    serviceRole: Boolean(optional("SUPABASE_SERVICE_ROLE_KEY")),
    twitch: Boolean(
      optional("TWITCH_CLIENT_ID") && optional("TWITCH_CLIENT_SECRET"),
    ),
    kick: Boolean(optional("KICK_CLIENT_ID") && optional("KICK_CLIENT_SECRET")),
    tokenEncryption: Boolean(optional("TOKEN_ENCRYPTION_KEY")),
  };
}
