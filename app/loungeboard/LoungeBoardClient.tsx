"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { formatRupees } from "@/app/component/studio/StudioShell";
import { STUDIO_CSS } from "@/app/component/studio/theme";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Scope = "global" | "continent" | "country" | "state" | "district" | "city";
type Period = "today" | "week" | "month" | "all";
type Row = {
  rank: number; username: string; creator_name: string; profile_image_url: string | null;
  total_paise: number; superchats: number; location: string | null;
};

const SCOPES: { id: Scope; label: string }[] = [
  { id: "global", label: "Global" }, { id: "continent", label: "Continent" }, { id: "country", label: "Country" },
  { id: "state", label: "State" }, { id: "district", label: "District" }, { id: "city", label: "City" },
];
const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Today" }, { id: "week", label: "This week" }, { id: "month", label: "This month" }, { id: "all", label: "All time" },
];
const CONTINENTS: Record<string, string> = { AF: "Africa", AN: "Antarctica", AS: "Asia", EU: "Europe", NA: "North America", OC: "Oceania", SA: "South America" };

function placeName(scope: Scope, value: string | null) {
  if (!value) return "";
  if (scope === "continent") return CONTINENTS[value] ?? value;
  if (scope === "country") {
    try {
      return new Intl.DisplayNames(["en"], { type: "region" }).of(value) ?? value;
    } catch {
      return value;
    }
  }
  return value;
}

export default function LoungeBoardClient() {
  const [scope, setScope] = useState<Scope>("global");
  const [period, setPeriod] = useState<Period>("week");
  const [place, setPlace] = useState<string>("");
  const [places, setPlaces] = useState<{ value: string; creators: number }[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (scope === "global") return;
    let alive = true;
    getSupabaseBrowserClient()
      .rpc("sl_loungeboard_locations", { p_scope: scope })
      .then(({ data }) => {
        if (!alive) return;
        const list = (data ?? []) as { value: string; creators: number }[];
        setPlaces(list);
        setPlace((current) => (list.some((p) => p.value === current) ? current : list[0]?.value ?? ""));
      });
    return () => {
      alive = false;
    };
  }, [scope]);

  useEffect(() => {
    let alive = true;
    getSupabaseBrowserClient()
      .rpc("sl_loungeboard", { p_scope: scope, p_value: scope === "global" ? null : place || null, p_period: period, p_limit: 50 })
      .then(({ data }) => {
        if (alive) setRows((data ?? []) as Row[]);
      });
    return () => {
      alive = false;
    };
  }, [scope, place, period]);

  const podium = rows?.slice(0, 3) ?? [];
  const rest = rows?.slice(3) ?? [];

  return (
    <div className="st-root min-h-screen">
      <style>{STUDIO_CSS}</style>
      <div className="st-ambient" aria-hidden="true">
        <span className="st-orb st-orb-1" />
        <span className="st-orb st-orb-2" />
        <span className="st-orb st-orb-3" />
        <span className="st-grid" />
      </div>
      <main className="relative mx-auto max-w-[1100px] px-5 py-8 md:px-8">
        <nav className="flex items-center justify-between">
          <Link href="/" className="text-xl font-semibold tracking-tight">
            <span className="text-[#6CCEB0]">ϟ</span> Stream<span className="text-[#C7B8F0]">Lounge</span>
          </Link>
          <Link href="/me" className="st-btn-ghost">My LoungePoints</Link>
        </nav>

        <header className="st-rise mt-12 text-center">
          <p className="st-eyebrow justify-center"><span className="st-dot" />LoungeBoard</p>
          <h1 className="st-h1 mt-5">The creators fans <span className="st-grad">show up for.</span></h1>
          <p className="st-muted mx-auto mt-3 max-w-xl text-base leading-7">
            Ranked by verified superchats, after refunds. Disputed and refunded payments don&apos;t count. Creators choose whether to appear.
          </p>
        </header>

        <div className="mt-10 flex flex-col items-center gap-3">
          <div className="flex flex-wrap justify-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1" role="tablist" aria-label="Area">
            {SCOPES.map((s) => (
              <button key={s.id} type="button" role="tab" aria-selected={scope === s.id} onClick={() => setScope(s.id)}
                className={`rounded-full px-4 py-2 text-sm ${scope === s.id ? "bg-[#5EEAD4]/15 text-[#5EEAD4]" : "text-white/60 hover:text-white"}`}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {scope !== "global" && (
              <select aria-label={`Choose ${scope}`} value={place} onChange={(e) => setPlace(e.target.value)} className="st-field">
                {places.length === 0 && <option value="">No creators listed yet</option>}
                {places.map((p) => <option key={p.value} value={p.value}>{placeName(scope, p.value)} ({p.creators})</option>)}
              </select>
            )}
            <div className="flex gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1" role="tablist" aria-label="Time period">
              {PERIODS.map((p) => (
                <button key={p.id} type="button" role="tab" aria-selected={period === p.id} onClick={() => setPeriod(p.id)}
                  className={`rounded-full px-3 py-1.5 text-xs ${period === p.id ? "bg-[#A78BFA]/20 text-[#C7B8F0]" : "text-white/60 hover:text-white"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!rows ? (
          <div className="st-glass st-skel mt-10 h-72" aria-busy="true" />
        ) : rows.length === 0 ? (
          <div className="st-glass mt-10 p-10 text-center">
            <p className="text-white">No ranked creators here yet.</p>
            <p className="st-muted mt-2 text-sm">Creators join from Manage Interactions → LoungeBoard. Check another period or area.</p>
          </div>
        ) : (
          <>
            <ol className="mt-12 grid items-end gap-4 sm:grid-cols-3" aria-label="Top three">
              {[podium[1], podium[0], podium[2]].map((r, i) =>
                r ? (
                  <li key={r.username} className={`st-glass st-rise p-6 text-center ${i === 1 ? "sm:pb-10" : ""}`}>
                    <span className={`text-sm font-semibold ${r.rank === 1 ? "text-[#FBBF24]" : r.rank === 2 ? "text-[#CBD5E1]" : "text-[#F59E0B]"}`}>#{r.rank}</span>
                    <div className="mx-auto mt-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/5 text-xl text-white">
                      {r.profile_image_url
                        ? <img src={r.profile_image_url} alt="" className="h-full w-full object-cover" />
                        : r.creator_name.slice(0, 1).toUpperCase()}
                    </div>
                    <Link href={`/${r.username}`} className="mt-3 block font-medium text-white hover:text-[#5EEAD4]">{r.creator_name}</Link>
                    <p className="st-muted text-xs">@{r.username}{r.location ? ` · ${placeName(scope, r.location)}` : ""}</p>
                    <p className="mt-3 text-2xl font-medium tracking-tight text-white">{formatRupees(r.total_paise)}</p>
                    <p className="st-muted text-xs">{r.superchats} superchats</p>
                  </li>
                ) : <li key={`empty-${i}`} className="hidden sm:block" />,
              )}
            </ol>
            {rest.length > 0 && (
              <ol className="st-glass mt-6 divide-y divide-white/5" start={4}>
                {rest.map((r) => (
                  <li key={r.username} className="flex items-center gap-4 px-5 py-3">
                    <span className="w-8 text-sm text-white/50">#{r.rank}</span>
                    <Link href={`/${r.username}`} className="min-w-0 flex-1 truncate text-white hover:text-[#5EEAD4]">
                      {r.creator_name} <span className="st-muted text-xs">@{r.username}</span>
                    </Link>
                    <span className="st-muted hidden text-xs sm:inline">{r.superchats} superchats</span>
                    <span className="font-medium text-white">{formatRupees(r.total_paise)}</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </main>
    </div>
  );
}
