/**
 * Single source of truth for the interaction catalogue.
 *
 * The original implementation repeated the list of valid interaction types in
 * the payment verifier, the public RPC, several route handlers and the viewer
 * UI, and the copies had already drifted. Everything now derives from here.
 */

export const INTERACTION_TYPES = [
  "text",
  "audio",
  "soundboard",
  "stickers",
  "spin_wheel",
  "tasks",
] as const;

export type InteractionType = (typeof INTERACTION_TYPES)[number];

export function isInteractionType(value: unknown): value is InteractionType {
  return (
    typeof value === "string" &&
    (INTERACTION_TYPES as readonly string[]).includes(value)
  );
}

export interface InteractionDefinition {
  type: InteractionType;
  label: string;
  /** Shown to viewers on the public creator page. */
  description: string;
  /** Fallback minimum in rupees, used only when `interaction_pricing` has no row. */
  fallbackMinimumPrice: number;
  /** Whether the interaction needs a text message from the viewer. */
  requiresMessage: boolean;
  /** Maximum message length in characters, where a message applies. */
  maxMessageLength: number;
  /** Whether fulfilling this interaction calls a metered third-party API. */
  billableExternalCall: boolean;
}

export const INTERACTION_DEFINITIONS: Record<
  InteractionType,
  InteractionDefinition
> = {
  text: {
    type: "text",
    label: "Text message",
    description: "Send a message that is read aloud on stream.",
    fallbackMinimumPrice: 10,
    requiresMessage: true,
    maxMessageLength: 500,
    billableExternalCall: true,
  },
  audio: {
    type: "audio",
    label: "Voice note",
    description: "Record a short voice note that plays on stream.",
    fallbackMinimumPrice: 20,
    requiresMessage: false,
    maxMessageLength: 200,
    billableExternalCall: false,
  },
  soundboard: {
    type: "soundboard",
    label: "Soundboard",
    description: "Trigger one of the creator's sound clips.",
    fallbackMinimumPrice: 15,
    requiresMessage: false,
    maxMessageLength: 120,
    billableExternalCall: false,
  },
  stickers: {
    type: "stickers",
    label: "AI sticker",
    description: "Generate a sticker from a prompt and show it on stream.",
    fallbackMinimumPrice: 30,
    requiresMessage: true,
    maxMessageLength: 300,
    billableExternalCall: true,
  },
  spin_wheel: {
    type: "spin_wheel",
    label: "Spin the wheel",
    description: "Spin for a random outcome the creator has to honour.",
    fallbackMinimumPrice: 25,
    requiresMessage: false,
    maxMessageLength: 200,
    billableExternalCall: false,
  },
  tasks: {
    type: "tasks",
    label: "Task",
    description: "Pick a challenge for the creator to complete.",
    fallbackMinimumPrice: 25,
    requiresMessage: false,
    maxMessageLength: 200,
    billableExternalCall: false,
  },
};

export function interactionDefinition(
  type: InteractionType,
): InteractionDefinition {
  return INTERACTION_DEFINITIONS[type];
}

/** Hard ceiling on a single payment, in rupees. Mirrors the Razorpay account cap. */
export const MAX_AMOUNT_RUPEES = 500_000;
