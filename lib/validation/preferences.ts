import { z } from "zod";

import { WIDGETS } from "../dashboard/layout.ts";

/** Mirrors the CHECK in migration 0013. */
export const EXTERNAL_RAZORPAY_URL = /^https:\/\/(rzp\.io|razorpay\.me|pages\.razorpay\.com)\/[A-Za-z0-9._~/@-]+$/;

const DASHBOARD_WIDGETS = WIDGETS;

export const dashboardLayoutSchema = z
  .object({
    order: z.array(z.enum(DASHBOARD_WIDGETS)).max(DASHBOARD_WIDGETS.length),
    hidden: z.array(z.enum(DASHBOARD_WIDGETS)).max(DASHBOARD_WIDGETS.length),
  })
  .strict()
  .refine((v) => new Set(v.order).size === v.order.length, "Duplicate widget in layout.");

export const PAGE_ACCENTS = ["champagne", "silver", "sage", "clay", "ink"] as const;
export const pageStyleSchema = z
  .object({
    accent: z.enum(PAGE_ACCENTS),
    theme: z.enum(["dark", "light"]),
    layout: z.enum(["editorial", "centered", "compact"]),
    button: z.enum(["solid", "outline"]),
    font: z.enum(["sans", "mono"]),
    amounts: z.array(z.number().int().min(1).max(500000)).max(6),
    show_qr: z.boolean(),
  })
  .partial()
  .strict();
export type PageStyle = z.infer<typeof pageStyleSchema>;

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
    // zod 4: partialRecord, because record() with enum keys requires every key.
    overlay_overrides: z
      .partialRecord(
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
    // The creator's own Razorpay payment link (0% StreamLounge commission).
    external_payment_url: z
      .string()
      .trim()
      .max(200)
      .regex(EXTERNAL_RAZORPAY_URL, "Use a Razorpay payment link (rzp.io, razorpay.me or pages.razorpay.com).")
      .nullable(),
    dashboard_layout: dashboardLayoutSchema,
    ui_theme: z.enum(["dark", "light", "system"]),
    page_style: pageStyleSchema,
  })
  .partial()
  .strict();

export type PreferencesUpdate = z.infer<typeof updatePreferencesSchema>;

export { effectiveMessageLimit, truncateCodePoints } from "./limits.ts";
