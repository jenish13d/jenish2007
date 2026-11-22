"use client";

import { useCallback, useEffect, useState } from "react";

import { Panel, Stat, StudioShell, apiJson, formatRupees, useStudioSession } from "@/app/component/studio/StudioShell";

type Balance = { earned_paise: number; pending_paise: number; available_paise: number; reserved_paise: number; paid_out_paise: number };
type Summary = {
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
type Payment = { id: string; display_name: string; interaction_type: string; amount_paise: number; creator_share_paise: number; platform_fee_paise: number; refunded_paise: number; status: string; captured_at: string };
type Payout = { id: string; amount_paise: number; status: string; failure_reason: string | null; requested_at: string; completed_at: string | null };
type Data = { balance: Balance; summary: Summary | null; payments: Payment[]; payouts: Payout[] };

const PAYOUT_LABEL: Record<string, string> = {
  requested: "Requested — awaiting review",
  approved: "Approved — sending to payout partner",
  processing: "Processing with payout partner",
  completed: "Paid (confirmed by payout partner)",
  failed: "Failed",
  cancelled: "Cancelled",
};

function hours(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

export default function PayoutsClient() {
  const { session, authError, retryAuth } = useStudioSession("/dashboard/payouts");
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  const notify = useCallback((text: string, tone: "success" | "error") => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchData = useCallback(() => apiJson<Data>("/api/creator/payouts"), []);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    fetchData().then((res) => {
      if (!alive) return;
      if (res.ok) setData(res.data);
      else setLoadError(res.error);
    });
    return () => {
      alive = false;
    };
  }, [session, fetchData]);

  async function requestPayout() {
    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees <= 0) return notify("Enter an amount in rupees.", "error");
    setBusy(true);
    const res = await apiJson<{ payout: Payout }>("/api/creator/payouts", {
      method: "POST",
      body: JSON.stringify({ amount_paise: Math.round(rupees * 100) }),
    });
    setBusy(false);
    if (!res.ok) return notify(res.error, "error");
    notify("Withdrawal requested. You'll see it update here as it moves.", "success");
    setAmount("");
    const fresh = await fetchData();
    if (fresh.ok) setData(fresh.data);
  }

  const b = data?.balance;
  const s = data?.summary;

  return (
    <StudioShell
      active="Payouts"
      session={session}
      authError={authError}
      onRetry={retryAuth}
      eyebrow="Money · Payouts"
      title="Payouts"
      subtitle="What you've earned, what's on hold, and every withdrawal — straight from the ledger."
      toast={toast}
    >
      {loadError && !data ? (
        <div className="st-glass p-8">
          <h2 className="st-h2 !text-lg">Earnings aren&apos;t available yet</h2>
          <p className="st-muted mt-2 text-sm">{loadError}</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Available" value={b ? formatRupees(b.available_paise) : "—"} hint="Ready to withdraw" delay={40} />
            <Stat label="Pending" value={b ? formatRupees(b.pending_paise) : "—"} hint="Settlement hold" color="#FBBF24" delay={80} />
            <Stat label="Total earned" value={b ? formatRupees(b.earned_paise) : "—"} hint="After the StreamLounge QR fee and refunds" color="#A78BFA" delay={120} />
            <Stat label="Paid out" value={b ? formatRupees(b.paid_out_paise) : "—"} hint="Confirmed by payout partner" color="#60A5FA" delay={160} />
            <Stat label="Superchats" value={s ? String(s.superchats) : "—"} delay={200} />
            <Stat label="Supporters" value={s ? String(s.supporters) : "—"} delay={240} />
            <Stat label="Streams" value={s ? String(s.streams) : "—"} hint={s?.live_now ? "Live now" : "With the overlay open"} delay={280} />
            <Stat label="Stream time" value={s ? hours(s.stream_seconds) : "—"} delay={320} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-6">
              <Panel title="Recent superchats" subtitle="Your share is after the platform fee shown on Manage Interactions." delay={360}>
                {!data?.payments.length ? (
                  <p className="st-muted text-sm">No paid superchats yet. Share your payment link to get started.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="st-muted text-xs">
                        <tr><th className="py-2 pr-3">When</th><th className="pr-3">From</th><th className="pr-3">Paid</th><th className="pr-3">Your share</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {data.payments.map((p) => (
                          <tr key={p.id} className="border-t border-white/5">
                            <td className="py-2 pr-3 text-white/70">{when(p.captured_at)}</td>
                            <td className="pr-3 text-white">{p.display_name}</td>
                            <td className="pr-3">{formatRupees(p.amount_paise)}</td>
                            <td className="pr-3 text-[color:var(--sl-accent)]">{formatRupees(p.creator_share_paise)}</td>
                            <td className="text-white/70">{p.status.replace("_", " ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              <Panel title="Withdrawal history" delay={420}>
                {!data?.payouts.length ? (
                  <p className="st-muted text-sm">No withdrawals yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.payouts.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-4 border-b border-white/5 pb-3 last:border-0">
                        <div>
                          <p className="text-sm text-white">{formatRupees(p.amount_paise)}</p>
                          <p className="st-muted text-xs">Requested {when(p.requested_at)}{p.completed_at ? ` · paid ${when(p.completed_at)}` : ""}</p>
                          {p.failure_reason && <p className="mt-1 text-xs text-red-300">{p.failure_reason}</p>}
                        </div>
                        <span className={`st-chip !text-xs ${p.status === "completed" ? "st-chip-on" : ""}`}>{PAYOUT_LABEL[p.status] ?? p.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <div className="space-y-6">
              <Panel title="Withdraw" delay={380}>
                {s && !s.payouts_enabled ? (
                  <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100">
                    Withdrawals open once our payout partner (Razorpay Route) approves StreamLounge. Your balance is recorded in the ledger and keeps accruing until then.
                  </p>
                ) : (
                  <>
                    <label className="st-muted text-xs" htmlFor="payout-amount">Amount (₹)</label>
                    <input
                      id="payout-amount"
                      inputMode="decimal"
                      className="st-field mt-1 w-full"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder={s ? `Minimum ${formatRupees(s.min_payout_paise)}` : ""}
                    />
                    <button type="button" className="st-btn-mint mt-3 w-full !py-3" disabled={busy || !b?.available_paise} onClick={requestPayout}>
                      {busy ? "Requesting…" : "Request withdrawal"}
                    </button>
                    <p className="st-muted mt-3 text-xs leading-5">
                      We aim to pay within 5 working days of approval. A withdrawal shows as paid only after the payout partner confirms the transfer.
                    </p>
                  </>
                )}
              </Panel>

              <Panel title="Top supporters" subtitle="By the name they chose to show." delay={440}>
                {!s?.top_supporters.length ? (
                  <p className="st-muted text-sm">Your biggest supporters will appear here.</p>
                ) : (
                  <ol className="space-y-2">
                    {s.top_supporters.map((t, i) => (
                      <li key={t.display_name + i} className="flex items-center justify-between text-sm">
                        <span className="text-white"><span className="st-muted mr-2 text-xs">{i + 1}</span>{t.display_name}</span>
                        <span className="text-[color:var(--sl-accent)]">{formatRupees(t.total_paise)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </Panel>
            </div>
          </div>
        </div>
      )}
    </StudioShell>
  );
}
