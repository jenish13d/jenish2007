import { NextResponse } from "next/server";

import { prepareSpeechText } from "@/lib/ai/speech";
import { integrationStatus, serverEnv } from "@/lib/env";
import { apiError, withErrorHandling } from "@/lib/http/responses";
import { announcementFor, loadOverlayPreferences } from "@/lib/overlay/preferences";
import { verifyOverlayToken } from "@/lib/overlay/tokens";
import { RATE_LIMITS, clientIdentifier, consume } from "@/lib/security/rate-limit";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/overlay/announce?id=<submission>&token=<overlay token>
 *
 * Fallback voice for the automatic announcer when the streaming tool's
 * browser has no speech synthesis (common in OBS/Streamlabs browser sources).
 * Authorised by the short-lived per-alert overlay token, so it can only speak
 * an alert that this creator's overlay has just claimed. The sentence is
 * rebuilt server-side from the stored submission; nothing in the request is
 * spoken.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

export const GET = withErrorHandling("overlay/announce", async (request: Request) => {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const token = url.searchParams.get("token") ?? "";
  if (!UUID.test(id)) return apiError("bad_request", "Missing alert.");

  const limit = consume(`announce:${clientIdentifier(request)}`, RATE_LIMITS.aiGeneration);
  if (!limit.allowed) return apiError("rate_limited", "Too many announcements.", { retryAfterSeconds: limit.retryAfterSeconds });

  if (!integrationStatus().openai) {
    return apiError("upstream_unavailable", "No fallback voice is configured.", { retryable: false });
  }

  const supabase = getSupabaseServiceClient();
  const { data: submission } = await supabase
    .from("creator_submissions")
    .select("id, creator_id, sender_name, message, amount, interaction_type")
    .eq("id", id)
    .maybeSingle();
  if (!submission) return apiError("not_found", "Alert not found.");

  const verification = verifyOverlayToken(token, submission.id, submission.creator_id);
  if (!verification.valid) return apiError("forbidden", "This announcement link has expired.");

  const prefs = await loadOverlayPreferences(supabase, submission.creator_id);
  const { announce, text } = announcementFor(prefs, {
    senderName: submission.sender_name || "Anonymous",
    amountPaise: Math.round(Number(submission.amount) * 100),
    message: submission.message,
    interactionType: submission.interaction_type,
  });
  if (!announce) return new NextResponse(null, { status: 204 });

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serverEnv.openaiApiKey()}` },
    body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "alloy", input: prepareSpeechText(text), response_format: "mp3" }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!response || !response.ok) return apiError("upstream_unavailable", "The fallback voice is unavailable.", { retryable: true });

  return new NextResponse(await response.arrayBuffer(), {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=300" },
  });
});
