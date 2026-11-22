"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { StudioShell, apiJson, useStudioSession } from "@/app/component/studio/StudioShell";
import { Icon } from "@/app/component/ui/icons";
import { computeFeeBreakdown, formatBps } from "@/lib/payments/fees";
import { EXTERNAL_RAZORPAY_URL } from "@/lib/validation/preferences";

import { netShare, rupees, useOverview } from "../_shared/data";

type LinkStatus = { webhook_configured: boolean; last_event_at: string | null; webhook_url: string };

export default function FinanceClient() {
  const { session, authError, retryAuth } = useStudioSession("/dashboard/finance");
  const { data, error, reload } = useOverview(Boolean(session));
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const notify = useCallback((text: string, tone: "success" | "error") => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const feeBps = data?.sources?.qr_fee_bps ?? data?.platform?.platform_fee_bps ?? 800;
  const bearer = data?.sources?.gateway_fee_bearer ?? data?.platform?.gateway_fee_bearer ?? "platform";

  const totals = useMemo(() => {
    const p = data?.payments ?? [];
    return p.reduce(
      (a, x) => ({
        gross: a.gross + x.amount_paise - x.refunded_paise,
        fee: a.fee + x.platform_fee_paise,
        gateway: a.gateway + x.gateway_fee_paise,
        share: a.share + netShare(x),
        count: a.count + 1,
      }),
      { gross: 0, fee: 0, gateway: 0, share: 0, count: 0 },
    );
  }, [data]);

  const months = useMemo(() => {
    const map = new Map<string, { label: string; count: number; gross: number; fee: number; gateway: number; share: number }>();
    for (const x of data?.payments ?? []) {
      const d = new Date(x.captured_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const m = map.get(key) ?? { label: d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }), count: 0, gross: 0, fee: 0, gateway: 0, share: 0 };
      m.count += 1;
      m.gross += x.amount_paise - x.refunded_paise;
      m.fee += x.platform_fee_paise;
      m.gateway += x.gateway_fee_paise;
      m.share += netShare(x);
      map.set(key, m);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([, v]) => v);
  }, [data]);

  return (
    <StudioShell
      active="Finance"
      session={session}
      authError={authError}
      onRetry={retryAuth}
      eyebrow="Money · Finance"
      title="Finance"
      subtitle="Earnings by payment channel, fees line by line, and your own Razorpay link."
      toast={toast}
      aside={<Link href="/dashboard/payouts" className="sl-btn sl-btn-primary">Withdraw <Icon name="arrowRight" size={14} /></Link>}
    >
      {error && !data && (
        <div className="sl-card mb-5 flex items-center justify-between gap-4 p-5"><p className="sl-body">{error}</p><button type="button" className="sl-btn" onClick={reload}>Try again</button></div>
      )}

      <div className="sl-grid">
        {[
          ["Paid by viewers (QR)", rupees(totals.gross), `${totals.count} payments · last 120 days`],
          [`StreamLounge fee (${formatBps(feeBps)})`, rupees(totals.fee), "platform fee on QR superchats"],
          ["Gateway charges", rupees(totals.gateway), bearer === "platform" ? "Razorpay fee incl. GST · borne by StreamLounge" : "Razorpay fee incl. GST · deducted from your share"],
          ["Your share", rupees(totals.share), "after refunds"],
        ].map(([k, v, h], i) => (
          <div key={k} className="sl-span-3 sl-card sl-in p-5" style={{ ["--d" as string]: i * 40 }}>
            <div className="sl-stat-label">{k}</div>
            <div className="sl-stat-value">{data ? v : <span className="sl-skel inline-block h-7 w-24" />}</div>
            <div className="sl-stat-hint">{h}</div>
          </div>
        ))}

        <section className="sl-span-6 sl-card">
          <header className="sl-card-head"><h2 className="sl-h3">Balance</h2></header>
          <div className="sl-card-body">
            <dl className="space-y-2.5 text-[13.5px]">
              <Line k="Available to withdraw" v={rupees(data?.balance.available_paise ?? 0)} strong />
              <Line k={`Pending (${data?.platform?.settlement_hold_days ?? 7}-day settlement hold)`} v={rupees(data?.balance.pending_paise ?? 0)} />
              <Line k="Reserved for requested withdrawals" v={rupees(data?.balance.reserved_paise ?? 0)} />
              <Line k="Paid out to date" v={rupees(data?.balance.paid_out_paise ?? 0)} />
              <Line k="Total earned (ledger)" v={rupees(data?.balance.earned_paise ?? 0)} />
            </dl>
            <p className="sl-faint mt-4 text-[12px]">Balances come from the append-only ledger. Only StreamLounge QR payments are credited here.</p>
          </div>
        </section>

        <FeeCalculator feeBps={feeBps} bearer={bearer} />

        <section className="sl-span-12 sl-card">
          <header className="sl-card-head"><h2 className="sl-h3">Monthly breakdown · StreamLounge QR</h2></header>
          <div className="sl-card-body !px-0 !pb-2">
            {months.length === 0 ? (
              <p className="sl-muted px-5 py-6 text-[13px]">No QR payments in the last 120 days.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="sl-table">
                  <thead><tr><th>Month</th><th className="r">Payments</th><th className="r">Paid by viewers</th><th className="r">StreamLounge fee</th><th className="r">Gateway charges</th><th className="r">Your share</th></tr></thead>
                  <tbody>
                    {months.map((m) => (
                      <tr key={m.label}>
                        <td style={{ color: "var(--sl-fg)" }}>{m.label}</td>
                        <td className="r sl-num">{m.count}</td>
                        <td className="r sl-num">{rupees(m.gross)}</td>
                        <td className="r sl-num sl-muted">{rupees(m.fee)}</td>
                        <td className="r sl-num sl-muted">{rupees(m.gateway, true)}</td>
                        <td className="r sl-num" style={{ color: "var(--sl-fg)" }}>{rupees(m.share)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <ExternalLinkPanel
          initialUrl={data?.external_payment_url ?? null}
          migrated={data?.migration_0013 ?? false}
          externalGross={data?.sources?.external.gross_paise ?? 0}
          externalCount={data?.sources?.external.count ?? 0}
          notify={notify}
          onSaved={reload}
        />
      </div>
    </StudioShell>
  );
}

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="sl-muted">{k}</dt>
      <dd className={`sl-num ${strong ? "text-[15px] font-medium" : ""}`} style={strong ? { color: "var(--sl-fg)" } : undefined}>{v}</dd>
    </div>
  );
}

function FeeCalculator({ feeBps, bearer }: { feeBps: number; bearer: "platform" | "creator" }) {
  const [amount, setAmount] = useState("1000");
  const rupeesIn = Math.max(0, Math.min(500000, Math.floor(Number(amount) || 0)));
  const qr = computeFeeBreakdown({ source: "STREAMLOUNGE_QR", grossPaise: rupeesIn * 100, qrFeeBps: feeBps, gatewayFeeBearer: bearer });
  const ext = computeFeeBreakdown({ source: "EXTERNAL_RAZORPAY_LINK", grossPaise: rupeesIn * 100 });
  return (
    <section className="sl-span-6 sl-card">
      <header className="sl-card-head"><h2 className="sl-h3">Fee calculator</h2></header>
      <div className="sl-card-body">
        <label className="sl-label" htmlFor="calc">A viewer pays</label>
        <div className="sl-input-group max-w-[220px]">
          <span className="sl-addon">₹</span>
          <input id="calc" className="sl-input sl-num" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="sl-well p-4 text-[13px]">
            <p className="sl-kicker !text-[10px]">StreamLounge QR</p>
            <dl className="mt-3 space-y-1.5">
              <Line k={`Platform fee ${formatBps(qr.platformFeeBps)}`} v={rupees(qr.platformFeePaise, true)} />
              <Line k="Your gross share" v={rupees(qr.creatorGrossSharePaise, true)} strong />
            </dl>
          </div>
          <div className="sl-well p-4 text-[13px]">
            <p className="sl-kicker !text-[10px]">Your Razorpay link</p>
            <dl className="mt-3 space-y-1.5">
              <Line k="StreamLounge fee 0%" v={rupees(ext.platformFeePaise, true)} />
              <Line k="Paid to your Razorpay" v={rupees(ext.grossPaise, true)} strong />
            </dl>
          </div>
        </div>
        <p className="sl-faint mt-4 text-[12px] leading-5">
          Gateway charges and applicable taxes are separate from the platform fee.{" "}
          {bearer === "platform"
            ? "On QR superchats they are currently borne by StreamLounge, so your share is not reduced by them."
            : "On QR superchats they are currently deducted from your share; the exact amount is recorded per payment."}{" "}
          On your own link, Razorpay charges your account directly.
        </p>
      </div>
    </section>
  );
}

function ExternalLinkPanel({
  initialUrl, migrated, externalGross, externalCount, notify, onSaved,
}: {
  initialUrl: string | null;
  migrated: boolean;
  externalGross: number;
  externalCount: number;
  notify: (t: string, tone: "success" | "error") => void;
  onSaved: () => void;
}) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- sync when the overview reloads
  useEffect(() => setUrl(initialUrl ?? ""), [initialUrl]);
  useEffect(() => {
    let alive = true;
    apiJson<LinkStatus>("/api/creator/external-link").then((r) => { if (alive && r.ok) setStatus(r.data); });
    return () => { alive = false; };
  }, []);

  const valid = url.trim() === "" || EXTERNAL_RAZORPAY_URL.test(url.trim());

  async function saveUrl() {
    setBusy(true);
    const r = await apiJson("/api/creator/preferences", { method: "PATCH", body: JSON.stringify({ external_payment_url: url.trim() || null }) });
    setBusy(false);
    if (!r.ok) return notify(r.error, "error");
    notify(url.trim() ? "Razorpay link saved. It now shows on your public page." : "Razorpay link removed.", "success");
    onSaved();
  }

  async function saveSecret() {
    setBusy(true);
    const r = await apiJson<{ webhook_configured: boolean }>("/api/creator/external-link", { method: "PUT", body: JSON.stringify({ webhook_secret: secret }) });
    setBusy(false);
    if (!r.ok) return notify(r.error, "error");
    setSecret("");
    setStatus((s) => (s ? { ...s, webhook_configured: true } : s));
    notify("Webhook secret saved and encrypted.", "success");
  }

  async function removeSecret() {
    setBusy(true);
    const r = await apiJson("/api/creator/external-link", { method: "DELETE" });
    setBusy(false);
    if (r.ok) setStatus((s) => (s ? { ...s, webhook_configured: false } : s));
  }

  return (
    <section className="sl-span-12 sl-card">
      <header className="sl-card-head">
        <div>
          <h2 className="sl-h3">Your own Razorpay link <span className="sl-badge sl-badge-accent ml-2 align-middle">0% StreamLounge fee</span></h2>
          <p className="sl-muted mt-1 max-w-2xl text-[13px] leading-5">
            Put your own Razorpay payment link in your YouTube or Twitch descriptions. StreamLounge takes no commission on these payments; they go
            straight to your Razorpay account and do not enter your StreamLounge balance. Razorpay&apos;s own charges and taxes still apply on your account.
          </p>
        </div>
      </header>
      <div className="sl-card-body grid gap-8 lg:grid-cols-2">
        <div>
          <label className="sl-label" htmlFor="extlink">Payment link</label>
          <div className="flex gap-2">
            <input id="extlink" className="sl-input" placeholder="https://rzp.io/l/your-link" value={url} onChange={(e) => setUrl(e.target.value)} aria-invalid={!valid} />
            <button type="button" className="sl-btn sl-btn-primary" onClick={saveUrl} disabled={busy || !valid || !migrated}>Save</button>
          </div>
          <p className="sl-hint">{valid ? "Accepted: rzp.io, razorpay.me and pages.razorpay.com links." : "This doesn't look like a Razorpay payment link."}</p>
          {!migrated && <p className="sl-hint" style={{ color: "var(--sl-danger)" }}>Available once the latest database update is applied.</p>}
          <p className="sl-faint mt-5 text-[12px]">
            Reported through your webhook: <span className="sl-num">{rupees(externalGross)}</span> across {externalCount} payment{externalCount === 1 ? "" : "s"}. Shown for reference only.
          </p>
        </div>
        <div>
          <p className="sl-label">Optional: report these payments in StreamLounge</p>
          <ol className="sl-body sl-muted list-decimal space-y-1.5 pl-5 text-[13px]">
            <li>In Razorpay, open Settings → Webhooks and add a webhook.</li>
            <li>Use this URL and enable the <span className="sl-mono">payment.captured</span> event.</li>
            <li>Paste the same secret you set there below.</li>
          </ol>
          {status && (
            <div className="sl-well mt-3 flex items-center gap-2 p-2 pl-3">
              <code className="sl-mono min-w-0 flex-1 truncate text-[12px]">{status.webhook_url}</code>
              <button type="button" className="sl-btn sl-btn-sm" onClick={() => { void navigator.clipboard.writeText(status.webhook_url); notify("Webhook URL copied.", "success"); }}>
                <Icon name="copy" size={13} /> Copy
              </button>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <input className="sl-input" type="password" autoComplete="off" placeholder={status?.webhook_configured ? "Secret saved · paste to replace" : "Webhook secret"} value={secret} onChange={(e) => setSecret(e.target.value)} />
            <button type="button" className="sl-btn" onClick={saveSecret} disabled={busy || secret.length < 16 || !migrated}>Save secret</button>
          </div>
          {status?.webhook_configured && (
            <p className="sl-hint flex items-center gap-2">
              <span className="sl-badge sl-badge-success">Connected</span>
              {status.last_event_at ? `Last event ${new Date(status.last_event_at).toLocaleString("en-IN")}` : "No events yet"}
              <button type="button" className="sl-btn sl-btn-quiet sl-btn-sm" onClick={removeSecret}>Disconnect</button>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
