import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";
import { withErrorHandling } from "@/lib/http/responses";
import { EXTERNAL_WEBHOOK_AAD, isCreatorId, parseExternalCapture } from "@/lib/payments/external";
import { verifyWebhookSignature } from "@/lib/payments/signatures";
import { RATE_LIMITS, clientIdentifier, consume } from "@/lib/security/rate-limit";
import { openToken } from "@/lib/security/token-crypto";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/payments/external-webhook/<creatorId>
 *
 * Optional reporting integration for a creator's OWN Razorpay payment link.
 * The creator adds this URL as a webhook in their Razorpay dashboard and saves
 * the same webhook secret in StreamLounge. Each delivery is verified with that
 * creator's secret; a payment verified this way is recorded as
 * EXTERNAL_RAZORPAY_LINK with a 0% platform fee in `external_payments`.
 *
 * It is never written to `payments` or the ledger: StreamLounge does not hold
 * this money, so it must never become a withdrawable balance or platform revenue.
 */
export const dynamic = "force-dynamic";

export const POST = withErrorHandling(
  "payments/external-webhook",
  async (request: Request, context: { params: Promise<{ creatorId: string }> }) => {
    const { creatorId } = await context.params;
    if (!isCreatorId(creatorId)) return NextResponse.json({ status: "rejected" }, { status: 404 });

    const limit = consume(`extwh:${creatorId}:${clientIdentifier(request)}`, RATE_LIMITS.verifyPayment);
    if (!limit.allowed) return NextResponse.json({ status: "rate_limited" }, { status: 429 });

    const raw = await request.text();
    if (raw.length > 64 * 1024) return NextResponse.json({ status: "rejected" }, { status: 413 });
    const signature = request.headers.get("x-razorpay-signature") ?? "";

    const supabase = getSupabaseServiceClient();
    const { data: hook } = await supabase
      .from("creator_external_webhooks")
      .select("sealed_secret")
      .eq("creator_id", creatorId)
      .maybeSingle();
    // Same response for "no such creator" and "bad signature".
    if (!hook) return NextResponse.json({ status: "rejected" }, { status: 401 });

    let secret: string;
    try {
      secret = openToken(hook.sealed_secret, serverEnv.tokenEncryptionKey(), EXTERNAL_WEBHOOK_AAD(creatorId));
    } catch {
      console.error(`[external-webhook] could not open secret for ${creatorId}`);
      return NextResponse.json({ status: "deferred" }, { status: 503 });
    }
    if (!verifyWebhookSignature(raw, signature, secret)) {
      return NextResponse.json({ status: "rejected" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ status: "rejected" }, { status: 400 });
    }
    const capture = parseExternalCapture(body);
    if (!capture) return NextResponse.json({ status: "ignored" });

    const { error } = await supabase.from("external_payments").upsert(
      {
        id: capture.id,
        creator_id: creatorId,
        amount_paise: capture.amountPaise,
        currency: capture.currency,
        gateway_fee_paise: capture.gatewayFeePaise,
        payer_label: capture.payerLabel,
        verified_via: "creator_webhook",
        captured_at: capture.capturedAt,
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (error) {
      console.error("[external-webhook] insert failed:", error.code, error.message);
      return NextResponse.json({ status: "deferred" }, { status: 503 });
    }
    await supabase
      .from("creator_external_webhooks")
      .update({ last_event_at: new Date().toISOString() })
      .eq("creator_id", creatorId);
    return NextResponse.json({ status: "ok" });
  },
);
