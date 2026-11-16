import { exactIlikePattern } from "@/lib/db/like";
import { serverEnv } from "@/lib/env";
import {
  apiError,
  apiSuccess,
  readJsonBody,
  withErrorHandling,
} from "@/lib/http/responses";
import { createOrder } from "@/lib/payments/razorpay";
import {
  effectiveMinimum,
  globalMinimumRupees,
  resolvePublicPricing,
  validateAmount,
} from "@/lib/payments/pricing";
import {
  RATE_LIMITS,
  clientIdentifier,
  consume,
} from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createOrderSchema, fieldErrors } from "@/lib/validation/schemas";

/**
 * POST /api/payments/create-order
 *
 * Public. Creates a Razorpay order for a viewer interaction.
 *
 * Price is resolved server-side on every call, and the order is created with
 * notes binding it to the creator and interaction type. Those notes are what
 * every later verification step checks against, so an order made outside this
 * route cannot be redeemed for a submission.
 *
 * The route takes a username rather than a creator id: a viewer only ever knows
 * the username, and accepting an id invited the client to nominate which
 * creator it was paying.
 */
export const POST = withErrorHandling(
  "payments/create-order",
  async (request: Request) => {
    const limit = consume(
      `create-order:${clientIdentifier(request)}`,
      RATE_LIMITS.createOrder,
    );
    if (!limit.allowed) {
      return apiError("rate_limited", "Too many attempts. Please wait a moment.", {
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }

    const body = await readJsonBody(request);
    if (!body.ok) return body.response;

    const parsed = createOrderSchema.safeParse(body.value);
    if (!parsed.success) {
      return apiError("validation_failed", "Check the details and try again.", {
        fields: fieldErrors(parsed.error),
      });
    }

    const { username, interaction_type: interactionType, amount } = parsed.data;
    const supabase = await createSupabaseServerClient();

    // The public view is the only anon-readable source of profile data, and it
    // already filters to enabled public pages.
    const { data: profile, error: profileError } = await supabase
      .from("public_creator_profiles")
      .select("id, username, public_page_enabled")
      .ilike("username", exactIlikePattern(username))
      .eq("public_page_enabled", true)
      .limit(1)
      .maybeSingle();

    if (profileError) {
      console.error("[create-order] profile lookup failed:", profileError.message);
      return apiError("internal_error", "Could not load that creator right now.");
    }
    if (!profile?.id || !profile.username) {
      // Deliberately indistinguishable from "public page disabled": whether a
      // given username exists but is private is not a viewer's business.
      return apiError("not_found", "That creator page is not available.");
    }

    const pricing = await resolvePublicPricing(
      supabase,
      profile.username,
      interactionType,
    );
    if (!pricing.enabled) {
      return apiError(
        "bad_request",
        "This creator has turned that interaction off.",
      );
    }

    const minimum = effectiveMinimum(
      pricing.minimumRupees,
      await globalMinimumRupees(supabase, interactionType),
    );

    const amountCheck = validateAmount(amount, minimum);
    if (!amountCheck.valid) {
      return apiError("validation_failed", amountCheck.error, {
        meta: { minimum_price: minimum },
      });
    }

    const order = await createOrder({
      amountInPaise: amountCheck.paise,
      creatorId: profile.id,
      creatorUsername: profile.username,
      interactionType,
      minimumPriceRupees: minimum,
    });

    if (!order.ok) {
      return apiError(
        order.retryable ? "upstream_unavailable" : "bad_request",
        order.error,
        { retryable: order.retryable },
      );
    }

    return apiSuccess({
      order_id: order.data.id,
      amount: order.data.amount,
      currency: order.data.currency,
      // The key *id* is public by design — Razorpay Checkout needs it in the
      // browser. The key secret never leaves the server.
      razorpay_key_id: serverEnv.razorpayKeyId(),
      creator_name: null,
    });
  },
);
