"use client";

import { useMemo, useState } from "react";

import { StudioShell, useStudioSession } from "@/app/component/studio/StudioShell";
import { Icon } from "@/app/component/ui/icons";
import { PAYMENT_SOURCE_LABEL, formatBps, type PaymentSource } from "@/lib/payments/fees";

import { INTERACTION_LABEL, STATUS_LABEL, netShare, rupees, useOverview, when } from "../_shared/data";

type Row = {
  id: string;
  at: string;
  name: string;
  type: string;
  message: string | null;
  source: PaymentSource;
  amount: number;
  fee: number;
  share: number;
  status: string;
  refunded: number;
  delivery: string | null;
  bps: number;
};

const RANGES = [
  { id: "7", label: "7 days" },
  { id: "30", label: "30 days" },
  { id: "120", label: "120 days" },
] as const;

const DELIVERY: Record<string, string> = { pending: "Queued", processing: "Playing", completed: "Shown", failed: "Failed" };

function csvCell(v: string | number) {
  const s = String(v);
  // Neutralise spreadsheet formula injection and quote everything.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export default function SuperchatsClient() {
  const { session, authError, retryAuth } = useStudioSession("/dashboard/superchats");
  const { data, error, reload } = useOverview(Boolean(session));
  const [q, setQ] = useState("");
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("30");
  const [source, setSource] = useState<"all" | PaymentSource>("all");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const qr: Row[] = data.payments.map((p) => ({
      id: p.id, at: p.captured_at, name: p.display_name, type: p.interaction_type, message: p.message, source: "STREAMLOUNGE_QR",
      amount: p.amount_paise, fee: p.platform_fee_paise, share: netShare(p), status: p.status, refunded: p.refunded_paise, delivery: p.delivery_status, bps: p.platform_fee_bps,
    }));
    const ext: Row[] = data.external.map((e) => ({
      id: e.id, at: e.captured_at, name: e.payer_label || "Supporter", type: "external", message: null, source: "EXTERNAL_RAZORPAY_LINK",
      amount: e.amount_paise, fee: 0, share: e.status === "refunded" ? 0 : e.amount_paise, status: e.status === "refunded" ? "refunded" : "captured", refunded: 0, delivery: null, bps: 0,
    }));
    return [...qr, ...ext].sort((a, b) => b.at.localeCompare(a.at));
  }, [data]);

  const filtered = useMemo(() => {
    const since = Date.now() - Number(range) * 86_400_000;
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      new Date(r.at).getTime() >= since &&
      (source === "all" || r.source === source) &&
      (status === "all" || r.status === status) &&
      (!needle || r.name.toLowerCase().includes(needle) || (r.message ?? "").toLowerCase().includes(needle) || r.id.toLowerCase().includes(needle)),
    );
  }, [rows, q, range, source, status]);

  const totals = filtered.reduce((a, r) => ({ amount: a.amount + r.amount, fee: a.fee + r.fee, share: a.share + r.share }), { amount: 0, fee: 0, share: 0 });

  function exportCsv() {
    const header = ["Date", "Payment ID", "Supporter", "Type", "Message", "Source", "Amount (INR)", "StreamLounge fee (INR)", "Your share (INR)", "Status"];
    const lines = filtered.map((r) => [
      new Date(r.at).toISOString(), r.id, r.name, r.type === "external" ? "External link" : INTERACTION_LABEL[r.type] ?? r.type,
      r.message ?? "", PAYMENT_SOURCE_LABEL[r.source], (r.amount / 100).toFixed(2), (r.fee / 100).toFixed(2), (r.share / 100).toFixed(2), STATUS_LABEL[r.status] ?? r.status,
    ].map(csvCell).join(","));
    const blob = new Blob([[header.map(csvCell).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `streamlounge-superchats-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <StudioShell
      active="Superchats"
      session={session}
      authError={authError}
      onRetry={retryAuth}
      eyebrow="Studio · Superchats"
      title="Superchats"
      subtitle="Every paid interaction, with its message, channel, fee and delivery status."
      aside={
        <div className="flex gap-2">
          <button type="button" className="sl-btn" onClick={reload}><Icon name="refresh" size={14} /> Refresh</button>
          <button type="button" className="sl-btn" onClick={exportCsv} disabled={!filtered.length}><Icon name="download" size={14} /> Export CSV</button>
        </div>
      }
    >
      <div className="sl-card">
        <div className="flex flex-wrap items-center gap-3 border-b p-4" style={{ borderColor: "var(--sl-line)" }}>
          <label className="relative min-w-[220px] flex-1">
            <span className="sr-only">Search</span>
            <span className="sl-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"><Icon name="search" size={15} /></span>
            <input className="sl-input !pl-9" placeholder="Search supporter, message or payment ID" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="sl-seg" role="group" aria-label="Date range">
            {RANGES.map((r) => (
              <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>
            ))}
          </div>
          <select className="sl-select !w-auto" aria-label="Payment channel" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
            <option value="all">All channels</option>
            <option value="STREAMLOUNGE_QR">StreamLounge QR</option>
            <option value="EXTERNAL_RAZORPAY_LINK">Your Razorpay link</option>
          </select>
          <select className="sl-select !w-auto" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-2 border-b px-5 py-3 text-[13px]" style={{ borderColor: "var(--sl-line)" }}>
          <span><span className="sl-muted">Results</span> <span className="sl-num ml-1">{filtered.length}</span></span>
          <span><span className="sl-muted">Paid by viewers</span> <span className="sl-num ml-1">{rupees(totals.amount)}</span></span>
          <span><span className="sl-muted">StreamLounge fees</span> <span className="sl-num ml-1">{rupees(totals.fee)}</span></span>
          <span><span className="sl-muted">Your share</span> <span className="sl-num ml-1 font-medium">{rupees(totals.share)}</span></span>
        </div>

        {!data && !error && <div className="space-y-2 p-5">{[0, 1, 2, 3].map((i) => <div key={i} className="sl-skel h-10" />)}</div>}
        {error && !data && (
          <div className="flex items-center justify-between gap-4 p-5"><p className="sl-body">{error}</p><button className="sl-btn" type="button" onClick={reload}>Try again</button></div>
        )}
        {data && filtered.length === 0 && <p className="sl-muted p-10 text-center text-[13.5px]">No superchats match these filters.</p>}

        {filtered.length > 0 && (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="sl-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Supporter</th><th>Message</th><th>Channel</th><th className="r">Amount</th><th className="r">Fee</th><th className="r">Your share</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} onClick={() => setOpen(open === r.id ? null : r.id)} style={{ cursor: "pointer" }}>
                      <td className="whitespace-nowrap sl-muted">{when(r.at)}</td>
                      <td>
                        <span className="font-medium" style={{ color: "var(--sl-fg)" }}>{r.name}</span>
                        <span className="sl-faint block text-[12px]">{r.type === "external" ? "External link" : INTERACTION_LABEL[r.type] ?? r.type}</span>
                      </td>
                      <td className="max-w-[320px]">
                        <span className={open === r.id ? "whitespace-pre-wrap break-words" : "line-clamp-1"}>{r.message || <span className="sl-faint">—</span>}</span>
                        {open === r.id && <span className="sl-faint mt-1 block font-mono text-[11px]">{r.id}</span>}
                      </td>
                      <td><span className={`sl-badge ${r.source === "EXTERNAL_RAZORPAY_LINK" ? "" : "sl-badge-accent"}`}>{r.source === "STREAMLOUNGE_QR" ? `QR · ${formatBps(r.bps)}` : "Your link · 0%"}</span></td>
                      <td className="r sl-num">{rupees(r.amount)}</td>
                      <td className="r sl-num sl-muted">{rupees(r.fee)}</td>
                      <td className="r sl-num" style={{ color: "var(--sl-fg)" }}>{rupees(r.share)}</td>
                      <td>
                        <StatusBadge status={r.status} />
                        {r.delivery && <span className="sl-faint block text-[11.5px]">{DELIVERY[r.delivery] ?? r.delivery}</span>}
                        {r.refunded > 0 && r.status !== "refunded" && <span className="sl-faint block text-[11.5px]">{rupees(r.refunded)} refunded</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden">
              {filtered.map((r) => (
                <li key={r.id} className="border-b p-4 last:border-0" style={{ borderColor: "var(--sl-line)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{r.name}</p>
                      <p className="sl-faint text-[12px]">{when(r.at)} · {r.source === "STREAMLOUNGE_QR" ? `QR · ${formatBps(r.bps)}` : "Your link · 0%"}</p>
                    </div>
                    <div className="text-right">
                      <p className="sl-num">{rupees(r.amount)}</p>
                      <p className="sl-faint text-[12px]">you {rupees(r.share)}</p>
                    </div>
                  </div>
                  {r.message && <p className="sl-body mt-2 break-words">{r.message}</p>}
                  <div className="mt-2"><StatusBadge status={r.status} /></div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <p className="sl-faint mt-4 text-[12px]">
        Shows the last 120 days. StreamLounge QR payments carry the platform fee in force when they were paid (8% from the current fee policy); payments through your own Razorpay link carry none and appear only if you connect reporting in Finance.
      </p>
    </StudioShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === "captured" ? "sl-badge-success" : status === "disputed" || status === "dispute_lost" ? "sl-badge-danger" : "";
  return <span className={`sl-badge ${tone}`}>{STATUS_LABEL[status] ?? status}</span>;
}
