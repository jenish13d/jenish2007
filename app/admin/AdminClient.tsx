"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";

import { Stat, apiJson, d, formatRupees } from "@/app/component/studio/StudioShell";
import { STUDIO_CSS } from "@/app/component/studio/theme";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Overview = {
  creators_total: number; creators_public: number; creators_active_30d: number; viewers_registered: number;
  payers_signed_in: number; superchats: number; volume_paise: number; refunds_paise: number;
  platform_revenue_paise: number; gateway_fees_paise: number; creator_earnings_paise: number;
  payouts_pending_paise: number; payouts_completed_paise: number; payouts_failed_count: number;
  disputes_open: number; live_now: number; stream_seconds: number; webhook_failures: number;
  growth: Record<string, number>;
};
type CreatorRow = {
  creator_id: string; username: string | null; creator_name: string; registered_at: string; public_page: boolean;
  youtube_connected: boolean; streams: number; stream_seconds: number; superchats: number; gross_paise: number;
  creator_share_paise: number; platform_share_paise: number; pending_payout_paise: number; paid_out_paise: number;
  available_paise: number;
};
type Payout = {
  id: string; creator_id: string; amount_paise: number; status: string; provider_ref: string | null;
  failure_reason: string | null; requested_at: string; creator_profiles?: { username: string | null; creator_name: string } | null;
};
type Gate = "loading" | "denied" | "mfa" | "ok";
const TABS = ["Overview", "Creators", "Payouts", "Finance", "Settings", "Audit"] as const;

function hours(seconds: number) {
  return `${(seconds / 3600).toFixed(1)} h`;
}

export default function AdminClient() {
  const [gate, setGate] = useState<Gate>("loading");
  const [mfaEnrolled, setMfaEnrolled] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [role, setRole] = useState<string>("admin");
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  const notify = useCallback((text: string, tone: "success" | "error") => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/overview", { credentials: "same-origin" });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.success) {
      setOverview(body.overview);
      setRole(body.role);
      setGate("ok");
    } else if (body.mfa_required) {
      setMfaEnrolled(Boolean(body.mfa_enrolled));
      setGate("mfa");
    } else {
      setGate("denied");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="st-root min-h-screen">
      <style>{STUDIO_CSS}</style>
      <div className="st-ambient" aria-hidden="true">
        <span className="st-orb st-orb-1" />
        <span className="st-orb st-orb-2" />
        <span className="st-grid" />
      </div>
      {toast && (
        <div role="status" aria-live="polite" className={`st-toast ${toast.tone === "success" ? "st-toast-success" : "st-toast-error"}`}>
          {toast.text}
        </div>
      )}
      <main className="relative mx-auto max-w-[1400px] px-5 py-8 md:px-8">
        <header className="st-rise mb-8 flex flex-wrap items-end justify-between gap-4" style={d(0)}>
          <div>
            <Link href="/" className="text-xl font-semibold tracking-tight">
              <span className="text-[#6CCEB0]">ϟ</span> Stream<span className="text-[#C7B8F0]">Lounge</span>
            </Link>
            <p className="st-eyebrow mt-4"><span className="st-dot" />Owner console</p>
          </div>
          {gate === "ok" && (
            <nav className="st-tabs flex flex-wrap gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1" aria-label="Admin sections">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  aria-current={tab === t ? "page" : undefined}
                  className={`rounded-full px-4 py-2 text-sm ${tab === t ? "bg-[#5EEAD4]/15 text-[#5EEAD4]" : "text-white/60 hover:text-white"}`}
                >
                  {t}
                </button>
              ))}
            </nav>
          )}
        </header>

        {gate === "loading" && <div className="st-glass st-skel h-64" aria-busy="true" />}
        {gate === "denied" && (
          <div className="st-glass p-10 text-center">
            <h1 className="st-h2">Page not found</h1>
            <p className="st-muted mt-2">There&apos;s nothing here.</p>
          </div>
        )}
        {gate === "mfa" && <MfaGate enrolled={mfaEnrolled} onVerified={load} notify={notify} />}
        {gate === "ok" && overview && (
          <>
            {tab === "Overview" && <OverviewTab o={overview} />}
            {tab === "Creators" && <CreatorsTab notify={notify} isOwner={role === "owner"} />}
            {tab === "Payouts" && <PayoutsTab notify={notify} />}
            {tab === "Finance" && <FinanceTab />}
            {tab === "Settings" && <SettingsTab notify={notify} isOwner={role === "owner"} />}
            {tab === "Audit" && <AuditTab />}
          </>
        )}
      </main>
    </div>
  );
}

function MfaGate({ enrolled, onVerified, notify }: { enrolled: boolean; onVerified: () => void; notify: (t: string, tone: "success" | "error") => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = data?.totp?.find((f) => f.status === "verified");
      if (verified) {
        setFactorId(verified.id);
        return;
      }
      if (!enrolled) {
        const { data: enroll, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `StreamLounge admin ${Date.now()}` });
        if (error || !enroll) {
          notify(error?.message || "Could not start two-factor setup.", "error");
          return;
        }
        setFactorId(enroll.id);
        setQr(enroll.totp.qr_code);
        setSecret(enroll.totp.secret);
      }
    })();
  }, [enrolled, notify]);

  async function verify() {
    if (!factorId || !/^\d{6}$/.test(code)) {
      notify("Enter the 6-digit code from your authenticator app.", "error");
      return;
    }
    setBusy(true);
    const { error } = await getSupabaseBrowserClient().auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (error) notify("That code didn't match. Try the next one.", "error");
    else onVerified();
  }

  return (
    <section className="st-glass st-rise mx-auto max-w-md p-8" style={d(60)}>
      <h1 className="st-h2 !text-2xl">Two-factor verification</h1>
      <p className="st-muted mt-2 text-sm leading-6">
        The owner console handles money and private data, so every session needs a code from an authenticator app
        (Google Authenticator, 1Password, Authy).
      </p>
      {qr && (
        <div className="mt-6 rounded-2xl bg-white p-4">
          {/* Supabase returns the QR as an SVG data URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Scan this QR code with your authenticator app" className="mx-auto h-48 w-48" />
        </div>
      )}
      {secret && <p className="st-muted mt-3 break-all text-center text-xs">Or enter this key: <code className="text-white">{secret}</code></p>}
      <label className="st-label mt-6" htmlFor="totp">6-digit code</label>
      <input
        id="totp"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        className="st-field w-full text-center text-2xl tracking-[.4em]"
      />
      <button type="button" onClick={verify} disabled={busy} className="st-btn-mint mt-5 w-full">
        {busy ? "Checking…" : "Verify"}
      </button>
    </section>
  );
}

function OverviewTab({ o }: { o: Overview }) {
  const money: [string, number][] = [
    ["Transaction volume", o.volume_paise],
    ["Platform revenue (net of gateway fees)", o.platform_revenue_paise],
    ["Creator earnings", o.creator_earnings_paise],
    ["Gateway charges", o.gateway_fees_paise],
    ["Refunds", o.refunds_paise],
    ["Pending payouts", o.payouts_pending_paise],
    ["Completed payouts", o.payouts_completed_paise],
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Creators" value={String(o.creators_total)} hint={`${o.creators_public} with public pages`} delay={40} />
        <Stat label="Active (30d)" value={String(o.creators_active_30d)} hint="received a payment" color="#A78BFA" delay={80} />
        <Stat label="Viewer accounts" value={String(o.viewers_registered)} hint={`${o.payers_signed_in} paid signed in`} color="#4D8AFF" delay={120} />
        <Stat label="Superchats" value={String(o.superchats)} color="#F472B6" delay={160} />
        <Stat label="Live now" value={String(o.live_now)} hint="overlays online" delay={200} />
        <Stat label="Overlay online time" value={hours(o.stream_seconds)} hint="sessions over 1 minute" color="#A78BFA" delay={240} />
        <Stat label="Failed payouts" value={String(o.payouts_failed_count)} color="#F87171" delay={280} />
        <Stat label="Open disputes" value={String(o.disputes_open)} hint={`${o.webhook_failures} stuck webhooks`} color="#FBBF24" delay={320} />
      </div>
      <section className="st-glass st-rise p-6" style={d(360)}>
        <h2 className="st-h2 !text-lg">Money</h2>
        <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {money.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-2">
              <dt className="st-muted text-sm">{label}</dt>
              <dd className="text-base font-medium text-white">{formatRupees(Number(value) || 0)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="st-glass st-rise p-6" style={d(420)}>
        <h2 className="st-h2 !text-lg">Growth</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {(["1d", "7d", "30d"] as const).map((w) => (
            <div key={w} className="rounded-2xl border border-white/10 p-4">
              <p className="st-eyebrow !tracking-[.14em]">Last {w}</p>
              <p className="mt-2 text-white">{o.growth[`signups_${w}`]} sign-ups</p>
              <p className="st-muted text-sm">{formatRupees(o.growth[`volume_${w}_paise`] || 0)} volume</p>
            </div>
          ))}
        </div>
      </section>
      <ExportBar />
    </div>
  );
}

function ExportBar() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const qs = (type: string) => `/api/admin/export?type=${type}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`;
  return (
    <section className="st-glass st-rise flex flex-wrap items-end gap-4 p-6" style={d(480)}>
      <div>
        <label className="st-label" htmlFor="from">From</label>
        <input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="st-field" />
      </div>
      <div>
        <label className="st-label" htmlFor="to">To</label>
        <input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="st-field" />
      </div>
      {["payments", "payouts", "ledger"].map((t) => (
        <a key={t} href={qs(t)} className="st-btn-ghost">Export {t} (CSV)</a>
      ))}
    </section>
  );
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="st-glass overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="border-b border-white/10 text-[11px] uppercase tracking-[.12em] text-white/50">
          <tr>{head.map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-white/5">{children}</tbody>
      </table>
    </div>
  );
}

function CreatorsTab({ notify, isOwner }: { notify: (t: string, tone: "success" | "error") => void; isOwner: boolean }) {
  const [rows, setRows] = useState<CreatorRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [adjusting, setAdjusting] = useState<CreatorRow | null>(null);

  const load = useCallback(async (q: string) => {
    const res = await apiJson<{ creators: CreatorRow[] }>(`/api/admin/creators?search=${encodeURIComponent(q)}`);
    if (res.ok) setRows(res.data.creators);
    else notify(res.error, "error");
  }, [notify]);

  useEffect(() => {
    const t = window.setTimeout(() => load(search), 250);
    return () => window.clearTimeout(t);
  }, [search, load]);

  return (
    <div className="space-y-4">
      <input
        type="search"
        aria-label="Search creators"
        placeholder="Search by username or name"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="st-field w-full max-w-md"
      />
      {!rows ? <div className="st-glass st-skel h-40" /> : rows.length === 0 ? (
        <p className="st-muted">No creators match.</p>
      ) : (
        <Table head={["Creator", "Joined", "Status", "Streams", "Superchats", "Gross", "Creator share", "StreamLounge share", "Available", "Pending payout", "Paid out", ""]}>
          {rows.map((c) => (
            <tr key={c.creator_id}>
              <td className="px-4 py-3">
                <div className="font-medium text-white">{c.creator_name}</div>
                <div className="st-muted text-xs">@{c.username ?? "—"} · <code className="text-[10px]">{c.creator_id.slice(0, 8)}</code></div>
              </td>
              <td className="px-4 py-3 text-white/70">{new Date(c.registered_at).toLocaleDateString("en-IN")}</td>
              <td className="px-4 py-3">{c.public_page ? <span className="st-chip st-chip-on !text-[10px]">Public</span> : <span className="st-chip !text-[10px]">Private</span>}{c.youtube_connected && <span className="st-muted ml-2 text-xs">YT</span>}</td>
              <td className="px-4 py-3 text-white/70">{c.streams} · {hours(c.stream_seconds)}</td>
              <td className="px-4 py-3 text-white/70">{c.superchats}</td>
              <td className="px-4 py-3">{formatRupees(c.gross_paise)}</td>
              <td className="px-4 py-3">{formatRupees(c.creator_share_paise)}</td>
              <td className="px-4 py-3">{formatRupees(c.platform_share_paise)}</td>
              <td className="px-4 py-3">{formatRupees(c.available_paise)}</td>
              <td className="px-4 py-3">{formatRupees(c.pending_payout_paise)}</td>
              <td className="px-4 py-3">{formatRupees(c.paid_out_paise)}</td>
              <td className="px-4 py-3">{isOwner && <button type="button" className="text-xs text-[#5EEAD4] hover:underline" onClick={() => setAdjusting(c)}>Adjust…</button>}</td>
            </tr>
          ))}
        </Table>
      )}
      {adjusting && <AdjustDialog creator={adjusting} onClose={() => setAdjusting(null)} onDone={() => { setAdjusting(null); load(search); }} notify={notify} />}
    </div>
  );
}

function AdjustDialog({ creator, onClose, onDone, notify }: { creator: CreatorRow; onClose: () => void; onDone: () => void; notify: (t: string, tone: "success" | "error") => void }) {
  const [rupees, setRupees] = useState("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  async function submit() {
    const amount = Math.round(Number(rupees) * 100);
    const res = await apiJson("/api/admin/adjust", {
      method: "POST",
      body: JSON.stringify({ creator_id: creator.creator_id, amount_paise: amount, reason, confirmation }),
    });
    if (res.ok) {
      notify("Adjustment recorded and audited.", "success");
      onDone();
    } else notify(res.error, "error");
  }
  return (
    <div role="dialog" aria-modal="true" aria-label="Ledger adjustment" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="st-glass w-full max-w-md p-6">
        <h3 className="st-h2 !text-lg">Adjust {creator.creator_name}&apos;s balance</h3>
        <p className="st-muted mt-1 text-xs leading-5">Adjustments never edit history. They add an audited entry with your account, the reason, and before/after balances.</p>
        <label className="st-label mt-4" htmlFor="adj-amount">Amount in ₹ (negative to deduct)</label>
        <input id="adj-amount" type="number" step="0.01" value={rupees} onChange={(e) => setRupees(e.target.value)} className="st-field w-full" />
        <label className="st-label mt-3" htmlFor="adj-reason">Reason</label>
        <textarea id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="st-field w-full" rows={3} />
        <label className="st-label mt-3" htmlFor="adj-confirm">Type ADJUST to confirm</label>
        <input id="adj-confirm" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="st-field w-full" />
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="st-btn-ghost">Cancel</button>
          <button type="button" onClick={submit} disabled={confirmation !== "ADJUST" || reason.trim().length < 10} className="st-btn-mint !py-2.5">Record adjustment</button>
        </div>
      </div>
    </div>
  );
}

function PayoutsTab({ notify }: { notify: (t: string, tone: "success" | "error") => void }) {
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<Payout[] | null>(null);
  const load = useCallback(async () => {
    const res = await apiJson<{ payouts: Payout[] }>(`/api/admin/payouts${status ? `?status=${status}` : ""}`);
    if (res.ok) setRows(res.data.payouts);
    else notify(res.error, "error");
  }, [status, notify]);
  useEffect(() => { load(); }, [load]);

  async function act(p: Payout, next: "approved" | "cancelled") {
    const reason = window.prompt(next === "approved" ? "Reason for approving (10+ characters):" : "Reason for cancelling (10+ characters):");
    if (!reason) return;
    const res = await apiJson("/api/admin/payouts", { method: "POST", body: JSON.stringify({ id: p.id, status: next, reason, confirm: true }) });
    if (res.ok) { notify(`Payout ${next}.`, "success"); load(); } else notify(res.error, "error");
  }

  return (
    <div className="space-y-4">
      <div className="st-glass p-4 text-sm leading-6 text-white/70">
        Approving a request does not move money. Payouts are sent and marked completed or failed only by the payout
        provider (Razorpay Route) once your marketplace account is approved. Nobody can mark a payout as paid by hand.
      </div>
      <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="st-field">
        <option value="">All statuses</option>
        {["requested", "approved", "processing", "completed", "failed", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      {!rows ? <div className="st-glass st-skel h-40" /> : rows.length === 0 ? <p className="st-muted">No payout requests yet.</p> : (
        <Table head={["Creator", "Amount", "Status", "Requested", "Provider ref", "Note", ""]}>
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-3">{p.creator_profiles?.creator_name ?? p.creator_id.slice(0, 8)} <span className="st-muted text-xs">@{p.creator_profiles?.username}</span></td>
              <td className="px-4 py-3">{formatRupees(p.amount_paise)}</td>
              <td className="px-4 py-3"><span className="st-chip !text-[10px]">{p.status}</span></td>
              <td className="px-4 py-3 text-white/70">{new Date(p.requested_at).toLocaleString("en-IN")}</td>
              <td className="px-4 py-3 text-white/70">{p.provider_ref ?? "—"}</td>
              <td className="px-4 py-3 text-white/70">{p.failure_reason ?? ""}</td>
              <td className="px-4 py-3 space-x-3">
                {p.status === "requested" && <button type="button" className="text-xs text-[#5EEAD4]" onClick={() => act(p, "approved")}>Approve</button>}
                {(p.status === "requested" || p.status === "approved") && <button type="button" className="text-xs text-red-300" onClick={() => act(p, "cancelled")}>Cancel</button>}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function FinanceTab() {
  const [data, setData] = useState<{
    payments: { id: string; display_name: string; amount_paise: number; platform_fee_paise: number; gateway_fee_paise: number; creator_share_paise: number; refunded_paise: number; status: string; captured_at: string }[];
    refunds: { id: string; payment_id: string; amount_paise: number; status: string; created_at: string }[];
    disputes: { id: string; payment_id: string; amount_paise: number; status: string; created_at: string }[];
    discrepancies: { unprocessed_webhooks: { event_id: string; event: string; received_at: string; error: string | null }[]; payments_without_alert: { id: string; amount_paise: number; captured_at: string }[] };
  } | null>(null);
  useEffect(() => { apiJson<NonNullable<typeof data>>("/api/admin/finance").then((r) => r.ok && setData(r.data)); }, []);
  if (!data) return <div className="st-glass st-skel h-40" />;
  return (
    <div className="space-y-6">
      <section className="st-glass p-6">
        <h2 className="st-h2 !text-lg">Reconciliation</h2>
        <p className="st-muted mt-1 text-sm">{data.discrepancies.unprocessed_webhooks.length} webhook events not processed · {data.discrepancies.payments_without_alert.length} payments older than an hour with no alert delivered</p>
        <ul className="mt-3 space-y-1 text-xs text-white/70">
          {data.discrepancies.unprocessed_webhooks.map((w) => <li key={w.event_id}>{w.event} · {new Date(w.received_at).toLocaleString("en-IN")} · {w.error ?? "pending"}</li>)}
          {data.discrepancies.payments_without_alert.map((p) => <li key={p.id}>{p.id} · {formatRupees(p.amount_paise)} · no alert</li>)}
        </ul>
      </section>
      <Table head={["Payment", "Sender", "Amount", "Platform fee", "Gateway", "Creator", "Refunded", "Status", "Captured"]}>
        {data.payments.map((p) => (
          <tr key={p.id}>
            <td className="px-4 py-3"><code className="text-xs">{p.id}</code></td>
            <td className="px-4 py-3">{p.display_name}</td>
            <td className="px-4 py-3">{formatRupees(p.amount_paise)}</td>
            <td className="px-4 py-3">{formatRupees(p.platform_fee_paise)}</td>
            <td className="px-4 py-3">{formatRupees(p.gateway_fee_paise)}</td>
            <td className="px-4 py-3">{formatRupees(p.creator_share_paise)}</td>
            <td className="px-4 py-3">{formatRupees(p.refunded_paise)}</td>
            <td className="px-4 py-3"><span className="st-chip !text-[10px]">{p.status}</span></td>
            <td className="px-4 py-3 text-white/70">{new Date(p.captured_at).toLocaleString("en-IN")}</td>
          </tr>
        ))}
      </Table>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="st-glass p-6">
          <h3 className="st-h2 !text-base">Refunds</h3>
          <ul className="mt-3 space-y-1 text-sm text-white/70">{data.refunds.length === 0 ? <li>None</li> : data.refunds.map((r) => <li key={r.id}>{r.id} · {formatRupees(r.amount_paise)} · {r.status}</li>)}</ul>
        </section>
        <section className="st-glass p-6">
          <h3 className="st-h2 !text-base">Disputes</h3>
          <ul className="mt-3 space-y-1 text-sm text-white/70">{data.disputes.length === 0 ? <li>None</li> : data.disputes.map((x) => <li key={x.id}>{x.id} · {formatRupees(x.amount_paise)} · {x.status}</li>)}</ul>
        </section>
      </div>
    </div>
  );
}

function SettingsTab({ notify, isOwner }: { notify: (t: string, tone: "success" | "error") => void; isOwner: boolean }) {
  const [settings, setSettings] = useState<Record<string, number | string | boolean> | null>(null);
  const [changes, setChanges] = useState<Record<string, number | string | boolean>>({});
  const [reason, setReason] = useState("");
  useEffect(() => { apiJson<{ settings: Record<string, number | string | boolean> }>("/api/admin/settings").then((r) => r.ok && setSettings(r.data.settings)); }, []);
  if (!settings) return <div className="st-glass st-skel h-40" />;
  const view = { ...settings, ...changes };
  const num = (key: string, label: string, hint?: string) => (
    <div key={key}>
      <label className="st-label" htmlFor={key}>{label}</label>
      <input id={key} type="number" disabled={!isOwner} value={Number(view[key])} onChange={(e) => setChanges((c) => ({ ...c, [key]: Math.round(Number(e.target.value)) }))} className="st-field w-full" />
      {hint && <p className="st-muted mt-1 text-xs">{hint}</p>}
    </div>
  );
  async function save() {
    const res = await apiJson<{ settings: Record<string, number | string | boolean> }>("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ changes, reason }) });
    if (res.ok) { setSettings(res.data.settings); setChanges({}); setReason(""); notify("Settings saved and audited.", "success"); }
    else notify(res.error, "error");
  }
  return (
    <section className="st-glass p-6">
      <p className="st-muted text-sm leading-6">Fee changes apply to new payments only; each payment keeps the rate in force when it was captured. Changing creator-facing terms should be announced to creators in advance.</p>
      <div className="mt-5 grid gap-5 md:grid-cols-3">
        {num("platform_fee_bps", "Platform fee (basis points)", `${(Number(view.platform_fee_bps) / 100).toFixed(2)}% of each payment`)}
        <div>
          <label className="st-label" htmlFor="bearer">Gateway fee paid by</label>
          <select id="bearer" disabled={!isOwner} value={String(view.gateway_fee_bearer)} onChange={(e) => setChanges((c) => ({ ...c, gateway_fee_bearer: e.target.value }))} className="st-field w-full">
            <option value="platform">StreamLounge</option>
            <option value="creator">Creator</option>
          </select>
        </div>
        {num("settlement_hold_days", "Settlement hold (days)", "Earnings become withdrawable after this")}
        {num("min_payout_paise", "Minimum withdrawal (paise)")}
        {num("message_limit_default", "Default message limit")}
        {num("message_limit_min", "Lowest limit creators can pick")}
        {num("message_limit_max", "Highest limit creators can pick")}
        {num("points_per_rupee", "LoungePoints per ₹1 paid")}
        {num("points_per_redemption", "Points per redemption", "1000 by default")}
        {num("redemption_value_paise", "Redemption value (paise)", "1000 paise = ₹10 by default")}
        <div>
          <label className="st-label" htmlFor="points-enabled">LoungePoints</label>
          <select id="points-enabled" disabled={!isOwner} value={String(view.points_enabled)} onChange={(e) => setChanges((c) => ({ ...c, points_enabled: e.target.value === "true" }))} className="st-field w-full">
            <option value="false">Off</option>
            <option value="true">On</option>
          </select>
        </div>
      </div>
      {isOwner && (
        <div className="mt-6 flex flex-wrap items-end gap-4">
          <div className="grow">
            <label className="st-label" htmlFor="settings-reason">Reason for this change (recorded in the audit log)</label>
            <input id="settings-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="st-field w-full" />
          </div>
          <button type="button" onClick={save} disabled={Object.keys(changes).length === 0 || reason.trim().length < 10} className="st-btn-mint">Save settings</button>
        </div>
      )}
    </section>
  );
}

function AuditTab() {
  const [entries, setEntries] = useState<{ id: number; admin_id: string | null; action: string; target_type: string | null; target_id: string | null; reason: string | null; created_at: string }[] | null>(null);
  useEffect(() => { apiJson<{ entries: NonNullable<typeof entries> }>("/api/admin/audit").then((r) => r.ok && setEntries(r.data.entries)); }, []);
  if (!entries) return <div className="st-glass st-skel h-40" />;
  return (
    <Table head={["When", "Admin", "Action", "Target", "Reason"]}>
      {entries.map((e) => (
        <tr key={e.id}>
          <td className="px-4 py-3 text-white/70">{new Date(e.created_at).toLocaleString("en-IN")}</td>
          <td className="px-4 py-3"><code className="text-xs">{e.admin_id?.slice(0, 8) ?? "system"}</code></td>
          <td className="px-4 py-3">{e.action}</td>
          <td className="px-4 py-3 text-white/70">{e.target_type} {e.target_id?.slice(0, 12)}</td>
          <td className="px-4 py-3 text-white/70">{e.reason}</td>
        </tr>
      ))}
    </Table>
  );
}
