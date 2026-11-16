import { serverEnv } from "@/lib/env";
import {
  apiError,
  apiSuccess,
  readJsonBody,
  withErrorHandling,
} from "@/lib/http/responses";
import {
  MAX_SPEECH_CHARACTERS,
  SPEECH_INSTRUCTIONS,
  prepareSpeechText,
} from "@/lib/ai/speech";
import {
  authorizePaymentToken,
  claimAiGeneration,
  releaseAiGeneration,
} from "@/lib/payments/authorize";
import {
  RATE_LIMITS,
  clientIdentifier,
  consume,
} from "@/lib/security/rate-limit";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { fieldErrors, ttsSchema } from "@/lib/validation/schemas";

/**
 * POST /api/tts
 *
 * Renders an alert message to speech for the overlay.
 *
 * This endpoint previously had no authentication, no payment check and no rate
 * limit, while spending money on the platform's OpenAI account for every call.
 * Anyone with the URL could run it in a loop. It now requires a verified
 * payment token, and each payment buys exactly one rendering — enforced by a
 * unique ledger row rather than by a timing window, because an in-process rate
 * limiter does not bound a determined caller across instances.
 */
export const POST = withErrorHandling("tts", async (request: Request) => {
  const body = await readJsonBody(request, 8 * 1024);
  if (!body.ok) return body.response;

  const parsed = ttsSchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError("validation_failed", "Check the text and try again.", {
      fields: fieldErrors(parsed.error),
    });
  }

  const authorization = authorizePaymentToken(parsed.data.payment_token);
  if (!authorization.ok) {
    return apiError(authorization.status, authorization.reason);
  }

  const { paymentId, creatorId } = authorization.claims;

  const limit = consume(
    `tts:${clientIdentifier(request)}`,
    RATE_LIMITS.aiGeneration,
  );
  if (!limit.allowed) {
    return apiError("rate_limited", "Too many requests. Please wait a moment.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const text = prepareSpeechText(parsed.data.text);
  if (!text) {
    return apiError("validation_failed", "There is nothing to read out.");
  }

  const supabase = getSupabaseServiceClient();

  // Claimed before the billable call, so a replay collides with the primary key.
  const claimed = await claimAiGeneration(supabase, paymentId, "tts", creatorId);
  if (!claimed) {
    return apiError(
      "conflict",
      "This payment has already been used for a voice rendering.",
    );
  }

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serverEnv.openaiApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: text.slice(0, MAX_SPEECH_CHARACTERS),
        instructions: SPEECH_INSTRUCTIONS,
        response_format: "mp3",
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    await releaseAiGeneration(supabase, paymentId, "tts");
    return apiError("upstream_unavailable", "The speech service is unreachable.", {
      retryable: true,
    });
  }

  if (!response.ok) {
    // Logged in full for the operator; not forwarded, because the upstream body
    // can carry account and quota detail.
    console.error(
      `[tts] OpenAI responded ${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
    await releaseAiGeneration(supabase, paymentId, "tts");
    return apiError("upstream_unavailable", "Could not generate speech right now.", {
      retryable: response.status >= 500,
    });
  }

  const audio = Buffer.from(await response.arrayBuffer());

  return apiSuccess({
    audio_data: `data:audio/mpeg;base64,${audio.toString("base64")}`,
  });
});
