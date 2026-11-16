import { serverEnv } from "@/lib/env";
import {
  apiError,
  apiSuccess,
  readJsonBody,
  withErrorHandling,
} from "@/lib/http/responses";
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
import {
  STICKER_IMAGE_BUCKET,
  stickerPathFor,
} from "@/lib/storage/soundboard";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { fieldErrors, stickerSchema } from "@/lib/validation/schemas";

/**
 * POST /api/stickers/generate
 *
 * Generates one AI sticker for one paid sticker interaction.
 *
 * What changed
 * ------------
 * The route already required a payment, but it recorded nothing about having
 * spent it. A payment token is valid for fifteen minutes, so one ₹30 payment
 * could be replayed for as many images as fit in that window, each billed to
 * the platform's OpenAI account. It also accepted the "signature optional, then
 * just fetch the payment from Razorpay" fallback that let a known payment id
 * stand in for proof of purchase.
 *
 * Now: a signed token is the only accepted proof, it must have been issued for
 * a `stickers` interaction specifically, and a ledger row makes the payment
 * redeemable exactly once.
 */
export const POST = withErrorHandling("stickers/generate", async (request: Request) => {
  const body = await readJsonBody(request, 8 * 1024);
  if (!body.ok) return body.response;

  const parsed = stickerSchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError("validation_failed", "Check the prompt and try again.", {
      fields: fieldErrors(parsed.error),
    });
  }

  // Bound to the sticker interaction type: a cheaper text payment cannot be
  // redeemed for an image generation.
  const authorization = authorizePaymentToken(parsed.data.payment_token, {
    interactionType: "stickers",
  });
  if (!authorization.ok) {
    return apiError(authorization.status, authorization.reason);
  }

  const { paymentId, creatorId } = authorization.claims;

  const limit = consume(
    `sticker:${clientIdentifier(request)}`,
    RATE_LIMITS.aiGeneration,
  );
  if (!limit.allowed) {
    return apiError("rate_limited", "Too many requests. Please wait a moment.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const supabase = getSupabaseServiceClient();

  const claimed = await claimAiGeneration(
    supabase,
    paymentId,
    "stickers",
    creatorId,
  );
  if (!claimed) {
    return apiError(
      "conflict",
      "This payment has already been used to generate a sticker.",
    );
  }

  const prompt = parsed.data.prompt;

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serverEnv.openaiApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-2",
        prompt:
          `Create a fun gaming livestream sticker based on this idea: ${prompt}. ` +
          "Make it a clean expressive sticker, centered subject, bold readable " +
          "visual, transparent background, no watermark, no extra text unless " +
          "specifically requested.",
        size: "1024x1024",
        quality: "medium",
        background: "transparent",
        output_format: "png",
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    await releaseAiGeneration(supabase, paymentId, "stickers");
    return apiError("upstream_unavailable", "The image service is unreachable.", {
      retryable: true,
    });
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    console.error(`[stickers] OpenAI responded ${response.status}: ${detail}`);
    await releaseAiGeneration(supabase, paymentId, "stickers");

    // A content-policy rejection is the viewer's prompt, so it is worth saying
    // so — without echoing the upstream body.
    if (response.status === 400) {
      return apiError(
        "validation_failed",
        "That prompt was rejected. Try describing something different.",
      );
    }
    return apiError("upstream_unavailable", "Could not generate a sticker right now.", {
      retryable: response.status >= 500,
    });
  }

  const payload = (await response.json()) as {
    data?: Array<{ b64_json?: string }>;
  };
  const imageBase64 = payload.data?.[0]?.b64_json;

  if (!imageBase64) {
    console.error("[stickers] OpenAI returned no image payload");
    await releaseAiGeneration(supabase, paymentId, "stickers");
    return apiError("upstream_unavailable", "No sticker was produced. Please retry.", {
      retryable: true,
    });
  }

  // Stored server-side so the overlay can show it. The path comes from the
  // verified token, and /api/interactions looks it up the same way.
  const stickerPath = stickerPathFor(creatorId, paymentId);
  if (!stickerPath) {
    await releaseAiGeneration(supabase, paymentId, "stickers");
    return apiError("bad_request", "That payment cannot be used for a sticker.");
  }

  const { error: uploadError } = await supabase.storage
    .from(STICKER_IMAGE_BUCKET)
    .upload(stickerPath, Buffer.from(imageBase64, "base64"), {
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    console.error("[stickers] could not store sticker:", uploadError.message);
    await releaseAiGeneration(supabase, paymentId, "stickers");
    return apiError("upstream_unavailable", "Could not save the sticker. Please retry.", {
      retryable: true,
    });
  }

  return apiSuccess({
    image_data: `data:image/png;base64,${imageBase64}`,
  });
});
