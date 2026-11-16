import { exactIlikePattern } from "@/lib/db/like";
import {
  apiError,
  apiSuccess,
  readJsonBody,
  withErrorHandling,
} from "@/lib/http/responses";
import { DEFAULT_OVERLAY_THEME, resolveOverlayTheme } from "@/lib/overlay/themes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fieldErrors, updateThemeSchema, usernameSchema } from "@/lib/validation/schemas";

/**
 * GET  /api/creator/theme?username=…  — the overlay theme for a public page.
 * GET  /api/creator/theme             — the signed-in creator's own theme.
 * POST /api/creator/theme             — save the signed-in creator's theme.
 */

export const GET = withErrorHandling("creator/theme#GET", async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  const username = new URL(request.url).searchParams.get("username")?.trim();

  if (username) {
    const parsedUsername = usernameSchema.safeParse(username);
    if (!parsedUsername.success) {
      return apiSuccess({ theme: DEFAULT_OVERLAY_THEME });
    }

    const { data } = await supabase
      .from("public_creator_profiles")
      .select("overlay_theme")
      .ilike("username", exactIlikePattern(parsedUsername.data))
      .eq("public_page_enabled", true)
      .limit(1)
      .maybeSingle();

    return apiSuccess({ theme: resolveOverlayTheme(data?.overlay_theme) });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("unauthorized", "Sign in to read your overlay theme.");
  }

  const { data, error } = await supabase
    .from("creator_profiles")
    .select("overlay_theme")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[creator/theme#GET] query failed:", error.message);
    return apiError("internal_error", "Could not load your overlay theme.");
  }

  return apiSuccess({ theme: resolveOverlayTheme(data?.overlay_theme) });
});

export const POST = withErrorHandling("creator/theme#POST", async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("unauthorized", "Sign in to change your overlay theme.");
  }

  const body = await readJsonBody(request, 2 * 1024);
  if (!body.ok) return body.response;

  const parsed = updateThemeSchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError("validation_failed", "Choose one of the available themes.", {
      fields: fieldErrors(parsed.error),
    });
  }

  const { data, error } = await supabase
    .from("creator_profiles")
    .update({ overlay_theme: parsed.data.theme })
    .eq("id", user.id)
    .select("overlay_theme")
    .maybeSingle();

  if (error) {
    console.error("[creator/theme#POST] update failed:", error.code, error.message);
    // The original route caught this, set `migrationPending: true` and still
    // returned `success: true`, so the dashboard showed the theme as saved
    // while the database was unchanged. A failed write is reported as a failure.
    return apiError(
      "internal_error",
      "Could not save your overlay theme. If this persists, the overlay_theme column may be missing — apply supabase/migrations/0002.",
    );
  }

  if (!data) {
    return apiError("forbidden", "That theme could not be saved.");
  }

  return apiSuccess({ theme: resolveOverlayTheme(data.overlay_theme) });
});
