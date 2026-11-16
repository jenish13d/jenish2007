import { exactIlikePattern } from "@/lib/db/like";
import {
  apiError,
  apiSuccess,
  readJsonBody,
  withErrorHandling,
} from "@/lib/http/responses";
import {
  RATE_LIMITS,
  clientIdentifier,
  consume,
} from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fieldErrors, updateProfileSchema } from "@/lib/validation/schemas";

/**
 * GET  /api/creator/profile — the signed-in creator's own profile.
 * PATCH /api/creator/profile — update it.
 *
 * Both act through the cookie-backed client, so RLS enforces that a creator can
 * only read and write their own row. `creator_id` is never accepted from the
 * body: the row is identified by `auth.uid()`.
 */

export const GET = withErrorHandling("creator/profile#GET", async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("unauthorized", "Sign in to view your profile.");
  }

  const { data, error } = await supabase
    .from("creator_profiles")
    .select(
      `id, creator_name, username, bio, profile_image_url, banner_image_url,
       public_page_enabled, audio_upload_enabled, overlay_theme,
       instagram_url, twitter_url, youtube_url, discord_url,
       youtube_connected, youtube_channel_id, youtube_channel_name,
       youtube_handle, youtube_avatar_url, youtube_banner_url,
       youtube_subscribers, created_at`,
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[creator/profile#GET] query failed:", error.message);
    return apiError("internal_error", "Could not load your profile.");
  }
  if (!data) {
    return apiError("not_found", "Your creator profile has not been created yet.");
  }

  return apiSuccess({ profile: data, email: user.email ?? null });
});

export const PATCH = withErrorHandling(
  "creator/profile#PATCH",
  async (request: Request) => {
    const limit = consume(
      `profile:${clientIdentifier(request)}`,
      RATE_LIMITS.creatorWrite,
    );
    if (!limit.allowed) {
      return apiError("rate_limited", "Too many changes at once.", {
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError("unauthorized", "Sign in to update your profile.");
    }

    const body = await readJsonBody(request);
    if (!body.ok) return body.response;

    const parsed = updateProfileSchema.safeParse(body.value);
    if (!parsed.success) {
      return apiError("validation_failed", "Check the details and try again.", {
        fields: fieldErrors(parsed.error),
      });
    }

    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      return apiError("bad_request", "There is nothing to update.");
    }

    // A username change needs a uniqueness check that is case-insensitive,
    // because the public page resolves usernames case-insensitively and two
    // creators differing only in case would make both pages ambiguous — the
    // public RPC returns no rows for an ambiguous match, so both would break.
    if (updates.username) {
      const { data: clash, error: clashError } = await supabase
        .from("creator_profiles")
        .select("id")
        .ilike("username", exactIlikePattern(updates.username))
        .neq("id", user.id)
        .limit(1);

      if (clashError) {
        console.error("[creator/profile#PATCH] username check failed:", clashError.message);
        return apiError("internal_error", "Could not verify that username.");
      }
      if (clash?.length) {
        return apiError("conflict", "That username is taken.", {
          fields: { username: "Already in use." },
        });
      }
    }

    const { data, error } = await supabase
      .from("creator_profiles")
      .update(updates)
      .eq("id", user.id)
      .select("id, username, public_page_enabled")
      .maybeSingle();

    if (error) {
      console.error("[creator/profile#PATCH] update failed:", error.code, error.message);
      // 23505 is the unique index on username, in case of a race with the check
      // above.
      if (error.code === "23505") {
        return apiError("conflict", "That username is taken.", {
          fields: { username: "Already in use." },
        });
      }
      return apiError("internal_error", "Could not save your profile.");
    }

    // An update that matches no row means RLS rejected it. Reporting success
    // here is what the original theme route did — it returned
    // `success: true, migrationPending: true` when the write had failed — and a
    // creator then believed a setting was saved when it was not.
    if (!data) {
      return apiError("forbidden", "That profile could not be updated.");
    }

    return apiSuccess({ profile: data });
  },
);
