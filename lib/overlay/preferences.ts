import type { SupabaseClient } from "@supabase/supabase-js";

import { buildAnnouncement } from "../announcer/announce.ts";

/** What a browser source needs to render and announce alerts. */
export type OverlayPreferences = {
  alert_duration_ms: number;
  alert_position: string;
  show_amount: boolean;
  show_sender: boolean;
  animated_alerts_enabled: boolean;
  sound_alerts_enabled: boolean;
  announcer_enabled: boolean;
  announcer_muted: boolean;
  announcer_voice: string;
  announcer_rate: number;
  announcer_volume: number;
  announcer_read_emojis: boolean;
  announcer_read_message: boolean;
  announcer_min_paise: number;
};

export const DEFAULT_OVERLAY_PREFERENCES: OverlayPreferences = {
  alert_duration_ms: 8000,
  alert_position: "center",
  show_amount: true,
  show_sender: true,
  animated_alerts_enabled: true,
  sound_alerts_enabled: true,
  announcer_enabled: true,
  announcer_muted: false,
  announcer_voice: "default",
  announcer_rate: 1,
  announcer_volume: 1,
  announcer_read_emojis: true,
  announcer_read_message: true,
  announcer_min_paise: 0,
};

const COLUMNS = Object.keys(DEFAULT_OVERLAY_PREFERENCES).join(", ");

export async function loadOverlayPreferences(
  supabase: SupabaseClient,
  creatorId: string,
): Promise<OverlayPreferences> {
  const { data } = await supabase.from("creator_preferences").select(COLUMNS).eq("creator_id", creatorId).maybeSingle();
  const row = (data ?? {}) as Partial<OverlayPreferences>;
  return {
    ...DEFAULT_OVERLAY_PREFERENCES,
    ...row,
    announcer_rate: Number(row.announcer_rate ?? 1),
    announcer_volume: Number(row.announcer_volume ?? 1),
    announcer_min_paise: Number(row.announcer_min_paise ?? 0),
  };
}

/** Decides whether to announce an alert and builds the sentence, server-side. */
export function announcementFor(
  prefs: OverlayPreferences,
  event: { senderName: string; amountPaise: number; message: string | null; interactionType: string },
): { announce: boolean; text: string } {
  const announce =
    prefs.announcer_enabled &&
    !prefs.announcer_muted &&
    event.amountPaise >= prefs.announcer_min_paise &&
    // Voice notes and soundboard clips already make sound; announce the name only.
    true;
  const readMessage =
    prefs.announcer_read_message && (event.interactionType === "text" || event.interactionType === "tasks");
  const text = buildAnnouncement(
    { senderName: event.senderName, amountPaise: event.amountPaise, currency: "INR", message: event.message },
    {
      readEmojis: prefs.announcer_read_emojis,
      readMessage,
      showSender: prefs.show_sender,
      showAmount: prefs.show_amount,
    },
  );
  return { announce, text };
}

// One heartbeat per creator per 30 seconds per server instance is plenty to
// measure overlay online time without writing on every 1-second poll.
const lastBeat = new Map<string, number>();
export async function overlayHeartbeat(supabase: SupabaseClient, creatorId: string): Promise<void> {
  const now = Date.now();
  if ((lastBeat.get(creatorId) ?? 0) > now - 30_000) return;
  lastBeat.set(creatorId, now);
  if (lastBeat.size > 5000) lastBeat.clear();
  const { error } = await supabase.rpc("sl_overlay_heartbeat", { p_creator_id: creatorId });
  if (error) console.error("[overlay] heartbeat failed:", error.message);
}
