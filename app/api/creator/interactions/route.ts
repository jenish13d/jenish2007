import {
  apiError,
  apiSuccess,
  readJsonBody,
  withErrorHandling,
} from "@/lib/http/responses";
import {
  INTERACTION_TYPES,
  type InteractionType,
} from "@/lib/interactions/registry";
import { globalMinimumRupees } from "@/lib/payments/pricing";
import {
  RATE_LIMITS,
  clientIdentifier,
  consume,
} from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fieldErrors, updateInteractionsSchema } from "@/lib/validation/schemas";

/**
 * PUT /api/creator/interactions
 *
 * Saves the signed-in creator's interaction configuration: which interactions
 * are on, what each costs, and the wheel segments and task list.
 *
 * Prices are floored at the platform minimum here as well as at checkout, so a
 * creator cannot configure a price below it and then wonder why viewers are
 * charged more than the page says.
 */
export const PUT = withErrorHandling(
  "creator/interactions#PUT",
  async (request: Request) => {
    const limit = consume(
      `interactions:${clientIdentifier(request)}`,
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
      return apiError("unauthorized", "Sign in to manage your interactions.");
    }

    const body = await readJsonBody(request, 64 * 1024);
    if (!body.ok) return body.response;

    const parsed = updateInteractionsSchema.safeParse(body.value);
    if (!parsed.success) {
      return apiError("validation_failed", "Check the interaction settings.", {
        fields: fieldErrors(parsed.error),
      });
    }

    const seen = new Set<InteractionType>();
    for (const entry of parsed.data.interactions) {
      if (seen.has(entry.interaction_type)) {
        return apiError(
          "validation_failed",
          `'${entry.interaction_type}' appears more than once.`,
        );
      }
      seen.add(entry.interaction_type);
    }

    // Per-type minimums, fetched once rather than inside the loop.
    const minimums = new Map<InteractionType, number>();
    await Promise.all(
      INTERACTION_TYPES.map(async (type) => {
        minimums.set(type, await globalMinimumRupees(supabase, type));
      }),
    );

    const rows = parsed.data.interactions.map((entry) => {
      const minimum = minimums.get(entry.interaction_type) ?? 0;

      // `settings` holds only what the public RPC knows how to sanitise. A
      // creator cannot stash arbitrary JSON here and have it reach viewers:
      // the RPC extracts string arrays from `options` and `tasks` and returns
      // nothing else.
      const settings: Record<string, string[]> = {};
      if (entry.interaction_type === "spin_wheel" && entry.options) {
        settings.options = entry.options;
      }
      if (entry.interaction_type === "tasks" && entry.tasks) {
        settings.tasks = entry.tasks;
      }

      return {
        creator_id: user.id,
        interaction_type: entry.interaction_type,
        enabled: entry.enabled,
        price: Math.max(entry.price, minimum),
        settings,
      };
    });

    // A spin wheel with no segments and a task interaction with no tasks cannot
    // be completed by a viewer, so enabling them in that state would sell
    // something undeliverable.
    for (const entry of parsed.data.interactions) {
      if (
        entry.enabled &&
        entry.interaction_type === "spin_wheel" &&
        (!entry.options || entry.options.length < 2)
      ) {
        return apiError(
          "validation_failed",
          "Add at least two wheel segments before enabling the spin wheel.",
          { fields: { options: "At least two segments are required." } },
        );
      }
      if (
        entry.enabled &&
        entry.interaction_type === "tasks" &&
        (!entry.tasks || entry.tasks.length < 1)
      ) {
        return apiError(
          "validation_failed",
          "Add at least one task before enabling tasks.",
          { fields: { tasks: "At least one task is required." } },
        );
      }
    }

    // RLS confines this to the caller's own rows, and `creator_id` is taken
    // from the session rather than the body, so a creator cannot write another
    // creator's configuration even if they forge the payload.
    const { data, error } = await supabase
      .from("creator_interactions")
      .upsert(rows, { onConflict: "creator_id,interaction_type" })
      .select("interaction_type, enabled, price, settings");

    if (error) {
      console.error("[creator/interactions#PUT] upsert failed:", error.code, error.message);
      return apiError("internal_error", "Could not save your interactions.");
    }

    return apiSuccess({ interactions: data ?? [] });
  },
);
