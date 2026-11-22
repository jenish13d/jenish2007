"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";

import { StudioShell, apiJson, useStudioSession } from "@/app/component/studio/StudioShell";
import { BarChart } from "@/app/component/ui/BarChart";
import { Icon } from "@/app/component/ui/icons";
import {
  DEFAULT_LAYOUT,
  WIDGET_META,
  moveWidget,
  normalizeLayout,
  sameLayout,
  toggleWidget,
  type DashboardLayout,
  type WidgetId,
} from "@/lib/dashboard/layout";
import { formatBps } from "@/lib/payments/fees";

import {
  INTERACTION_LABEL,
  dailySeries,
  hoursLabel,
  netShare,
  periodTotals,
  rupees,
  useOverview,
  when,
  type Overview,
} from "./_shared/data";

const LOCAL_KEY = "sl-dashboard-layout";

export default function DashboardClient() {
  const { session, authError, retryAuth } = useStudioSession("/dashboard");
  const { data, error, reload } = useOverview(Boolean(session));
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);
  const [saved, setSaved] = useState<DashboardLayout>(DEFAULT_LAYOUT);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [dragging, setDragging] = useState<WidgetId | null>(null);
  const [over, setOver] = useState<WidgetId | null>(null);
  const hydrated = useRef(false);

  const notify = useCallback((text: string, tone: "success" | "error") => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  // Account layout wins; local storage covers deployments before migration 0013.
  useEffect(() => {
    if (!data || hydrated.current) return;
    hydrated.current = true;
    let stored: unknown = data.layout;
    if (!stored || (typeof stored === "object" && Object.keys(stored as object).length === 0)) {
      try {
        stored = JSON.parse(window.localStorage.getItem(LOCAL_KEY) || "null");
      } catch {
        stored = null;
      }
    }
    const l = normalizeLayout(stored);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from loaded data
    setLayout(l);
    setSaved(l);
  }, [data]);

  async function persist(next: DashboardLayout) {
    try {
      window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
    const res = await apiJson("/api/creator/preferences", {
      method: "PATCH",
      body: JSON.stringify({ dashboard_layout: next }),
    });
    setSaved(next);
    if (res.ok) notify("Layout saved.", "success");
    else notify("Layout saved on this device. It will sync once account settings are available.", "success");
  }

  const visible = layout.order.filter((w) => !layout.hidden.includes(w));
  const hiddenList = layout.order.filter((w) => layout.hidden.includes(w));
  const dirty = !sameLayout(layout, saved);

  const aside = (
    <div className="flex flex-wrap items-center gap-2">
      {editing ? (
        <>
          <button type="button" className="sl-btn sl-btn-quiet" onClick={() => setLayout(DEFAULT_LAYOUT)}>Reset to default</button>
          <button type="button" className="sl-btn" onClick={() => { setLayout(saved); setEditing(false); }}>Cancel</button>
          <button
            type="button"
            className="sl-btn sl-btn-primary"
            onClick={async () => {
              if (dirty) await persist(layout);
              setEditing(false);
            }}
          >
            Done
          </button>
        </>
      ) : (
        <>
          <button type="button" className="sl-btn" onClick={reload}><Icon name="refresh" size={14} /> Refresh</button>
          <button type="button" className="sl-btn" onClick={() => setEditing(true)}><Icon name="sliders" size={14} /> Customize</button>
        </>
      )}
    </div>
  );

  return (
    <StudioShell
      active="Overview"
      session={session}
      authError={authError}
      onRetry={retryAuth}
      eyebrow="Studio · Overview"
      title={session ? `Welcome back, ${session.creatorName.split(" ")[0]}` : "Overview"}
      subtitle="Your earnings, supporters and stream at a glance."
      aside={aside}
      toast={toast}
    >
      {error && !data && (
        <div className="sl-card flex flex-wrap items-center justify-between gap-4 p-5">
          <p className="sl-body">{error}</p>
          <button type="button" className="sl-btn" onClick={reload}>Try again</button>
        </div>
      )}

      {editing && (
        <div className="sl-well mb-5 flex flex-wrap items-center gap-3 p-4 text-[13px]">
          <span className="sl-muted">Drag widgets, or use the arrows, to reorder. Hidden:</span>
          {hiddenList.length === 0 && <span className="sl-faint">none</span>}
          {hiddenList.map((w) => (
            <button key={w} type="button" className="sl-btn sl-btn-sm" onClick={() => setLayout((l) => toggleWidget(l, w))}>
              <Icon name="plus" size={13} /> {WIDGET_META[w].title}
            </button>
          ))}
        </div>
      )}

      <div className="sl-grid">
        {visible.map((id, index) => (
          <div
            key={id}
            className={`sl-widget sl-in sl-span-${WIDGET_META[id].span}`}
            style={{ ["--d" as string]: index * 40 }}
            data-editing={editing}
            data-dragging={dragging === id}
            data-over={over === id && dragging !== id}
            draggable={editing}
            onDragStart={(e) => { setDragging(id); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => { if (editing && dragging) { e.preventDefault(); setOver(id); } }}
            onDragLeave={() => setOver((o) => (o === id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragging && dragging !== id) setLayout((l) => moveWidget(l, dragging, l.order.indexOf(id)));
              setDragging(null);
              setOver(null);
            }}
            onDragEnd={() => { setDragging(null); setOver(null); }}
          >
            <section className="sl-card h-full">
              <header className="sl-card-head">
                <h2 className="sl-h3">{WIDGET_META[id].title}</h2>
                {editing ? (
                  <div className="flex items-center gap-0.5">
                    <span className="sl-icon-btn" aria-hidden="true" style={{ cursor: "grab" }}><Icon name="grip" /></span>
                    <button type="button" className="sl-icon-btn" aria-label={`Move ${WIDGET_META[id].title} up`} disabled={index === 0}
                      onClick={() => setLayout((l) => moveWidget(l, id, l.order.indexOf(visible[index - 1])))}>
                      <Icon name="arrowUp" />
                    </button>
                    <button type="button" className="sl-icon-btn" aria-label={`Move ${WIDGET_META[id].title} down`} disabled={index === visible.length - 1}
                      onClick={() => setLayout((l) => moveWidget(l, id, l.order.indexOf(visible[index + 1])))}>
                      <Icon name="arrowDown" />
                    </button>
                    <button type="button" className="sl-icon-btn" aria-label={`Hide ${WIDGET_META[id].title}`} onClick={() => setLayout((l) => toggleWidget(l, id))}>
                      <Icon name="eyeOff" />
                    </button>
                  </div>
                ) : (
                  <WidgetLink id={id} />
                )}
              </header>
              <div className="sl-card-body">{data ? <Widget id={id} data={data} /> : <Skeleton />}</div>
            </section>
          </div>
        ))}
      </div>
      {visible.length === 0 && (
        <div className="sl-card p-10 text-center">
          <p className="sl-body sl-muted">All widgets are hidden.</p>
          <button type="button" className="sl-btn mt-4" onClick={() => { setLayout(DEFAULT_LAYOUT); setEditing(true); }}>Restore default layout</button>
        </div>
      )}
    </StudioShell>
  );
}

function WidgetLink({ id }: { id: WidgetId }) {
  const map: Partial<Record<WidgetId, [string, string]>> = {
    recent: ["/dashboard/superchats", "All superchats"],
    balance: ["/dashboard/payouts", "Payouts"],
    sources: ["/dashboard/finance", "Finance"],
    trend: ["/dashboard/finance", "Details"],
    setup: ["/dashboard/stream-kit", "Stream setup"],
  };
  const link = map[id];
  if (!link) return null;
  return (
    <Link href={link[0]} className="sl-muted inline-flex items-center gap-1 text-[12.5px] hover:text-[color:var(--sl-fg)]">
      {link[1]} <Icon name="arrowRight" size={12} />
    </Link>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <div className="sl-skel h-6 w-1/3" />
      <div className="sl-skel h-16 w-full" />
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="sl-muted py-6 text-center text-[13px]">{children}</p>;
}

function Widget({ id, data }: { id: WidgetId; data: Overview }) {
  const totals = useMemo(() => periodTotals(data.payments), [data.payments]);
  const series = useMemo(
    () => dailySeries(data.payments, 30).map((b) => ({ label: b.day.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), value: b.value })),
    [data.payments],
  );
  const b = data.balance;
  const s = data.summary;
  const feeBps = data.sources?.qr_fee_bps ?? data.platform?.platform_fee_bps ?? 800;

  switch (id) {
    case "earnings":
      return (
        <div className="grid gap-px overflow-hidden rounded-[10px] sm:grid-cols-2 lg:grid-cols-4" style={{ background: "var(--sl-line)" }}>
          <Metric label="Today" value={rupees(totals.today)} hint={`${totals.todayCount} superchat${totals.todayCount === 1 ? "" : "s"}`} />
          <Metric label="Last 7 days" value={rupees(totals.week)} />
          <Metric label="This month" value={rupees(totals.month)} />
          <Metric label="Total superchats" value={(s?.superchats ?? 0).toLocaleString("en-IN")} hint={`${(s?.supporters ?? 0).toLocaleString("en-IN")} supporters`} />
        </div>
      );
    case "balance":
      return (
        <div className="space-y-4">
          <div>
            <p className="sl-muted text-[12.5px]">Available to withdraw</p>
            <p className="sl-stat-value !mt-1">{rupees(b.available_paise)}</p>
          </div>
          <dl className="space-y-2 border-t pt-4 text-[13px]" style={{ borderColor: "var(--sl-line)" }}>
            <Line k="Pending (settlement hold)" v={rupees(b.pending_paise)} />
            <Line k="Reserved for withdrawals" v={rupees(b.reserved_paise)} />
            <Line k="Paid out" v={rupees(b.paid_out_paise)} />
          </dl>
          {s && !s.payouts_enabled && <p className="sl-faint text-[12px]">Withdrawals open once payouts are enabled for your account.</p>}
        </div>
      );
    case "trend":
      return <BarChart data={series} format={(v) => rupees(v)} label="Your share per day, last 30 days" height={150} />;
    case "recent":
      return data.payments.length === 0 ? (
        <Empty>No superchats yet. Share your page or put the QR overlay on stream.</Empty>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--sl-line)" }}>
          {data.payments.slice(0, 6).map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-4 py-2.5" style={{ borderColor: "var(--sl-line)" }}>
              <div className="min-w-0">
                <p className="truncate text-[13.5px]"><span className="font-medium">{p.display_name}</span> <span className="sl-faint">· {INTERACTION_LABEL[p.interaction_type] ?? p.interaction_type}</span></p>
                <p className="sl-muted truncate text-[12.5px]">{p.message || when(p.captured_at)}</p>
              </div>
              <span className="sl-num shrink-0 text-[13.5px]">{rupees(p.amount_paise)}</span>
            </li>
          ))}
        </ul>
      );
    case "supporters":
      return !s || s.top_supporters.length === 0 ? (
        <Empty>Your top supporters will appear here.</Empty>
      ) : (
        <ol className="space-y-2.5">
          {s.top_supporters.slice(0, 6).map((t, i) => (
            <li key={t.display_name + i} className="flex items-center gap-3 text-[13.5px]">
              <span className="sl-mono w-5 text-[11px] sl-faint">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1 truncate">{t.display_name}</span>
              <span className="sl-faint text-[12px]">{t.superchats}×</span>
              <span className="sl-num w-24 text-right">{rupees(t.total_paise)}</span>
            </li>
          ))}
        </ol>
      );
    case "sources": {
      const qr = data.sources?.qr;
      const ext = data.sources?.external;
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sl-well p-4">
            <p className="sl-kicker !text-[10px]">StreamLounge QR · {formatBps(feeBps)}</p>
            <p className="sl-num mt-3 text-[20px] font-medium">{rupees(qr?.creator_share_paise ?? data.payments.reduce((a, p) => a + netShare(p), 0))}</p>
            <p className="sl-faint text-[12px]">your share{qr ? ` · fee ${rupees(qr.platform_fee_paise)}` : ""}</p>
          </div>
          <div className="sl-well p-4">
            <p className="sl-kicker !text-[10px]">Your Razorpay link · 0%</p>
            <p className="sl-num mt-3 text-[20px] font-medium">{ext ? rupees(ext.gross_paise) : "—"}</p>
            <p className="sl-faint text-[12px]">{data.external_payment_url ? (ext && ext.count ? "verified via your webhook" : "link added · reporting optional") : "not set up"}</p>
          </div>
        </div>
      );
    }
    case "streams":
      return (
        <div className="grid grid-cols-3 gap-3">
          <Mini label="Status" value={s?.live_now ? "Live" : "Offline"} accent={s?.live_now} />
          <Mini label="Streams" value={(s?.streams ?? 0).toLocaleString("en-IN")} />
          <Mini label="Time live" value={hoursLabel(s?.stream_seconds ?? 0)} />
        </div>
      );
    case "setup": {
      const steps: [boolean, string, string][] = [
        [Boolean(data.profile?.username), "Choose a username", "/dashboard/customize"],
        [Boolean(data.profile?.public_page_enabled), "Publish your page", "/dashboard/customize"],
        [data.interactions_enabled > 0, "Enable at least one interaction", "/dashboard/interactions"],
        [false, "Add the overlay to OBS or Streamlabs", "/dashboard/stream-kit"],
        [Boolean(data.external_payment_url), "Optional: add your own Razorpay link", "/dashboard/finance"],
      ];
      return (
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map(([done, label, href], i) => (
            <li key={label}>
              <Link href={href} className="sl-well flex h-full items-start gap-3 p-3.5 text-[13px] transition hover:border-[color:var(--sl-line-3)]">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px]"
                  style={done ? { background: "var(--sl-accent)", borderColor: "var(--sl-accent)", color: "var(--sl-accent-ink)" } : { borderColor: "var(--sl-line-3)", color: "var(--sl-muted)" }}>
                  {done ? <Icon name="check" size={12} /> : i + 1}
                </span>
                <span className={done ? "sl-muted line-through decoration-[color:var(--sl-line-3)]" : ""}>{label}</span>
              </Link>
            </li>
          ))}
        </ol>
      );
    }
  }
  return null;
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="p-4" style={{ background: "var(--sl-surface)" }}>
      <p className="sl-muted text-[12.5px]">{label}</p>
      <p className="sl-stat-value !mt-2 !text-[24px]">{value}</p>
      {hint && <p className="sl-stat-hint">{hint}</p>}
    </div>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="sl-well p-3.5">
      <p className="sl-faint text-[11.5px]">{label}</p>
      <p className="mt-1.5 flex items-center gap-1.5 text-[16px] font-medium" style={accent ? { color: "var(--sl-success)" } : undefined}>
        {accent && <span className="sl-dot" />}
        {value}
      </p>
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="sl-muted">{k}</dt>
      <dd className="sl-num">{v}</dd>
    </div>
  );
}
