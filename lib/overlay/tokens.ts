import crypto from "node:crypto";

import { serverEnv } from "../env.ts";

/**
 * Overlay capability tokens and creator overlay keys.
 *
 * Two distinct secrets live here, and they do different jobs:
 *
 *  - The *overlay key* is a long random string stored per creator. It is the
 *    credential in the OBS browser-source URL, and it authorises polling and
 *    claiming that creator's events. It is rotatable, so a creator who has
 *    leaked their URL on stream can invalidate it.
 *
 *  - The *overlay token* is a short-lived HMAC over one claimed submission. The
 *    overlay returns it when reporting playback finished, which proves the
 *    reporter is the same browser source that was handed the event.
 *
 * Why the overlay key exists at all: previously `/api/overlay/event` was keyed
 * on the creator's *public username* and required no secret. Anyone could poll
 * a creator's event endpoint, and because polling claims the next queued event
 * atomically, a third party could silently consume every alert the creator had
 * been paid for — the viewer pays, the creator's stream shows nothing, and the
 * attacker receives the signed media URLs and a valid playback token. A public
 * identifier cannot be a capability.
 */

export const OVERLAY_TOKEN_TTL_MS = 5 * 60 * 1000;

/** How long a claim may sit in `processing` before it is recoverable. */
export const STALE_PROCESSING_TIMEOUT_MS = 120 * 1000;

/* -------------------------------------------------------------------------- */
/* Overlay keys                                                               */
/* -------------------------------------------------------------------------- */

/** 32 bytes of randomness, url-safe. */
export function generateOverlayKey(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Constant-time overlay key comparison.
 *
 * A plain `===` on a secret leaks length and prefix through timing. The keys are
 * hashed to a fixed width first so that comparing keys of different lengths is
 * still constant-time.
 */
export function overlayKeyMatches(
  provided: string | null | undefined,
  stored: string | null | undefined,
): boolean {
  if (!provided || !stored) return false;

  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(stored).digest();
  return crypto.timingSafeEqual(a, b);
}

/* -------------------------------------------------------------------------- */
/* Playback tokens                                                            */
/* -------------------------------------------------------------------------- */

const SEPARATOR = ".";

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function canonicalPayload(
  submissionId: string,
  creatorId: string,
  exp: number,
): string {
  return [
    "streamlounge:overlay:v2",
    submissionId,
    creatorId,
    String(exp),
  ].join(":");
}

export function generateOverlayToken(
  submissionId: string,
  creatorId: string,
  ttlMs: number = OVERLAY_TOKEN_TTL_MS,
  now: number = Date.now(),
  secret: string = serverEnv.overlaySigningSecret(),
): string {
  if (!submissionId) {
    throw new Error("Cannot sign an overlay token without a submission id.");
  }
  if (!creatorId) {
    throw new Error("Cannot sign an overlay token without a creator id.");
  }

  const exp = now + ttlMs;
  const signature = sign(canonicalPayload(submissionId, creatorId, exp), secret);
  return [submissionId, creatorId, String(exp), signature].join(SEPARATOR);
}

export type OverlayTokenVerification =
  | { valid: true; submissionId: string; creatorId: string; expiresAt: number }
  | { valid: false; reason: string };

/**
 * Verifies a playback token.
 *
 * The caller passes the submission id and creator id it read from the database
 * for the row it is about to transition, and both must match the token. That
 * ordering matters: the token is checked against the stored row, never against
 * values taken from the request body.
 */
export function verifyOverlayToken(
  token: string,
  expectedSubmissionId: string,
  expectedCreatorId: string,
  now: number = Date.now(),
  secret: string = serverEnv.overlaySigningSecret(),
): OverlayTokenVerification {
  if (!token || typeof token !== "string") {
    return { valid: false, reason: "Missing overlay token." };
  }

  const parts = token.split(SEPARATOR);
  if (parts.length !== 4) {
    return { valid: false, reason: "Malformed overlay token." };
  }

  const [submissionId, creatorId, expStr, signature] = parts;
  const exp = Number(expStr);

  if (!Number.isFinite(exp)) {
    return { valid: false, reason: "Malformed overlay token expiry." };
  }

  const expected = sign(canonicalPayload(submissionId, creatorId, exp), secret);
  let signatureOk = false;
  if (/^[0-9a-f]{64}$/i.test(signature)) {
    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(expected, "hex");
    signatureOk = a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  if (!signatureOk) {
    return { valid: false, reason: "Invalid overlay token signature." };
  }

  if (submissionId !== expectedSubmissionId) {
    return { valid: false, reason: "Overlay token is for a different submission." };
  }
  if (creatorId !== expectedCreatorId) {
    return { valid: false, reason: "Overlay token is for a different creator." };
  }
  if (now > exp) {
    return { valid: false, reason: "Overlay token has expired." };
  }

  return { valid: true, submissionId, creatorId, expiresAt: exp };
}

/* -------------------------------------------------------------------------- */
/* Queue eligibility                                                          */
/* -------------------------------------------------------------------------- */

/** Only a captured payment that has not yet been played may be queued. */
export function isEligibleForOverlayQueue(submission: {
  payment_status: string;
  status: string;
}): boolean {
  return (
    submission?.payment_status === "paid" && submission?.status === "pending"
  );
}

export function canTransitionFromProcessing(
  submission: { status: string; creator_id: string } | null,
  expectedCreatorId: string,
): { allowed: boolean; reason?: string } {
  if (!submission) {
    return { allowed: false, reason: "Submission not found." };
  }
  if (submission.creator_id !== expectedCreatorId) {
    return { allowed: false, reason: "Submission belongs to another creator." };
  }
  if (submission.status !== "processing") {
    return {
      allowed: false,
      reason: `Submission is '${submission.status}', not 'processing'.`,
    };
  }
  return { allowed: true };
}
