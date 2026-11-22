"use client";

import { useCallback, useEffect, useState } from "react";

import { apiJson } from "@/app/component/studio/StudioShell";

export type Balance = { earned_paise: number; pending_paise: number; available_paise: number; reserved_paise: number; paid_out_paise: number };
export type Summary = {
  superchats: number;
  supporters: number;
  gross_paise: number;
  last_30d_paise: number;
  streams: number;
  stream_seconds: number;
  live_now: boolean;
  top_supporters: { display_name: string; superchats: number; total_paise: number }[];
  payouts_enabled: boolean;
  min_payout_paise: number;
};
export type SourceSummary = {
  qr: { count: number; gross_paise: number; platform_fee_paise: number; creator_share_paise: number; gateway_fee_paise: number };
  external: { count: number; gross_paise: number; platform_fee_paise: number };
  qr_fee_bps: number;
  gateway_fee_bearer: "platform" | "creator";
  external_link_configured: boolean;
  external_webhook_configured: boolean;
};
export type Payment = {
  id: string;
  submission_id: string | null;
  display_name: string;
  interaction_type: string;
  amount_paise: number;
  platform_fee_bps: number;
  platform_fee_paise: number;
  gateway_fee_paise: number;
  gateway_fee_bearer: "platform" | "creator";
  creator_share_paise: number;
  refunded_paise: number;
  status: string;
  method: string | null;
  captured_at: string;
  payment_source: "STREAMLOUNGE_QR";
  message: string | null;
  delivery_status: string | null;
};
export type ExternalPayment = {
  id: string;
  amount_paise: number;
  gateway_fee_paise: number;
  payer_label: string | null;
  status: string;
  captured_at: string;
  payment_source: "EXTERNAL_RAZORPAY_LINK";
};
export type Overview = {
  balance: Balance;
  summary: Summary | null;
  sources: SourceSummary | null;
  payments: Payment[];
  external: ExternalPayment[];
  layout: unknown;
  external_payment_url: string | null;
  migration_0013: boolean;
  profile: { creator_name: string; username: string | null; public_page_enabled: boolean; profile_image_url: string | null } | null;
  interactions_enabled: number;
  platform: { platform_fee_bps: number; gateway_fee_bearer: "platform" | "creator"; settlement_hold_days: number; min_payout_paise: number } | null;
};

export function useOverview(enabled: boolean) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    apiJson<Overview>("/api/creator/overview").then((res) => {
      if (!alive) return;
      if (res.ok) {
        setData(res.data);
        setError(null);
      } else setError(res.error);
    });
    return () => {
      alive = false;
    };
  }, [enabled, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, reload };
}

export const INTERACTION_LABEL: Record<string, string> = {
  text: "Superchat",
  audio: "Voice note",
  soundboard: "Soundboard",
  stickers: "AI sticker",
  spin_wheel: "Spin the wheel",
  tasks: "Task",
};

export const STATUS_LABEL: Record<string, string> = {
  captured: "Paid",
  partially_refunded: "Partly refunded",
  refunded: "Refunded",
  disputed: "Disputed",
  dispute_lost: "Dispute lost",
};

export function rupees(paise: number, decimals = false): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Creator share net of refunds, the number a creator actually keeps from a payment. */
export function netShare(p: Payment): number {
  if (p.status === "refunded" || p.status === "dispute_lost") return 0;
  if (!p.refunded_paise) return p.creator_share_paise;
  return Math.round((p.creator_share_paise * (p.amount_paise - p.refunded_paise)) / p.amount_paise);
}

export function periodTotals(payments: Payment[], now = new Date()) {
  const today = startOfDay(now).getTime();
  const week = today - 6 * 86_400_000;
  const month = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  let t = 0, w = 0, m = 0, tc = 0;
  for (const p of payments) {
    const at = new Date(p.captured_at).getTime();
    const v = netShare(p);
    if (at >= today) { t += v; tc += 1; }
    if (at >= week) w += v;
    if (at >= month) m += v;
  }
  return { today: t, todayCount: tc, week: w, month: m };
}

export function dailySeries(payments: Payment[], days = 30, now = new Date()) {
  const end = startOfDay(now).getTime();
  const buckets = Array.from({ length: days }, (_, i) => ({ day: new Date(end - (days - 1 - i) * 86_400_000), value: 0, count: 0 }));
  for (const p of payments) {
    const idx = days - 1 - Math.floor((end - startOfDay(new Date(p.captured_at)).getTime()) / 86_400_000);
    if (idx >= 0 && idx < days) {
      buckets[idx].value += netShare(p);
      buckets[idx].count += 1;
    }
  }
  return buckets;
}

export function hoursLabel(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
