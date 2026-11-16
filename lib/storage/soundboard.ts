import type { SupabaseClient } from "@supabase/supabase-js";

import type { SoundboardSound } from "../db/types.ts";

export const SOUNDBOARD_AUDIO_BUCKET = "soundboard-audio";
export const SOUNDBOARD_IMAGE_BUCKET = "soundboard-images";
export const INTERACTION_AUDIO_BUCKET = "interaction-audio";

/** Signed URL lifetime for media handed to an OBS browser source. */
export const MEDIA_SIGNED_URL_TTL_SECONDS = 600;

/**
 * Resolves a soundboard sound to a playable signed URL.
 *
 * This replaces a resolver that tried, in order: the stored path; the
 * URL-decoded path; the path's basename at the bucket root; a hardcoded table of
 * filenames matched by regex against the sound's name; and finally a
 * substring comparison against every global preset's name and path. Each of
 * those fallbacks existed to paper over bad stored paths, and together they
 * meant a request could be served audio belonging to a different row than the
 * one it asked for — the substring matching compared paths across creators.
 *
 * The rule now: a sound is identified by its primary key, the row must be
 * enabled and must belong either to the requesting creator or to the global
 * preset set, and the signed URL is minted from that row's stored path. If the
 * stored path does not resolve, that is a data problem to surface, not to guess
 * around.
 */

export type SoundResolution =
  | { ok: true; signedUrl: string; sound: SoundboardSound }
  | { ok: false; reason: "not_found" | "storage_error" };

export async function resolveSoundForCreator(
  supabase: SupabaseClient,
  soundId: string,
  creatorId: string,
): Promise<SoundResolution> {
  const { data, error } = await supabase
    .from("soundboard_sounds")
    .select("id, creator_id, name, storage_path, image_path, enabled, created_at")
    .eq("id", soundId)
    .eq("enabled", true)
    // Either the creator's own sound, or a global preset (creator_id IS NULL).
    .or(`creator_id.eq.${creatorId},creator_id.is.null`)
    .maybeSingle<SoundboardSound>();

  if (error) {
    console.error("[soundboard] lookup failed:", error.message);
    return { ok: false, reason: "storage_error" };
  }
  if (!data || !data.storage_path) {
    return { ok: false, reason: "not_found" };
  }

  const path = data.storage_path.trim().replace(/^\/+/, "");
  if (!path) {
    return { ok: false, reason: "not_found" };
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(SOUNDBOARD_AUDIO_BUCKET)
    .createSignedUrl(path, MEDIA_SIGNED_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    console.error(
      `[soundboard] could not sign '${path}' for sound ${data.id}:`,
      signError?.message ?? "no url returned",
    );
    return { ok: false, reason: "storage_error" };
  }

  return { ok: true, signedUrl: signed.signedUrl, sound: data };
}

/**
 * Signs a viewer voice note for playback.
 *
 * The path is validated against the expected layout before signing, so a
 * tampered `storage_path` on a submission cannot be used to read an arbitrary
 * object out of the bucket.
 */
export async function signInteractionAudio(
  supabase: SupabaseClient,
  storagePath: string,
  creatorId: string,
): Promise<string | null> {
  if (!isInteractionAudioPathFor(storagePath, creatorId)) {
    console.error(
      `[storage] refusing to sign '${storagePath}': outside creator ${creatorId}'s prefix`,
    );
    return null;
  }

  const { data, error } = await supabase.storage
    .from(INTERACTION_AUDIO_BUCKET)
    .createSignedUrl(storagePath, MEDIA_SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    console.error(`[storage] could not sign '${storagePath}':`, error?.message);
    return null;
  }
  return data.signedUrl;
}

/* -------------------------------------------------------------------------- */
/* Path layout                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Viewer voice notes live at `<creator_id>/<random>.<ext>`.
 *
 * Keeping the creator id as the first path segment is what makes a storage
 * policy expressible at all, and it is what lets the signing path above verify
 * ownership without a database round-trip.
 */
export function interactionAudioPrefix(creatorId: string): string {
  return `${creatorId}/`;
}

export function isInteractionAudioPathFor(
  path: string,
  creatorId: string,
): boolean {
  if (!path || typeof path !== "string") return false;

  // Reject traversal, absolute paths, and anything with a path segment that
  // could escape the prefix.
  if (path.startsWith("/") || path.includes("..") || path.includes("\\")) {
    return false;
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(path)) {
    return false;
  }

  const prefix = interactionAudioPrefix(creatorId);
  if (!path.startsWith(prefix)) return false;

  // Exactly one level below the creator folder.
  const remainder = path.slice(prefix.length);
  return remainder.length > 0 && !remainder.includes("/");
}

/** Audio MIME types accepted for a viewer voice note. */
export const ALLOWED_AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-m4a",
] as const;

/** Ceiling on a voice note, in bytes. A 60-second clip is well under this. */
export const MAX_AUDIO_UPLOAD_BYTES = 5 * 1024 * 1024;

const EXTENSION_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/x-m4a": "m4a",
};

export function isAllowedAudioMime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (ALLOWED_AUDIO_MIME_TYPES as readonly string[]).includes(value)
  );
}

export function extensionForAudioMime(mime: string): string {
  return EXTENSION_BY_MIME[mime] ?? "bin";
}

/** Image MIME types accepted for soundboard artwork and profile media. */
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export const MAX_IMAGE_UPLOAD_BYTES = 2 * 1024 * 1024;

export function isAllowedImageMime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(value)
  );
}
