import {
  apiError,
  apiSuccess,
  readJsonBody,
  withErrorHandling,
} from "@/lib/http/responses";
import type { SubmissionMetadata } from "@/lib/db/types";
import { interactionDefinition } from "@/lib/interactions/registry";
import { authorizePaymentToken } from "@/lib/payments/authorize";
import {
  effectiveMinimum,
  globalMinimumRupees,
  resolvePublicPricing,
} from "@/lib/payments/pricing";
import {
  RATE_LIMITS,
  clientIdentifier,
  consume,
} from "@/lib/security/rate-limit";
import {
  isInteractionAudioPathFor,
  resolveSoundForCreator,
} from "@/lib/storage/soundboard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { insertPaidSubmission } from "@/lib/submissions/repository";
import { fieldErrors, submitInteractionSchema } from "@/lib/validation/schemas";

/**
 * GET  /api/interactions   — the signed-in creator's own interaction config.
 * POST /api/interactions   — a viewer submits a paid interaction.
 */

/** Creator-scoped read. RLS confines the result to the caller's own rows. */
export const GET = withErrorHandling("interactions#GET", async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return apiError("unauthorized", "Sign in to manage your interactions.");
  }

  const { data, error } = await supabase
    .from("creator_interactions")
    .select("id, creator_id, interaction_type, enabled, price, settings")
    .eq("creator_id", user.id)
    .order("interaction_type");

  if (error) {
    console.error("[interactions#GET] query failed:", error.message);
    return apiError("internal_error", "Could not load your interactions.");
  }

  return apiSuccess({ interactions: data ?? [] });
});

/**
 * Viewer submission.
 *
 * Everything that decides what was bought — creator, interaction type, amount —
 * comes from the signed payment token, never from the request body. The body
 * supplies only the content: the message, the chosen sound, the wheel result.
 *
 * Insertion is a single statement guarded by a unique index on the payment id,
 * so two requests racing with the same payment produce one submission and one
 * 409. The previous select-then-insert could produce two paid alerts for one
 * payment.
 */
export const POST = withErrorHandling("interactions#POST", async (request: Request) => {
  const limit = consume(
    `submit:${clientIdentifier(request)}`,
    RATE_LIMITS.submitInteraction,
  );
  if (!limit.allowed) {
    return apiError("rate_limited", "Too many attempts. Please wait a moment.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = submitInteractionSchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError("validation_failed", "Check the details and try again.", {
      fields: fieldErrors(parsed.error),
    });
  }

  const input = parsed.data;

  const authorization = authorizePaymentToken(input.payment_token);
  if (!authorization.ok) {
    return apiError(authorization.status, authorization.reason);
  }

  const { creatorId, interactionType, amountInPaise, paymentId, orderId } =
    authorization.claims;
  const definition = interactionDefinition(interactionType);
  const amountRupees = amountInPaise / 100;

  // Privileged client: this insert runs for an anonymous viewer, so there is no
  // session for RLS to authorise. Authorisation is the verified payment token
  // checked above.
  const service = getSupabaseServiceClient();

  const { data: profile, error: profileError } = await service
    .from("creator_profiles")
    .select("id, username, public_page_enabled, audio_upload_enabled")
    .eq("id", creatorId)
    .maybeSingle();

  if (profileError) {
    console.error("[interactions#POST] profile lookup failed:", profileError.message);
    return apiError("internal_error", "Could not load that creator right now.");
  }
  if (!profile?.username) {
    return apiError("not_found", "That creator page is not available.");
  }
  if (!profile.public_page_enabled) {
    return apiError("forbidden", "This creator has turned their page off.");
  }

  // Re-check availability and price at submission time. A creator may have
  // disabled the interaction or raised the price between order and submission;
  // the payment stands, but it must still buy something currently on sale.
  const anonClient = await createSupabaseServerClient();
  const pricing = await resolvePublicPricing(
    anonClient,
    profile.username,
    interactionType,
  );
  if (!pricing.enabled) {
    return apiError("conflict", "This creator has turned that interaction off.");
  }

  const minimum = effectiveMinimum(
    pricing.minimumRupees,
    await globalMinimumRupees(anonClient, interactionType),
  );
  if (amountRupees < minimum) {
    return apiError(
      "conflict",
      `The price for this changed to ₹${minimum}. Your payment has not been used — please contact the creator for a refund.`,
      { meta: { minimum_price: minimum } },
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Interaction-specific content validation                                */
  /* ---------------------------------------------------------------------- */

  const metadata: SubmissionMetadata = {};
  let message: string | null = input.message?.trim() || null;

  switch (interactionType) {
    case "text": {
      if (!message) {
        return apiError("validation_failed", "Write a message to send.", {
          fields: { message: "A message is required." },
        });
      }
      message = message.slice(0, definition.maxMessageLength);
      break;
    }

    case "soundboard": {
      if (!input.sound_id) {
        return apiError("validation_failed", "Choose a sound.", {
          fields: { sound_id: "Select a sound." },
        });
      }
      // Scoped to this creator's sounds and the global presets. The sound's
      // stored path is taken from the row, never from the request, so a viewer
      // cannot nominate an arbitrary object in the bucket.
      const resolution = await resolveSoundForCreator(
        service,
        input.sound_id,
        creatorId,
      );
      if (!resolution.ok) {
        return apiError(
          "validation_failed",
          "That sound is not available on this creator's soundboard.",
        );
      }
      metadata.sound_id = resolution.sound.id;
      metadata.sound_name = resolution.sound.name;
      metadata.storage_path = resolution.sound.storage_path;
      message = resolution.sound.name;
      break;
    }

    case "audio": {
      if (profile.audio_upload_enabled === false) {
        return apiError("forbidden", "This creator has turned voice notes off.");
      }
      if (!input.storage_path) {
        return apiError("validation_failed", "Record a voice note first.", {
          fields: { storage_path: "A recording is required." },
        });
      }
      // The path must sit inside this creator's prefix. Without this check a
      // viewer could point the submission at any object in the bucket and have
      // the overlay sign and play it.
      if (!isInteractionAudioPathFor(input.storage_path, creatorId)) {
        return apiError("forbidden", "That recording could not be used.");
      }
      // Confirm the object actually exists, so a submission never queues an
      // alert that will fail to play on stream.
      const prefix = `${creatorId}/`;
      const { data: listed, error: listError } = await service.storage
        .from("interaction-audio")
        .list(creatorId, {
          search: input.storage_path.slice(prefix.length),
          limit: 1,
        });
      if (listError) {
        console.error("[interactions#POST] storage list failed:", listError.message);
        return apiError("internal_error", "Could not verify that recording.");
      }
      if (!listed?.length) {
        return apiError(
          "validation_failed",
          "That recording was not found. Please record again.",
        );
      }
      metadata.storage_path = input.storage_path;
      message = message?.slice(0, definition.maxMessageLength) ?? null;
      break;
    }

    case "spin_wheel": {
      const result = input.result?.trim();
      if (!result) {
        return apiError("validation_failed", "Spin the wheel first.", {
          fields: { result: "A spin result is required." },
        });
      }
      // The result must be one of the creator's configured segments. Otherwise
      // a viewer can submit any text they like as the outcome the creator now
      // has to honour on stream.
      if (pricing.options.length > 0 && !pricing.options.includes(result)) {
        return apiError("validation_failed", "That is not one of the wheel's options.");
      }
      metadata.result = result;
      message = result;
      break;
    }

    case "tasks": {
      const task = input.task?.trim();
      if (!task) {
        return apiError("validation_failed", "Choose a task.", {
          fields: { task: "A task is required." },
        });
      }
      if (pricing.tasks.length > 0 && !pricing.tasks.includes(task)) {
        return apiError("validation_failed", "That is not one of the creator's tasks.");
      }
      metadata.task = task;
      message = task;
      break;
    }

    case "stickers": {
      const prompt = input.prompt?.trim() || message;
      if (!prompt) {
        return apiError("validation_failed", "Describe the sticker you want.", {
          fields: { prompt: "A prompt is required." },
        });
      }
      metadata.prompt = prompt.slice(0, definition.maxMessageLength);
      if (input.sticker_url) {
        metadata.sticker_url = input.sticker_url;
      }
      message = metadata.prompt;
      break;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Insert                                                                 */
  /* ---------------------------------------------------------------------- */

  const result = await insertPaidSubmission(service, {
    creatorId,
    interactionType,
    senderName: input.sender_name?.trim().slice(0, 50) || "Anonymous",
    message,
    amountRupees,
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    metadata,
  });

  if (result.status === "duplicate") {
    return apiError("conflict", "This payment has already been submitted.", {
      meta: {
        already_submitted: true,
        ...(result.submissionId ? { submission_id: result.submissionId } : {}),
      },
    });
  }

  if (result.status === "error") {
    return apiError("internal_error", "Could not record your interaction.");
  }

  return apiSuccess(
    {
      submission: {
        id: result.submission.id,
        interaction_type: result.submission.interaction_type,
        status: result.submission.status,
        amount: result.submission.amount,
        created_at: result.submission.created_at,
      },
      message: "Sent. Watch the stream.",
    },
    { status: 201 },
  );
});
