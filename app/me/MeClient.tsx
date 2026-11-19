"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { formatRupees } from "@/app/component/studio/StudioShell";
import { STUDIO_CSS } from "@/app/component/studio/theme";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Points = { balance: number; points_per_redemption: number; redemption_value_paise: number; enabled: boolean };
type Entry = { id: number; kind: string; points: number; note: string | null; created_at: string };
type Paid = { id: string; display_name: string; amount_paise: number; status: string; captured_at: string; creator_id: string };

const KIND_LABEL: Record<string, string> = {
  earn: "Earned", reverse: "Refund reversal", redeem: "Redeemed", redeem_cancel: "Redemption returned", bonus: "Bonus", adjust: "Adjustment",
};

export default function MeClient() {
  const router = useRouter();
  const [points, setPoints] = useState<Points | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [payments, setPayments] = useState<Paid[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchAll = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;
    const [p, e, pay] = await Promise.all([
      supabase.rpc("sl_my_points"),
      supabase.from("loungepoints_ledger").select("id, kind, points, note, created_at").order("created_at", { ascending: false }).limit(50),
      supabase.from("payments").select("id, display_name, amount_paise, status, captured_at, creator_id")
        .eq("viewer_user_id", auth.user.id).order("captured_at", { ascending: false }).limit(50),
    ]);
    const row = Array.isArray(p.data) ? (p.data[0] as Points | undefined) : undefined;
    return { points: row ?? null, entries: (e.data ?? []) as Entry[], payments: (pay.data ?? []) as Paid[] };
  }, []);

  useEffect(() => {
    let alive = true;
    fetchAll().then((result) => {
      if (!alive) return;
      if (!result) {
        router.replace("/login?next=/me");
        return;
      }
      setPoints(result.points);
      setEntries(result.entries);
      setPayments(result.payments);
    });
    return () => {
      alive = false;
    };
  }, [fetchAll, router]);

  async function redeem() {
    setBusy(true);
    const { error } = await getSupabaseBrowserClient().rpc("sl_redeem_points", { p_units: 1 });
    setBusy(false);
    if (error) {
      setMessage(error.message.includes("not enough") ? "You don't have enough points yet." : "Couldn't redeem right now.");
      return;
    }
    setMessage("Redemption requested. It will be applied once reward checkout opens.");
    const result = await fetchAll();
    if (result) {
      setPoints(result.points);
      setEntries(result.entries);
    }
  }

  const per = points?.points_per_redemption ?? 1000;
  const balance = points?.balance ?? 0;
  const progress = Math.max(0, Math.min(100, (balance / per) * 100));

  return (
    <div className="st-root min-h-screen">
      <style>{STUDIO_CSS}</style>
      <div className="st-ambient" aria-hidden="true"><span className="st-orb st-orb-1" /><span className="st-orb st-orb-2" /><span className="st-grid" /></div>
      <main className="relative mx-auto max-w-[900px] px-5 py-8 md:px-8">
        <nav className="flex items-center justify-between">
          <Link href="/" className="text-xl font-semibold tracking-tight"><span className="text-[#6CCEB0]">ϟ</span> Stream<span className="text-[#C7B8F0]">Lounge</span></Link>
          <Link href="/loungeboard" className="st-btn-ghost">LoungeBoard</Link>
        </nav>
        <header className="st-rise mt-10">
          <p className="st-eyebrow"><span className="st-dot" />LoungePoints</p>
          <h1 className="st-h1 mt-5">Your <span className="st-grad">rewards.</span></h1>
        </header>

        {!points ? <div className="st-glass st-skel mt-8 h-48" aria-busy="true" /> : (
          <>
            <section className="st-glass st-rise mt-8 p-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="st-eyebrow !tracking-[.14em]">Balance</p>
                  <p className="st-stat-value mt-2">{balance.toLocaleString("en-IN")} pts</p>
                </div>
                <button type="button" onClick={redeem} disabled={busy || !points.enabled || balance < per} className="st-btn-mint">
                  Redeem {per.toLocaleString("en-IN")} pts for {formatRupees(points.redemption_value_paise)}
                </button>
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-gradient-to-r from-[#5EEAD4] to-[#A78BFA]" style={{ width: `${progress}%` }} />
              </div>
              <p className="st-muted mt-2 text-sm">
                {balance >= per ? "You can redeem now." : `${(per - balance).toLocaleString("en-IN")} points to your next ${formatRupees(points.redemption_value_paise)} reward.`}
              </p>
              {message && <p className="mt-3 text-sm text-[#5EEAD4]">{message}</p>}
              <details className="mt-4 text-sm text-white/70">
                <summary className="cursor-pointer text-white">How LoungePoints work</summary>
                <ul className="st-muted mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
                  <li>You earn points only on superchats you send while signed in, after the payment is confirmed.</li>
                  <li>{points.points_per_redemption.toLocaleString("en-IN")} points = {formatRupees(points.redemption_value_paise)} reward value. There are no random or chance-based rewards.</li>
                  <li>If a payment is refunded, the points it earned are removed.</li>
                  <li>Rates are set by StreamLounge and may change for future superchats; points you already have keep their value.</li>
                  {!points.enabled && <li>LoungePoints aren&apos;t switched on yet, so new superchats don&apos;t earn points.</li>}
                </ul>
              </details>
            </section>

            <section className="st-glass st-rise mt-6 p-6">
              <h2 className="st-h2 !text-lg">Points history</h2>
              {entries.length === 0 ? <p className="st-muted mt-3 text-sm">No points yet. Send a superchat while signed in to start earning.</p> : (
                <ul className="mt-3 divide-y divide-white/5">
                  {entries.map((e) => (
                    <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-white/80">{KIND_LABEL[e.kind] ?? e.kind} <span className="st-muted text-xs">· {new Date(e.created_at).toLocaleDateString("en-IN")}</span></span>
                      <span className={e.points > 0 ? "text-[#5EEAD4]" : "text-red-300"}>{e.points > 0 ? "+" : ""}{e.points.toLocaleString("en-IN")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="st-glass st-rise mt-6 p-6">
              <h2 className="st-h2 !text-lg">Superchats you sent</h2>
              {payments.length === 0 ? <p className="st-muted mt-3 text-sm">None while signed in yet.</p> : (
                <ul className="mt-3 divide-y divide-white/5">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-white/80">as <strong className="text-white">{p.display_name}</strong> <span className="st-muted text-xs">· {new Date(p.captured_at).toLocaleDateString("en-IN")}</span></span>
                      <span className="text-white">{formatRupees(p.amount_paise)}{p.status !== "captured" && <span className="st-muted ml-2 text-xs">{p.status.replace("_", " ")}</span>}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
