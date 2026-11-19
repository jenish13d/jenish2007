import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Authenticated encryption for third-party OAuth tokens stored in Postgres.
 *
 * Format: `v1:<iv b64url>:<tag b64url>:<ciphertext b64url>` (AES-256-GCM,
 * 96-bit random IV). The `aad` binds a ciphertext to its owner and purpose, so
 * a token copied into another creator's row fails to decrypt.
 *
 * Rows written before encryption was introduced hold plaintext; `openToken`
 * passes those through so existing connections keep working until they are
 * next refreshed, at which point they are re-written encrypted.
 */

const PREFIX = "v1";

function keyFrom(hex: string): Buffer {
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("Token encryption key must be 32 bytes.");
  }
  return key;
}

export function sealToken(plaintext: string, keyHex: string, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(keyHex), iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), body.toString("base64url")].join(":");
}

export function isSealed(value: string): boolean {
  return value.startsWith(`${PREFIX}:`) && value.split(":").length === 4;
}

/** Throws if a sealed value has been tampered with or the key/aad is wrong. */
export function openToken(value: string, keyHex: string, aad: string): string {
  if (!isSealed(value)) return value;
  const [, ivB64, tagB64, bodyB64] = value.split(":");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(keyHex), Buffer.from(ivB64, "base64url"));
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(bodyB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function sealNullable(value: string | null | undefined, keyHex: string, aad: string): string | null {
  return value ? sealToken(value, keyHex, aad) : null;
}

export function openNullable(value: string | null | undefined, keyHex: string, aad: string): string | null {
  return value ? openToken(value, keyHex, aad) : null;
}
