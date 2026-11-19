import { z } from "zod";

const plainText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !/[<>{}`\\]/.test(v), "Plain text only.")
    .transform((v) => (v === "" ? null : v.normalize("NFKC")));

/**
 * Fields a creator may change from Manage Interactions. Every key is optional
 * (PATCH semantics); unknown keys are rejected so a client cannot write a
 * column it was never meant to touch.
 */
export const updatePreferencesSchema = z
  .object({
    message_max_length: z.number().int().min(10).max(500),
    alert_duration_ms: z.number().int().min(3000).max(30000),
    alert_position: z.enum([
      "top-left", "top-center", "top-right", "center", "bottom-left", "bottom-center", "bottom-right",
    ]),
    show_amount: z.boolean(),
    show_sender: z.boolean(),
    animated_alerts_enabled: z.boolean(),
    sound_alerts_enabled: z.boolean(),
    emoji_reactions_enabled: z.boolean(),
    announcer_enabled: z.boolean(),
    announcer_muted: z.boolean(),
    announcer_voice: z.string().trim().min(1).max(40).regex(/^[\w .()'-]+$/u, "Pick a voice from the list."),
    announcer_rate: z.number().min(0.5).max(2),
    announcer_volume: z.number().min(0).max(1),
    announcer_read_emojis: z.boolean(),
    announcer_read_message: z.boolean(),
    announcer_min_paise: z.number().int().min(0).max(10_000_000),
    overlay_overrides: z
      .record(
        z.enum(["obs", "streamlabs", "streamyard"]),
        z.object({
          scale: z.number().min(0.5).max(2).optional(),
          offset_x: z.number().int().min(-2000).max(2000).optional(),
          offset_y: z.number().int().min(-2000).max(2000).optional(),
        }).strict(),
      ),
    leaderboard_opt_in: z.boolean(),
    location_city: plainText(60).nullable(),
    location_district: plainText(60).nullable(),
    location_state: plainText(60).nullable(),
    location_country: z.string().regex(/^[A-Z]{2}$/, "Use a 2-letter country code.").nullable(),
    location_continent: z.enum(["AF", "AN", "AS", "EU", "NA", "OC", "SA"]).nullable(),
  })
  .partial()
  .strict();

export type PreferencesUpdate = z.infer<typeof updatePreferencesSchema>;

export { effectiveMessageLimit, truncateCodePoints } from "./limits.ts";
