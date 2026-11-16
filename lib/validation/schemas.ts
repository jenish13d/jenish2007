import { z } from "zod";

import { INTERACTION_TYPES, MAX_AMOUNT_RUPEES } from "../interactions/registry.ts";
import { OVERLAY_THEMES } from "../overlay/themes.ts";
import {
  ALLOWED_AUDIO_MIME_TYPES,
  MAX_AUDIO_UPLOAD_BYTES,
} from "../storage/soundboard.ts";

/**
 * Shared request schemas.
 *
 * One schema per API contract, used by the route handler to parse and by the
 * tests to build valid fixtures, so a contract cannot drift between the two.
 */

export const interactionTypeSchema = z.enum(INTERACTION_TYPES);

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Usernames are at least 3 characters.")
  .max(30, "Usernames are at most 30 characters.")
  // Letters, digits, underscore. No '%' or '_' reaching a LIKE pattern, and
  // nothing that needs escaping in a URL path.
  .regex(
    /^[A-Za-z0-9_]+$/,
    "Usernames can contain letters, numbers and underscores only.",
  );

export const uuidSchema = z.string().uuid("Expected a valid identifier.");

export const amountRupeesSchema = z
  .number()
  .int("Enter a whole rupee amount.")
  .positive("Amount must be more than zero.")
  .max(MAX_AMOUNT_RUPEES);

/** Razorpay ids are `order_…` / `pay_…` followed by an alphanumeric suffix. */
export const razorpayOrderIdSchema = z
  .string()
  .trim()
  .regex(/^order_[A-Za-z0-9]{8,}$/, "That order reference is not valid.");

export const razorpayPaymentIdSchema = z
  .string()
  .trim()
  .regex(/^pay_[A-Za-z0-9]{8,}$/, "That payment reference is not valid.");

export const razorpaySignatureSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{64}$/i, "That payment signature is not valid.");

/* -------------------------------------------------------------------------- */
/* Payments                                                                   */
/* -------------------------------------------------------------------------- */

export const createOrderSchema = z.object({
  username: usernameSchema,
  interaction_type: interactionTypeSchema,
  amount: amountRupeesSchema,
});

export const verifyPaymentSchema = z.object({
  razorpay_order_id: razorpayOrderIdSchema,
  razorpay_payment_id: razorpayPaymentIdSchema,
  razorpay_signature: razorpaySignatureSchema,
});

/* -------------------------------------------------------------------------- */
/* Submissions                                                                */
/* -------------------------------------------------------------------------- */

export const senderNameSchema = z
  .string()
  .trim()
  .max(50, "Name is at most 50 characters.")
  .optional();

/**
 * A viewer submission.
 *
 * Note what is absent: `creator_id` and `amount`. Both are read from the
 * verified payment token instead, because both were previously taken from the
 * request body and used to decide what the viewer had paid for.
 */
export const submitInteractionSchema = z.object({
  payment_token: z.string().trim().min(1, "A verified payment is required."),
  sender_name: senderNameSchema,
  message: z.string().trim().max(500).optional(),
  /** Soundboard: which sound to trigger. */
  sound_id: uuidSchema.optional(),
  /** Audio: object path returned by the upload-ticket endpoint. */
  storage_path: z.string().trim().max(400).optional(),
  /** Spin wheel: the segment the wheel landed on. */
  result: z.string().trim().max(200).optional(),
  /** Tasks: the chosen task. */
  task: z.string().trim().max(200).optional(),
  /** Stickers: the prompt, and the generated image's stored path. */
  prompt: z.string().trim().max(300).optional(),
  sticker_url: z.string().trim().max(600).optional(),
});

/* -------------------------------------------------------------------------- */
/* Uploads                                                                    */
/* -------------------------------------------------------------------------- */

export const audioUploadTicketSchema = z.object({
  payment_token: z.string().trim().min(1, "A verified payment is required."),
  content_type: z.enum(ALLOWED_AUDIO_MIME_TYPES),
  size_bytes: z
    .number()
    .int()
    .positive()
    .max(
      MAX_AUDIO_UPLOAD_BYTES,
      `Voice notes must be under ${Math.round(MAX_AUDIO_UPLOAD_BYTES / 1024 / 1024)} MB.`,
    ),
});

/* -------------------------------------------------------------------------- */
/* AI endpoints                                                               */
/* -------------------------------------------------------------------------- */

export const ttsSchema = z.object({
  payment_token: z.string().trim().min(1, "A verified payment is required."),
  text: z.string().trim().min(1, "Text is required.").max(500),
});

export const stickerSchema = z.object({
  payment_token: z.string().trim().min(1, "A verified payment is required."),
  prompt: z.string().trim().min(1, "A prompt is required.").max(300),
});

/* -------------------------------------------------------------------------- */
/* Creator dashboard                                                          */
/* -------------------------------------------------------------------------- */

export const overlayThemeSchema = z.enum(OVERLAY_THEMES);

export const updateThemeSchema = z.object({
  theme: overlayThemeSchema,
});

const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .refine(
    (value) =>
      value === "" || /^https:\/\/[^\s]+$/.test(value),
    "Links must start with https://",
  )
  .optional();

export const updateProfileSchema = z.object({
  creator_name: z.string().trim().min(1).max(60).optional(),
  username: usernameSchema.optional(),
  bio: z.string().trim().max(500).optional(),
  profile_image_url: optionalUrl,
  banner_image_url: optionalUrl,
  public_page_enabled: z.boolean().optional(),
  audio_upload_enabled: z.boolean().optional(),
  instagram_url: optionalUrl,
  twitter_url: optionalUrl,
  youtube_url: optionalUrl,
  discord_url: optionalUrl,
});

export const updateInteractionSchema = z.object({
  interaction_type: interactionTypeSchema,
  enabled: z.boolean(),
  price: amountRupeesSchema,
  /** Wheel segments, for `spin_wheel`. */
  options: z.array(z.string().trim().min(1).max(60)).max(24).optional(),
  /** Task list, for `tasks`. */
  tasks: z.array(z.string().trim().min(1).max(120)).max(24).optional(),
});

export const updateInteractionsSchema = z.object({
  interactions: z.array(updateInteractionSchema).min(1).max(INTERACTION_TYPES.length),
});

export const createSoundSchema = z.object({
  name: z.string().trim().min(1).max(60),
  storage_path: z.string().trim().min(1).max(400),
  image_path: z.string().trim().max(400).optional(),
  enabled: z.boolean().default(true),
});

export const updateSoundSchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(1).max(60).optional(),
  enabled: z.boolean().optional(),
});

/* -------------------------------------------------------------------------- */
/* Overlay                                                                    */
/* -------------------------------------------------------------------------- */

export const overlayCompleteSchema = z.object({
  id: uuidSchema,
  token: z.string().trim().min(1),
  status: z.enum(["completed", "failed"]).default("completed"),
  error: z.string().trim().max(500).optional(),
});

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Flattens a Zod error into a field map suitable for an API response. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!fields[key]) {
      fields[key] = issue.message;
    }
  }
  return fields;
}
