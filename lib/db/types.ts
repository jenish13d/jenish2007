/**
 * Hand-maintained types for the existing StreamLounge Supabase schema.
 *
 * These mirror the tables that are already live in the configured Supabase
 * project. They are written by hand rather than generated so that the rebuild
 * does not require database credentials to typecheck or build; regenerate with
 * `supabase gen types typescript` once credentials are available and diff
 * against this file.
 */

import type { OverlayThemeId } from "../overlay/themes.ts";
import type { InteractionType } from "../interactions/registry.ts";

/** Lifecycle of a viewer submission as it moves through the OBS queue. */
export type SubmissionStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

/** Payment state of a submission. Only `paid` rows are ever played on stream. */
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

/** A JSON value as stored in a `jsonb` column. */
export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export interface CreatorProfile {
  id: string;
  email: string | null;
  creator_name: string | null;
  username: string | null;
  bio: string | null;
  profile_image_url: string | null;
  banner_image_url: string | null;
  public_page_enabled: boolean;
  overlay_theme: OverlayThemeId | null;
  /**
   * Secret, rotatable key that authorises an OBS browser source to poll and
   * claim this creator's events. Added by migration 0002; never exposed through
   * the public profile view.
   */
  overlay_key: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  youtube_url: string | null;
  discord_url: string | null;
  youtube_connected: boolean | null;
  youtube_channel_id: string | null;
  youtube_channel_name: string | null;
  youtube_handle: string | null;
  youtube_avatar_url: string | null;
  youtube_banner_url: string | null;
  youtube_subscribers: number | null;
  audio_upload_enabled: boolean | null;
  created_at: string;
  updated_at: string | null;
}

/**
 * Columns exposed by the `public_creator_profiles` view. Deliberately excludes
 * `email`, `overlay_key` and every YouTube OAuth field.
 */
export interface PublicCreatorProfile {
  id: string;
  creator_name: string | null;
  username: string | null;
  bio: string | null;
  profile_image_url: string | null;
  banner_image_url: string | null;
  public_page_enabled: boolean;
  overlay_theme: OverlayThemeId | null;
  instagram_url: string | null;
  twitter_url: string | null;
  youtube_url: string | null;
  discord_url: string | null;
  youtube_channel_name: string | null;
  youtube_handle: string | null;
  youtube_avatar_url: string | null;
  youtube_subscribers: number | null;
}

export interface CreatorInteraction {
  id: string;
  creator_id: string;
  interaction_type: InteractionType;
  enabled: boolean;
  price: number;
  settings: Json | null;
  created_at: string;
  updated_at: string | null;
}

export interface InteractionPricing {
  interaction_type: InteractionType;
  minimum_price: number;
}

/** Metadata stored alongside a submission. Keys are interaction-specific. */
export interface SubmissionMetadata {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  verified_at?: string;
  /** Soundboard */
  sound_id?: string;
  sound_name?: string;
  storage_path?: string;
  /** Resolved at delivery time, never persisted. */
  sound_url?: string;
  audio_url?: string;
  /** Spin wheel / tasks */
  result?: string;
  task?: string;
  /** Stickers */
  prompt?: string;
  /** Server-side path in the sticker-images bucket. */
  sticker_path?: string;
  /** Resolved at delivery time, never persisted. */
  sticker_url?: string;
  /** Overlay lifecycle bookkeeping */
  reclaimed_once?: boolean;
  stale_recovery_at?: string;
  playback_error?: string;
  recovered_by_webhook?: boolean;
  webhook_event?: string;
  [key: string]: Json | undefined;
}

export interface CreatorSubmission {
  id: string;
  creator_id: string;
  interaction_type: InteractionType;
  sender_name: string | null;
  message: string | null;
  amount: number;
  payment_status: PaymentStatus;
  status: SubmissionStatus;
  metadata: SubmissionMetadata | null;
  created_at: string;
  updated_at: string | null;
}

export interface SoundboardSound {
  id: string;
  /** `null` marks a global preset available to every creator. */
  creator_id: string | null;
  name: string;
  description: string | null;
  storage_path: string;
  image_path: string | null;
  category: string | null;
  sort_order: number | null;
  enabled: boolean;
  created_at: string;
}



/**
 * Single-use ledger for paid AI generations, added by migration 0003.
 *
 * Without this, a valid payment token could be replayed against the sticker
 * endpoint for the whole 15 minutes of its lifetime, producing unlimited
 * billable images from one payment.
 */
export interface AiGenerationClaim {
  razorpay_payment_id: string;
  creator_id: string;
  kind: "stickers" | "tts";
  created_at: string;
}

/** Row shape returned by the `get_public_interactions` RPC. */
export interface PublicInteractionRow {
  interaction_type: InteractionType;
  price: number;
  enabled: boolean;
  tasks: string[];
  options: string[];
}
