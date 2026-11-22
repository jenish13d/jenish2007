/**
 * StreamLounge payment channels and their platform fee.
 *
 * This module is the single TypeScript statement of the business rule. The
 * database (migration 0013, `sl_record_payment_capture`) applies the same rule
 * independently when it writes the ledger, and the regression tests in
 * tests/fees.test.ts pin both the numbers and the rounding.
 *
 *   STREAMLOUNGE_QR          8% platform fee, creator gross share 92%.
 *                            Money is collected by StreamLounge's own Razorpay
 *                            account (QR code, /c/<username> checkout).
 *   EXTERNAL_RAZORPAY_LINK   0% platform fee. The creator's own Razorpay
 *                            payment link (e.g. in a YouTube description). The
 *                            money never passes through StreamLounge, so it is
 *                            never credited to the creator ledger or counted
 *                            as platform revenue.
 *
 * The source is never read from a browser. It is decided by which Razorpay
 * account verified the payment: StreamLounge's platform webhook/API can only
 * ever see STREAMLOUNGE_QR payments; an external payment can only be recorded
 * through a creator-specific webhook signed with that creator's own secret.
 *
 * Gateway fees and taxes are separate from the platform fee. They are Razorpay's
 * actual charges read from the captured payment entity, and who bears them is
 * the `gateway_fee_bearer` platform setting (default: the platform), disclosed
 * separately. Nothing here claims a payment is free of gateway charges or tax.
 *
 * All amounts are integer paise. No floating point money.
 */

export const PAYMENT_SOURCES = ["STREAMLOUNGE_QR", "EXTERNAL_RAZORPAY_LINK"] as const;
export type PaymentSource = (typeof PAYMENT_SOURCES)[number];

/** Platform fee per channel, in basis points (1 bp = 0.01%). */
export const PLATFORM_FEE_BPS: Readonly<Record<PaymentSource, number>> = Object.freeze({
  STREAMLOUNGE_QR: 800,
  EXTERNAL_RAZORPAY_LINK: 0,
});

export const PAYMENT_SOURCE_LABEL: Readonly<Record<PaymentSource, string>> = Object.freeze({
  STREAMLOUNGE_QR: "StreamLounge QR",
  EXTERNAL_RAZORPAY_LINK: "Your Razorpay link",
});

export type GatewayFeeBearer = "platform" | "creator";

export function isPaymentSource(value: unknown): value is PaymentSource {
  return typeof value === "string" && (PAYMENT_SOURCES as readonly string[]).includes(value);
}

/** Whether money from this source is held by StreamLounge and enters the ledger. */
export function isPlatformCollected(source: PaymentSource): boolean {
  return source === "STREAMLOUNGE_QR";
}

/**
 * Postgres `round()` on numeric rounds half away from zero. For non-negative
 * integers that is Math.round; this helper makes the intent explicit and keeps
 * the TS and SQL results identical.
 */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

function assertPaise(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer number of paise`);
  }
}

export interface FeeBreakdown {
  source: PaymentSource;
  grossPaise: number;
  platformFeeBps: number;
  platformFeePaise: number;
  /** gross - platform fee. The creator's share before any gateway deduction. */
  creatorGrossSharePaise: number;
  gatewayFeePaise: number;
  gatewayFeeBearer: GatewayFeeBearer;
  /** What the creator is credited (QR) or receives directly (external). */
  creatorNetPaise: number;
  /** Platform fee minus gateway costs it absorbs. Always 0 for external. */
  platformNetPaise: number;
  platformCollected: boolean;
}

/**
 * Computes the fee split for one captured payment.
 *
 * @param gatewayFeePaise Razorpay's actual fee for the payment, inclusive of its
 *   GST, as reported on the payment entity. Pass 0 when unknown (for example a
 *   preview before payment). For external links Razorpay charges the creator's
 *   account directly, so it is reported but never booked by StreamLounge.
 */
export function computeFeeBreakdown(input: {
  source: PaymentSource;
  grossPaise: number;
  gatewayFeePaise?: number;
  gatewayFeeBearer?: GatewayFeeBearer;
  /** Override for the QR rate from platform_settings; ignored for external. */
  qrFeeBps?: number;
}): FeeBreakdown {
  const { source, grossPaise } = input;
  if (!isPaymentSource(source)) throw new TypeError("unknown payment source");
  assertPaise("grossPaise", grossPaise);
  const gatewayFeePaise = input.gatewayFeePaise ?? 0;
  assertPaise("gatewayFeePaise", gatewayFeePaise);

  const bps = source === "EXTERNAL_RAZORPAY_LINK"
    ? 0
    : input.qrFeeBps ?? PLATFORM_FEE_BPS.STREAMLOUNGE_QR;
  if (!Number.isInteger(bps) || bps < 0 || bps > 5000) {
    throw new RangeError("fee basis points out of range");
  }

  const platformFeePaise = roundHalfAwayFromZero((grossPaise * bps) / 10000);
  const creatorGrossSharePaise = grossPaise - platformFeePaise;
  const platformCollected = isPlatformCollected(source);

  if (!platformCollected) {
    // The creator's own Razorpay account bears its own gateway charges.
    return {
      source,
      grossPaise,
      platformFeeBps: 0,
      platformFeePaise: 0,
      creatorGrossSharePaise: grossPaise,
      gatewayFeePaise,
      gatewayFeeBearer: "creator",
      creatorNetPaise: grossPaise - gatewayFeePaise,
      platformNetPaise: 0,
      platformCollected,
    };
  }

  const bearer: GatewayFeeBearer = input.gatewayFeeBearer ?? "platform";
  const creatorNetPaise = bearer === "creator"
    ? creatorGrossSharePaise - gatewayFeePaise
    : creatorGrossSharePaise;
  const platformNetPaise = bearer === "creator"
    ? platformFeePaise
    : platformFeePaise - gatewayFeePaise;

  return {
    source,
    grossPaise,
    platformFeeBps: bps,
    platformFeePaise,
    creatorGrossSharePaise,
    gatewayFeePaise,
    gatewayFeeBearer: bearer,
    creatorNetPaise,
    platformNetPaise,
    platformCollected,
  };
}

/** Creator's share reversed by a (partial) refund, mirroring sl_record_refund. */
export function refundCreatorReversalPaise(
  creatorSharePaise: number,
  refundPaise: number,
  grossPaise: number,
): number {
  assertPaise("refundPaise", refundPaise);
  assertPaise("grossPaise", grossPaise);
  if (grossPaise === 0) return 0;
  if (refundPaise > grossPaise) throw new RangeError("refund exceeds captured amount");
  return roundHalfAwayFromZero((creatorSharePaise * refundPaise) / grossPaise);
}

export function formatBps(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(2).replace(/0$/, "")}%`;
}

export function formatPaise(paise: number, opts: { decimals?: boolean } = {}): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
