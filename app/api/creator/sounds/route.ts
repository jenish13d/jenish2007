import {
  apiError,
  apiSuccess,
  readJsonBody,
  withErrorHandling,
} from "@/lib/http/responses";
import {
  MEDIA_SIGNED_URL_TTL_SECONDS,
  SOUNDBOARD_AUDIO_BUCKET,
} from "@/lib/storage/soundboard";
import {
  RATE_LIMITS,
  clientIdentifier,
  consume,
} from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSoundSchema,
  fieldErrors,
  updateSoundSchema,
  uuidSchema,
} from "@/lib/validation/schemas";

/**
 * The creator's own soundboard.
 *
 * GET    — list their sounds and the global presets, with preview URLs.
 * POST   — register an uploaded clip.
 * PATCH  — rename or toggle one.
 * DELETE — remove one, and its stored object.
 *
 * Every handler runs through the cookie-backed client. The write policies in
 * migration 0004 restrict insert, update and delete to `auth.uid() = creator_id`,
 * and the storage policies restrict objects to the creator's own folder, so a
 * forged `creator_id` in a payload has no effect.
 */

async function requireCreator() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export const GET = withErrorHandling("creator/sounds#GET", async () => {
  const { supabase, user } = await requireCreator();
  if (!user) {
    return apiError("unauthorized", "Sign in to manage your soundboard.");
  }

  const { data, error } = await supabase
    .from("soundboard_sounds")
    .select("id, creator_id, name, storage_path, image_path, enabled, created_at")
    .or(`creator_id.eq.${user.id},creator_id.is.null`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[creator/sounds#GET] query failed:", error.message);
    return apiError("internal_error", "Could not load your soundboard.");
  }

  // Preview URLs are minted here rather than stored, so a leaked response body
  // stops working within the TTL.
  const sounds = await Promise.all(
    (data ?? []).map(async (sound) => {
      let previewUrl: string | null = null;
      if (sound.storage_path) {
        const { data: signed } = await supabase.storage
          .from(SOUNDBOARD_AUDIO_BUCKET)
          .createSignedUrl(sound.storage_path, MEDIA_SIGNED_URL_TTL_SECONDS);
        previewUrl = signed?.signedUrl ?? null;
      }
      return {
        id: sound.id,
        name: sound.name,
        enabled: sound.enabled,
        is_preset: sound.creator_id === null,
        created_at: sound.created_at,
        preview_url: previewUrl,
      };
    }),
  );

  return apiSuccess({ sounds });
});

export const POST = withErrorHandling("creator/sounds#POST", async (request: Request) => {
  const limit = consume(`sounds:${clientIdentifier(request)}`, RATE_LIMITS.creatorWrite);
  if (!limit.allowed) {
    return apiError("rate_limited", "Too many changes at once.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { supabase, user } = await requireCreator();
  if (!user) {
    return apiError("unauthorized", "Sign in to add sounds.");
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = createSoundSchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError("validation_failed", "Check the sound details.", {
      fields: fieldErrors(parsed.error),
    });
  }

  // The stored path must sit under the creator's own folder. Without this a
  // creator could register a row pointing at another creator's clip and have
  // the overlay sign and play it for their viewers.
  const expectedPrefix = `${user.id}/`;
  if (!parsed.data.storage_path.startsWith(expectedPrefix)) {
    return apiError("forbidden", "That file path is not in your own folder.");
  }
  if (parsed.data.storage_path.includes("..")) {
    return apiError("forbidden", "That file path is not allowed.");
  }

  const { data, error } = await supabase
    .from("soundboard_sounds")
    .insert({
      creator_id: user.id,
      name: parsed.data.name,
      storage_path: parsed.data.storage_path,
      image_path: parsed.data.image_path ?? null,
      enabled: parsed.data.enabled,
    })
    .select("id, name, enabled, created_at")
    .single();

  if (error) {
    console.error("[creator/sounds#POST] insert failed:", error.code, error.message);
    return apiError("internal_error", "Could not add that sound.");
  }

  return apiSuccess({ sound: data }, { status: 201 });
});

export const PATCH = withErrorHandling("creator/sounds#PATCH", async (request: Request) => {
  const { supabase, user } = await requireCreator();
  if (!user) {
    return apiError("unauthorized", "Sign in to edit sounds.");
  }

  const body = await readJsonBody(request, 8 * 1024);
  if (!body.ok) return body.response;

  const parsed = updateSoundSchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError("validation_failed", "Check the sound details.", {
      fields: fieldErrors(parsed.error),
    });
  }

  const { id, ...updates } = parsed.data;
  if (Object.keys(updates).length === 0) {
    return apiError("bad_request", "There is nothing to update.");
  }

  const { data, error } = await supabase
    .from("soundboard_sounds")
    .update(updates)
    // Both predicates: RLS already restricts this, and an explicit creator_id
    // filter means a preset row (creator_id IS NULL) cannot be edited either.
    .eq("id", id)
    .eq("creator_id", user.id)
    .select("id, name, enabled")
    .maybeSingle();

  if (error) {
    console.error("[creator/sounds#PATCH] update failed:", error.message);
    return apiError("internal_error", "Could not update that sound.");
  }
  if (!data) {
    return apiError("not_found", "That sound is not one of yours.");
  }

  return apiSuccess({ sound: data });
});

export const DELETE = withErrorHandling("creator/sounds#DELETE", async (request: Request) => {
  const { supabase, user } = await requireCreator();
  if (!user) {
    return apiError("unauthorized", "Sign in to delete sounds.");
  }

  const id = new URL(request.url).searchParams.get("id");
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) {
    return apiError("bad_request", "Which sound should be deleted?");
  }

  // Read the path before deleting the row, so the stored object can be removed
  // too rather than being orphaned in the bucket.
  const { data: existing, error: lookupError } = await supabase
    .from("soundboard_sounds")
    .select("id, storage_path")
    .eq("id", parsedId.data)
    .eq("creator_id", user.id)
    .maybeSingle();

  if (lookupError) {
    console.error("[creator/sounds#DELETE] lookup failed:", lookupError.message);
    return apiError("internal_error", "Could not delete that sound.");
  }
  if (!existing) {
    return apiError("not_found", "That sound is not one of yours.");
  }

  const { error: deleteError } = await supabase
    .from("soundboard_sounds")
    .delete()
    .eq("id", existing.id)
    .eq("creator_id", user.id);

  if (deleteError) {
    console.error("[creator/sounds#DELETE] delete failed:", deleteError.message);
    return apiError("internal_error", "Could not delete that sound.");
  }

  if (existing.storage_path) {
    const { error: storageError } = await supabase.storage
      .from(SOUNDBOARD_AUDIO_BUCKET)
      .remove([existing.storage_path]);
    if (storageError) {
      // The row is gone, which is what the creator asked for. A leftover object
      // is a housekeeping matter, not a failure to report as one.
      console.warn(
        `[creator/sounds#DELETE] orphaned object '${existing.storage_path}':`,
        storageError.message,
      );
    }
  }

  return apiSuccess({ id: existing.id, deleted: true });
});
