import {
  apiError,
  apiSuccess,
  readJsonBody,
  withErrorHandling,
} from "@/lib/http/responses";
import { confirmPaymentWithGateway } from "@/lib/payments/authorize";
import { verifyCheckoutSignature } from "@/lib/payments/signatures";
import { generatePaymentToken } from "@/lib/payments/tokens";
import { isInteractionType } from "@/lib/interactions/registry";
import {
  RATE_LIMITS,
  clientIdentifier,
  consume,
} from "@/lib/security/rate-limit";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { paymentAlreadyRedeemed } from "@/lib/submissions/repository";
import { fieldErrors, verifyPaymentSchema } from "@/lib/validation/schemas";

/**
 * POST /api/payments/verify
 *
 * Public, but authorised by the Razorpay checkout signature, which only
 * Razorpay can produce for the paying browser.
 *
 * Three gates, in order:
 *   1. HMAC over `order_id|payment_id` with the Razorpay key secret.
 *   2. An independent query to Razorpay confirming the payment is captured, is
 *      in INR, belongs to that order, and that the order carries the notes this
 *      platform bound to it.
 *   3. The order's notes — not the request body — decide which creator and
 *      interaction the payment is for.
 *
 * On success it issues a short-lived signed token. The token is the only thing
 * downstream endpoints accept as proof of payment.
 */
export const POST = withErrorHandling("payments/verify", async (request: Request) => {
  const limit = consume(
    `verify:${clientIdentifier(request)}`,
    RATE_LIMITS.verifyPayment,
  );
  if (!limit.allowed) {
    return apiError("rate_limited", "Too many attempts. Please wait a moment.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = verifyPaymentSchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError("validation_failed", "Those payment details are not valid.", {
      fields: fieldErrors(parsed.error),
    });
  }

  const {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
  } = parsed.data;

  if (!verifyCheckoutSignature(orderId, paymentId, signature)) {
    // No detail about which part failed: that is an oracle for forging.
    return apiError("forbidden", "That payment could not be verified.");
  }

  const confirmation = await confirmPaymentWithGateway(paymentId, orderId);
  if (!confirmation.ok) {
    return apiError(
      confirmation.retryable ? "upstream_unavailable" : "forbidden",
      confirmation.error,
      { retryable: confirmation.retryable },
    );
  }

  if (!isInteractionType(confirmation.interactionType)) {
    console.error(
      `[verify] order ${orderId} carries unknown interaction_type '${confirmation.interactionType}'`,
    );
    return apiError("forbidden", "That order is bound to an unsupported interaction.");
  }

  // Reported so the client can show "already submitted" rather than driving the
  // viewer into a duplicate attempt. It is advisory only — the authoritative
  // check is the unique index at insert time.
  const alreadyRedeemed = await paymentAlreadyRedeemed(
    getSupabaseServiceClient(),
    paymentId,
  );

  const token = generatePaymentToken({
    paymentId,
    orderId,
    creatorId: confirmation.creatorId,
    interactionType: confirmation.interactionType,
    amountInPaise: confirmation.amountInPaise,
  });

  return apiSuccess({
    verified: true,
    payment_token: token,
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    interaction_type: confirmation.interactionType,
    amount: confirmation.amountInPaise / 100,
    already_submitted: alreadyRedeemed,
  });
});
