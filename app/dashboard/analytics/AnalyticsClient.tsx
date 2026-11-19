"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { loginUrl, resolveClientAuth } from "@/lib/supabase/client-auth";
import DashboardSidebar from "@/app/component/DashboardSidebar";
import StreamLoader from "@/app/component/StreamLoader";
import {
  Submission,
  isCompleted,
  calculateEarningsTotals,
  money,
  formatDate,
  formatShortDate,
  interactionName,
} from "@/lib/earnings/utils";
import {
  AlertCircle,
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  CreditCard,
  Download,
  Gift,
  Layers,
  MessageSquare,
  Mic,
  RefreshCw,
  RotateCw,
  Sparkles,
  User,
  Users,
  Volume2,
  Wallet,
} from "lucide-react";

type Profile = {
  creator_name: string | null;
  username: string | null;
  profile_image_url: string | null;
  youtube_avatar_url: string | null;
};

type TimeRange = "7d" | "30d" | "90d" | "all";

const TIME_RANGES: { id: TimeRange; label: string }[] = [
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
  { id: "90d", label: "90 Days" },
  { id: "all", label: "All Time" },
];

const INTERACTION_CATEGORIES = [
  {
    type: "text",
    name: "Text Messages",
    icon: MessageSquare,
    color: "text-[#5B8BFF]",
    bg: "bg-[#5B8BFF]/15",
    barColor: "bg-[#5B8BFF]",
  },
  {
    type: "audio",
    name: "Voice Messages",
    icon: Mic,
    color: "text-[#9B7BFF]",
    bg: "bg-[#7C3AED]/20",
    barColor: "bg-[#7C3AED]",
  },
  {
    type: "soundboard",
    name: "Soundboard",
    icon: Volume2,
    color: "text-[#A78BFA]",
    bg: "bg-[#A78BFA]/15",
    barColor: "bg-[#A78BFA]",
  },
  {
    type: "stickers",
    name: "AI Stickers",
    icon: Sparkles,
    color: "text-[#38BDF8]",
    bg: "bg-[#38BDF8]/15",
    barColor: "bg-[#38BDF8]",
  },
  {
    type: "spin_wheel",
    name: "Spin Wheel",
    icon: RotateCw,
    color: "text-[#F43F5E]",
    bg: "bg-[#F43F5E]/15",
    barColor: "bg-[#F43F5E]",
  },
  {
    type: "tasks",
    name: "Tasks & Challenges",
    icon: Gift,
    color: "text-[#5BE0CF]",
    bg: "bg-[#5BE0CF]/15",
    barColor: "bg-[#5BE0CF]",
  },
];

function getInteractionIcon(type: string) {
  switch (type) {
    case "audio":
      return <Mic size={14} />;
    case "soundboard":
      return <Volume2 size={14} />;
    case "stickers":
      return <Sparkles size={14} />;
    case "spin_wheel":
      return <RotateCw size={14} />;
    case "tasks":
      return <Gift size={14} />;
    case "text":
    default:
      return <MessageSquare size={14} />;
  }
}

type TrendBucket = {
  key: string;
  label: string;
  fullDateLabel: string;
  revenue: number;
  count: number;
};

/* =========================================================
   THEME (matches the creator dashboard)
========================================================= */

const THEME_CSS = `
@property --an-angle { syntax: "<angle>"; initial-value: 0deg; inherits: false; }

.an-root {
  position: relative; isolation: isolate; min-height: 100vh; color: #F4F7FB;
  font-family: var(--font-geist-sans), Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  letter-spacing: -0.011em; -webkit-font-smoothing: antialiased;
  background:
    radial-gradient(ellipse 60% 55% at 6% 52%, rgba(122,104,200,.5), transparent 66%),
    radial-gradient(ellipse 48% 40% at 62% 24%, rgba(49,63,120,.4), transparent 70%),
    linear-gradient(115deg, #1d2350 0%, #142848 46%, #0A2137 100%);
  background-attachment: fixed;
}
.an-main { position: relative; z-index: 1; min-width: 0; }

/* ---------- ambient background ---------- */
.an-ambient { position: fixed; inset: 0; overflow: hidden; pointer-events: none; z-index: 0; contain: paint; }
.an-orb { position: absolute; border-radius: 50%; filter: blur(80px); will-change: transform; }
.an-orb-1 { width: 34rem; height: 34rem; top: 8rem; left: -14rem; background: #8B79D6; opacity: .3; animation: an-drift-a 30s ease-in-out infinite alternate; }
.an-orb-2 { width: 28rem; height: 28rem; bottom: -8rem; right: -9rem; background: #162A50; opacity: .6; animation: an-drift-b 34s ease-in-out infinite alternate; }
.an-orb-3 { width: 18rem; height: 18rem; top: 22%; right: 18%; background: #5BE0CF; opacity: .09; animation: an-drift-b 28s ease-in-out infinite alternate-reverse; }
.an-grid { position: absolute; inset: 0; opacity: .05; background-image: linear-gradient(rgba(199,210,254,.2) 1px, transparent 1px), linear-gradient(90deg, rgba(199,210,254,.2) 1px, transparent 1px); background-size: 62px 62px; mask-image: linear-gradient(to bottom, black, transparent 80%); animation: an-grid 14s ease-in-out infinite alternate; }
.an-beam { position: absolute; top: -10rem; width: 1px; height: 56rem; transform: rotate(32deg); transform-origin: top; opacity: .08; background: linear-gradient(to bottom, transparent, #5BE0CF, transparent); animation: an-sway 26s ease-in-out infinite alternate; }
.an-beam-1 { left: 30%; }
.an-beam-2 { right: 24%; background: linear-gradient(to bottom, transparent, #A78BFA, transparent); animation-direction: alternate-reverse; }
@keyframes an-drift-a { from { transform: translate3d(0,0,0) scale(1); } to { transform: translate3d(90px,70px,0) scale(1.12); } }
@keyframes an-drift-b { from { transform: translate3d(0,0,0) scale(1); } to { transform: translate3d(-80px,-60px,0) scale(1.1); } }
@keyframes an-grid { from { opacity: .06; transform: translateY(0); } to { opacity: .13; transform: translateY(12px); } }
@keyframes an-sway { from { transform: rotate(28deg) translateX(-20px); opacity: .06; } to { transform: rotate(38deg) translateX(30px); opacity: .2; } }

/* ---------- entrance ---------- */
@keyframes an-rise { from { opacity: 0; transform: translate3d(0,26px,0) scale(.985); filter: blur(8px); } to { opacity: 1; transform: none; filter: none; } }
.an-rise { animation: an-rise .95s cubic-bezier(.16,1,.3,1) backwards; animation-delay: calc(var(--d, 0) * 1ms); }

/* ---------- type ---------- */
.an-eyebrow { display: inline-flex; align-items: center; gap: 10px; font-size: 11px; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; color: #9FB0C6; }
.an-dot { width: 7px; height: 7px; border-radius: 999px; background: #5BE0CF; box-shadow: 0 0 14px rgba(91,224,207,.85); animation: an-blip 2s ease-out infinite; }
@keyframes an-blip { 0% { box-shadow: 0 0 0 0 rgba(91,224,207,.6), 0 0 14px rgba(91,224,207,.85); } 80%,100% { box-shadow: 0 0 0 9px rgba(91,224,207,0), 0 0 14px rgba(91,224,207,.85); } }
.an-h1 { font-size: clamp(2.5rem, 5.4vw, 4rem); line-height: 1; letter-spacing: -.05em; font-weight: 500; color: #fff; }
.an-grad { background: linear-gradient(90deg, #cfc6fa 0%, #a995f2 55%, #8e7cea 100%); -webkit-background-clip: text; background-clip: text; color: transparent; background-size: 200% 100%; animation: an-grad-move 9s ease-in-out infinite alternate; }
@keyframes an-grad-move { from { background-position: 0% 50%; } to { background-position: 100% 50%; } }
.an-h2 { font-size: 1.15rem; font-weight: 500; letter-spacing: -.03em; color: #fff; }
.an-muted { color: #9FB0C6; }

/* ---------- surfaces ---------- */
.an-glass { position: relative; background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.1); backdrop-filter: blur(18px); border-radius: 26px; transition: transform .5s cubic-bezier(.2,.8,.2,1), border-color .4s ease, box-shadow .5s ease, background-color .4s ease; }
.an-glass:hover { border-color: rgba(91,224,207,.3); box-shadow: 0 22px 60px rgba(4,10,35,.28), 0 0 34px rgba(122,104,200,.12); }
.an-violet { background: linear-gradient(120deg, rgba(122,104,200,.22), rgba(255,255,255,.04) 55%); }
.an-tile { display: flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 18px; color: #5BE0CF; background: rgba(91,224,207,.1); border: 1px solid rgba(91,224,207,.28); }
.an-chip { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 5px 12px; font-size: 11px; font-weight: 600; letter-spacing: .04em; }
.an-chip-on { color: #5BE0CF; background: rgba(91,224,207,.1); border: 1px solid rgba(91,224,207,.25); }
.an-icon-btn { display: inline-flex; align-items: center; justify-content: center; border-radius: 16px; color: #B8C7D6; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); transition: transform .35s cubic-bezier(.2,.8,.2,1), border-color .3s ease, color .3s ease, background-color .3s ease; }
.an-icon-btn:hover:not(:disabled) { color: #fff; border-color: rgba(91,224,207,.5); background: rgba(255,255,255,.09); transform: translateY(-1px); }

/* ---------- buttons ---------- */
.an-btn-mint, .an-btn-ghost { position: relative; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; gap: 10px; border-radius: 999px; font-weight: 600; transition: transform .4s cubic-bezier(.2,.8,.2,1), box-shadow .4s ease, border-color .3s ease, background-color .3s ease; }
.an-btn-mint { padding: 14px 24px; font-size: 14px; color: #06222b; background: #5BE0CF; box-shadow: 0 12px 40px rgba(91,224,207,.28); }
.an-btn-mint:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 16px 50px rgba(91,224,207,.42); }
.an-btn-mint::after { content: ""; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 32%, rgba(255,255,255,.55) 50%, transparent 68%); transform: translateX(-130%); pointer-events: none; }
.an-btn-mint:hover:not(:disabled)::after { animation: an-sheen .85s ease; }
@keyframes an-sheen { to { transform: translateX(130%); } }
.an-btn-ghost { padding: 11px 18px; font-size: 13px; color: #F4F7FB; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.14); }
.an-btn-ghost:hover:not(:disabled) { border-color: rgba(91,224,207,.55); background: rgba(255,255,255,.09); transform: translateY(-1px); }
.an-btn-ghost:disabled { opacity: .4; cursor: not-allowed; }

/* ---------- segmented range control ---------- */
.an-seg { position: relative; padding: 4px; border-radius: 18px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); }
.an-seg-inner { position: relative; display: grid; grid-template-columns: repeat(4, minmax(76px, 1fr)); }
.an-seg-pill { position: absolute; left: 0; top: 0; width: 25%; height: 100%; border-radius: 14px; background: linear-gradient(120deg, rgba(91,224,207,.2), rgba(122,104,200,.28)); border: 1px solid rgba(91,224,207,.45); box-shadow: 0 0 22px rgba(91,224,207,.2); transition: transform .55s cubic-bezier(.34,1.3,.64,1); }
.an-seg-btn { position: relative; z-index: 1; padding: 10px 8px; font-size: 12px; font-weight: 600; color: #9FB0C6; border-radius: 14px; transition: color .3s ease; }
.an-seg-btn:hover:not(:disabled) { color: #fff; }
.an-seg-btn-active { color: #fff; }

/* ---------- stat cards ---------- */
.an-stat { --accent: #5BE0CF; overflow: hidden; padding: 22px; }
.an-stat:hover { transform: translateY(-4px); border-color: color-mix(in srgb, var(--accent) 55%, transparent); }
.an-stat::before { content: ""; position: absolute; width: 190px; height: 190px; right: -70px; top: -80px; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--accent) 34%, transparent), transparent 68%); animation: an-breathe 6s ease-in-out infinite; pointer-events: none; }
.an-stat::after { content: ""; position: absolute; left: 22px; right: 22px; bottom: 0; height: 2px; border-radius: 2px; background: linear-gradient(90deg, var(--accent), transparent); opacity: .7; transform-origin: left; animation: an-line 1.4s cubic-bezier(.16,1,.3,1) .6s backwards; }
@keyframes an-breathe { 0%,100% { transform: scale(1); opacity: .75; } 50% { transform: scale(1.18); opacity: 1; } }
@keyframes an-line { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.an-stat-icon { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 15px; color: var(--accent); background: color-mix(in srgb, var(--accent) 13%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 32%, transparent); animation: an-float 5.5s ease-in-out infinite; }
@keyframes an-float { 0%,100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-4px) rotate(-3deg); } }
.an-stat-value { font-size: clamp(1.6rem, 2.3vw, 2.1rem); font-weight: 500; letter-spacing: -.05em; color: #fff; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.an-stat-badge { display: inline-flex; border-radius: 999px; padding: 2px 9px; font-size: 10px; font-weight: 600; color: var(--accent); background: color-mix(in srgb, var(--accent) 13%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent); }
.an-tick { display: inline-block; animation: an-tick .55s cubic-bezier(.16,1,.3,1); }
@keyframes an-tick { from { transform: translateY(-40%); opacity: 0; filter: blur(4px); } to { transform: none; opacity: 1; filter: none; } }

/* ---------- trend chart ---------- */
.an-gridline { border-top: 1px dashed rgba(255,255,255,.08); }
.an-col { position: relative; }
.an-bar { transform-origin: bottom; animation: an-grow 1s cubic-bezier(.16,1,.3,1) backwards; animation-delay: calc(var(--i, 0) * 30ms + 300ms); transition: filter .3s ease; }
.an-col:hover .an-bar { filter: brightness(1.25) saturate(1.1); }
.an-bar-rev { background: linear-gradient(to top, #2F6BD6, #5BE0CF); box-shadow: 0 0 16px rgba(91,224,207,.22); }
.an-bar-cnt { background: linear-gradient(to top, #5A47A8, #B9AEF0); box-shadow: 0 0 16px rgba(167,139,250,.22); }
@keyframes an-grow { from { transform: scaleY(0); opacity: 0; } to { transform: scaleY(1); opacity: 1; } }
.an-tip { position: absolute; left: 50%; bottom: calc(100% + 6px); z-index: 5; min-width: 130px; padding: 10px 12px; border-radius: 14px; font-size: 11px; line-height: 1.55; color: #E4E2F2; background: rgba(12,26,48,.96); border: 1px solid rgba(255,255,255,.14); box-shadow: 0 14px 40px rgba(2,8,24,.5); transform: translate(-50%, 8px) scale(.96); opacity: 0; pointer-events: none; transition: opacity .25s ease, transform .35s cubic-bezier(.34,1.56,.64,1); white-space: nowrap; }
.an-tip b { display: block; color: #5BE0CF; font-weight: 600; }
.an-tip em { display: block; color: #B9AEF0; font-style: normal; font-weight: 600; }
.an-col:hover .an-tip { opacity: 1; transform: translate(-50%, 0) scale(1); }

/* ---------- distribution + meters ---------- */
.an-dist { display: flex; height: 12px; overflow: hidden; border-radius: 999px; background: rgba(255,255,255,.08); }
.an-seg-fill { transform-origin: left; animation: an-scalex 1.1s cubic-bezier(.16,1,.3,1) backwards; animation-delay: calc(var(--i, 0) * 90ms + 350ms); transition: filter .3s ease; }
.an-seg-fill:hover { filter: brightness(1.3); }
@keyframes an-scalex { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.an-row { position: relative; overflow: hidden; border-radius: 16px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); animation: an-slide .7s cubic-bezier(.16,1,.3,1) backwards; animation-delay: calc(var(--i, 0) * 70ms + 400ms); transition: transform .35s cubic-bezier(.2,.8,.2,1), border-color .3s ease, background-color .3s ease; }
.an-row:hover { transform: translateX(4px); border-color: rgba(91,224,207,.4); background: rgba(255,255,255,.07); }
.an-meter { height: 3px; margin-top: 10px; border-radius: 3px; background: rgba(255,255,255,.07); overflow: hidden; }
.an-meter span { display: block; height: 100%; border-radius: inherit; transform-origin: left; animation: an-scalex 1.2s cubic-bezier(.16,1,.3,1) backwards; animation-delay: calc(var(--i, 0) * 70ms + 550ms); }
@keyframes an-slide { from { opacity: 0; transform: translate3d(18px,0,0); } to { opacity: 1; transform: none; } }

/* ---------- table ---------- */
.an-table th { padding: 16px 20px; text-align: left; font-size: 11px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: #9FB0C6; background: rgba(255,255,255,.03); white-space: nowrap; }
.an-trow { animation: an-row-in .7s cubic-bezier(.16,1,.3,1) backwards; animation-delay: calc(var(--i, 0) * 55ms + 200ms); transition: background-color .3s ease, box-shadow .3s ease; border-top: 1px solid rgba(255,255,255,.07); }
.an-trow td { padding: 16px 20px; }
.an-trow:hover { background: rgba(255,255,255,.045); box-shadow: inset 3px 0 0 #5BE0CF; }
@keyframes an-row-in { from { opacity: 0; transform: translate3d(-18px,0,0); } to { opacity: 1; transform: none; } }
.an-rank { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 999px; font-size: 12px; font-weight: 700; }
.an-rank-1 { color: #2b1d00; background: linear-gradient(135deg, #FDE68A, #F59E0B); box-shadow: 0 0 20px rgba(245,158,11,.45); animation: an-medal 3.2s ease-in-out infinite; }
.an-rank-2 { color: #0f172a; background: linear-gradient(135deg, #F1F5F9, #94A3B8); box-shadow: 0 0 16px rgba(203,213,225,.35); }
.an-rank-3 { color: #2a1305; background: linear-gradient(135deg, #FDBA74, #C2410C); box-shadow: 0 0 16px rgba(234,88,12,.35); }
@keyframes an-medal { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1) rotate(-4deg); } }
.an-avatar { display: flex; align-items: center; justify-content: center; border-radius: 999px; background: linear-gradient(135deg, #5BE0CF, #4D8AFF 60%, #8e7cea); color: #06222b; font-weight: 700; }
.an-anon { display: flex; align-items: center; justify-content: center; border-radius: 999px; color: #9FB0C6; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); }

/* ---------- empty state ---------- */
.an-empty { border-radius: 22px; border: 1px dashed rgba(255,255,255,.14); background: rgba(255,255,255,.025); }
.an-empty-icon { display: flex; align-items: center; justify-content: center; border-radius: 18px; color: #5BE0CF; background: rgba(91,224,207,.1); border: 1px solid rgba(91,224,207,.28); animation: an-float 5s ease-in-out infinite; }

/* ---------- misc ---------- */
.an-busy { opacity: .55; filter: saturate(.8); pointer-events: none; transition: opacity .4s ease, filter .4s ease; }
.an-content { transition: opacity .4s ease, filter .4s ease; }

/* ---------- error screen wrapper ---------- */
.an-load { display: flex; min-height: 100vh; flex-direction: column; align-items: center; justify-content: center; background: radial-gradient(ellipse 60% 55% at 6% 52%, rgba(122,104,200,.5), transparent 66%), linear-gradient(115deg, #1d2350 0%, #142848 46%, #0A2137 100%); color: #F4F7FB; font-family: var(--font-geist-sans), Inter, ui-sans-serif, system-ui, sans-serif; }

.an-root button:focus-visible { outline: 2px solid rgba(91,224,207,.8); outline-offset: 3px; }

@media (prefers-reduced-motion: reduce) {
  .an-root *, .an-root *::before, .an-root *::after, .an-load * { animation: none !important; transition-duration: .01ms !important; }
}
`;

function d(ms: number): CSSProperties {
  return { ["--d" as string]: ms } as CSSProperties;
}

function idx(i: number): CSSProperties {
  return { ["--i" as string]: i } as CSSProperties;
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function CountUp({
  value,
  format,
}: {
  value: number;
  format: (n: number) => string;
}) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }

    const from = fromRef.current;
    const start = performance.now();
    const duration = 1200;
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      const next = t >= 1 ? value : from + (value - from) * eased;
      fromRef.current = next;
      setDisplay(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <>{format(display)}</>;
}

function StatCard({
  title,
  value,
  format,
  text,
  subtitle,
  icon,
  badge,
  color,
  delay,
}: {
  title: string;
  value?: number;
  format?: (n: number) => string;
  text?: string;
  subtitle: string;
  icon: ReactNode;
  badge?: string;
  color: string;
  delay: number;
}) {
  return (
    <div
      className="an-glass an-stat an-rise"
      style={{ ...d(delay), ["--accent" as string]: color } as CSSProperties}
    >
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="an-eyebrow !tracking-[.14em]">{title}</span>
            {badge && <span className="an-stat-badge">{badge}</span>}
          </div>

          <div className="an-stat-value mt-4">
            {typeof value === "number" && format ? (
              <CountUp value={value} format={format} />
            ) : (
              <span key={text} className="an-tick">
                {text}
              </span>
            )}
          </div>

          <p className="an-muted mt-2 text-xs leading-5">{subtitle}</p>
        </div>

        <div className="an-stat-icon">{icon}</div>
      </div>
    </div>
  );
}

/* =========================================================
   PAGE
========================================================= */

export default function AnalyticsClient() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [avatarError, setAvatarError] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [fetchingSubmissions, setFetchingSubmissions] = useState(false);
  const [submissionsError, setSubmissionsError] = useState("");

  const fetchSubmissionsForRange = useCallback(
    async (range: TimeRange, uid: string): Promise<Submission[]> => {
      let query = supabase
        .from("creator_submissions")
        .select(
          "id, creator_id, interaction_type, sender_name, message, amount, payment_status, status, created_at"
        )
        .eq("creator_id", uid)
        .order("created_at", { ascending: false });

      const now = new Date();

      if (range === "7d") {
        const cutoff = new Date(now.getTime() - 7 * 86400000);
        query = query.gte("created_at", cutoff.toISOString());
      } else if (range === "30d") {
        const cutoff = new Date(now.getTime() - 30 * 86400000);
        query = query.gte("created_at", cutoff.toISOString());
      } else if (range === "90d") {
        const cutoff = new Date(now.getTime() - 90 * 86400000);
        query = query.gte("created_at", cutoff.toISOString());
      }

      const { data, error: queryError } = await query;

      if (queryError) throw queryError;

      return (data || []) as Submission[];
    },
    []
  );

  const loadInitial = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const auth = await resolveClientAuth();

      if (auth.status === "signed_out") {
        router.replace(loginUrl("/dashboard/analytics"));
        return;
      }
      if (auth.status === "error") {
        setError(auth.message);
        return;
      }

      const user = auth.user;

      setEmail(user.email || "");
      setUserId(user.id);

      const [profileRes, subsRes] = await Promise.allSettled([
        supabase
          .from("creator_profiles")
          .select("creator_name, username, profile_image_url, youtube_avatar_url")
          .eq("id", user.id)
          .maybeSingle(),
        fetchSubmissionsForRange(timeRange, user.id),
      ]);

      if (profileRes.status === "fulfilled" && profileRes.value.data) {
        setProfile(profileRes.value.data as Profile);
      }

      if (subsRes.status === "fulfilled") {
        setSubmissions(subsRes.value);
        setSubmissionsError("");
      } else {
        console.error("Submissions load error:", subsRes.reason);
        setSubmissionsError("Unable to load activity data for this time range.");
      }
    } catch (err) {
      console.error("Analytics initialization error:", err);
      setError("Unable to initialize analytics. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [fetchSubmissionsForRange, timeRange, router]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const handleTimeRangeChange = async (newRange: TimeRange) => {
    setTimeRange(newRange);

    if (!userId) return;

    try {
      setFetchingSubmissions(true);
      setSubmissionsError("");

      const data = await fetchSubmissionsForRange(newRange, userId);
      setSubmissions(data);
    } catch (err) {
      console.error("Range data load error:", err);
      setSubmissionsError("Unable to load activity data for this time range.");
    } finally {
      setFetchingSubmissions(false);
    }
  };

  const handleRetrySubmissions = () => {
    if (userId) {
      handleTimeRangeChange(timeRange);
    } else {
      loadInitial();
    }
  };

  const effectiveAvatarUrl =
    profile?.youtube_avatar_url || profile?.profile_image_url || null;

  useEffect(() => {
    setAvatarError(false);
  }, [effectiveAvatarUrl]);

  const completedTransactions = useMemo(
    () => submissions.filter(isCompleted),
    [submissions]
  );

  const totals = useMemo(() => calculateEarningsTotals(submissions), [submissions]);

  const averageSupport = useMemo(() => {
    if (totals.totalSupports === 0) return 0;
    return totals.totalEarnings / totals.totalSupports;
  }, [totals.totalEarnings, totals.totalSupports]);

  const interactionBreakdown = useMemo(() => {
    const map: Record<string, { count: number; totalAmount: number }> = {};

    for (const category of INTERACTION_CATEGORIES) {
      map[category.type] = { count: 0, totalAmount: 0 };
    }

    for (const item of completedTransactions) {
      const type = item.interaction_type || "text";

      if (!map[type]) {
        map[type] = { count: 0, totalAmount: 0 };
      }

      map[type].count += 1;
      map[type].totalAmount += Number(item.amount || 0);
    }

    return map;
  }, [completedTransactions]);

  const mostUsedInteraction = useMemo(() => {
    let bestType: string | null = null;
    let maxCount = 0;

    for (const [type, data] of Object.entries(interactionBreakdown)) {
      if (data.count > maxCount) {
        maxCount = data.count;
        bestType = type;
      }
    }

    return {
      type: bestType,
      count: maxCount,
      percentage:
        totals.totalSupports > 0
          ? Math.round((maxCount / totals.totalSupports) * 100)
          : 0,
    };
  }, [interactionBreakdown, totals.totalSupports]);

  const categoriesWithStats = useMemo(
    () =>
      INTERACTION_CATEGORIES.map((category) => {
        const data = interactionBreakdown[category.type] || {
          count: 0,
          totalAmount: 0,
        };

        return {
          ...category,
          count: data.count,
          revenue: data.totalAmount,
          percentage:
            totals.totalSupports > 0
              ? Math.round((data.count / totals.totalSupports) * 100)
              : 0,
        };
      }),
    [interactionBreakdown, totals.totalSupports]
  );

  const topSupporters = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        isAnonymous: boolean;
        totalSupports: number;
        totalContributed: number;
        interactions: Record<string, number>;
        lastActive: string;
      }
    >();

    for (const item of completedTransactions) {
      const rawName = item.sender_name?.trim();
      const isAnonymous = !rawName;
      const displayName = isAnonymous ? "Anonymous" : rawName;
      const key = isAnonymous ? "__anonymous__" : displayName.toLowerCase();

      const existing = map.get(key);
      const amount = Number(item.amount || 0);
      const interactionType = item.interaction_type || "text";
      const itemDate = item.created_at || "";

      if (!existing) {
        map.set(key, {
          name: displayName,
          isAnonymous,
          totalSupports: 1,
          totalContributed: amount,
          interactions: { [interactionType]: 1 },
          lastActive: itemDate,
        });
      } else {
        existing.totalSupports += 1;
        existing.totalContributed += amount;
        existing.interactions[interactionType] =
          (existing.interactions[interactionType] || 0) + 1;

        if (itemDate && (!existing.lastActive || itemDate > existing.lastActive)) {
          existing.lastActive = itemDate;
        }
      }
    }

    const list = Array.from(map.values()).map((entry) => {
      let favoriteInteraction = "text";
      let favoriteCount = -1;

      for (const [type, count] of Object.entries(entry.interactions)) {
        if (count > favoriteCount) {
          favoriteCount = count;
          favoriteInteraction = type;
        }
      }

      return {
        name: entry.name,
        isAnonymous: entry.isAnonymous,
        totalSupports: entry.totalSupports,
        totalContributed: entry.totalContributed,
        favoriteInteraction,
        lastActive: entry.lastActive,
      };
    });

    list.sort((a, b) => {
      if (b.totalContributed !== a.totalContributed) {
        return b.totalContributed - a.totalContributed;
      }

      return b.totalSupports - a.totalSupports;
    });

    return list.map((item, index) => ({
      ...item,
      rank: index + 1,
    }));
  }, [completedTransactions]);

  const trendData = useMemo(() => {
    const buckets: TrendBucket[] = [];
    const now = new Date();

    const makeBucket = (start: Date, end: Date, label?: string) => {
      const items = completedTransactions.filter((transaction) => {
        if (!transaction.created_at) return false;
        const date = new Date(transaction.created_at);
        return date >= start && date < end;
      });

      return {
        key: start.toISOString(),
        label: label || formatShortDate(start),
        fullDateLabel:
          start.getTime() === end.getTime() - 86400000
            ? formatDate(start)
            : `${formatShortDate(start)} - ${formatShortDate(new Date(end.getTime() - 1))}`,
        revenue: items.reduce((sum, item) => sum + Number(item.amount || 0), 0),
        count: items.length,
      };
    };

    if (timeRange === "7d" || timeRange === "30d") {
      const days = timeRange === "7d" ? 7 : 30;

      for (let i = days - 1; i >= 0; i--) {
        const start = new Date(now);
        start.setDate(now.getDate() - i);
        start.setHours(0, 0, 0, 0);

        const end = new Date(start);
        end.setDate(start.getDate() + 1);

        buckets.push(makeBucket(start, end));
      }
    } else if (timeRange === "90d") {
      for (let i = 12; i >= 0; i--) {
        const start = new Date(now);
        start.setDate(now.getDate() - (i * 7 + 6));
        start.setHours(0, 0, 0, 0);

        const end = new Date(now);
        end.setDate(now.getDate() - i * 7 + 1);
        end.setHours(0, 0, 0, 0);

        buckets.push(makeBucket(start, end));
      }
    } else {
      const validDates = completedTransactions
        .map((item) => (item.created_at ? new Date(item.created_at).getTime() : NaN))
        .filter(Number.isFinite);

      if (validDates.length === 0) {
        for (let i = 6; i >= 0; i--) {
          const start = new Date(now);
          start.setDate(now.getDate() - i);
          start.setHours(0, 0, 0, 0);

          const end = new Date(start);
          end.setDate(start.getDate() + 1);

          buckets.push(makeBucket(start, end));
        }
      } else {
        const earliest = new Date(Math.min(...validDates));
        earliest.setHours(0, 0, 0, 0);

        const dayDifference = Math.max(
          1,
          Math.ceil((now.getTime() - earliest.getTime()) / 86400000)
        );

        if (dayDifference <= 14) {
          for (let i = dayDifference - 1; i >= 0; i--) {
            const start = new Date(now);
            start.setDate(now.getDate() - i);
            start.setHours(0, 0, 0, 0);

            const end = new Date(start);
            end.setDate(start.getDate() + 1);

            buckets.push(makeBucket(start, end));
          }
        } else if (dayDifference <= 90) {
          const weeks = Math.min(13, Math.ceil(dayDifference / 7));

          for (let i = weeks - 1; i >= 0; i--) {
            const start = new Date(now);
            start.setDate(now.getDate() - (i * 7 + 6));
            start.setHours(0, 0, 0, 0);

            const end = new Date(start);
            end.setDate(start.getDate() + 7);

            buckets.push(makeBucket(start, end));
          }
        } else {
          const monthCount = Math.min(
            12,
            (now.getFullYear() - earliest.getFullYear()) * 12 +
              now.getMonth() -
              earliest.getMonth() +
              1
          );

          for (let i = monthCount - 1; i >= 0; i--) {
            const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);

            const bucket = makeBucket(
              start,
              end,
              start.toLocaleDateString("en-IN", { month: "short" })
            );

            bucket.fullDateLabel = start.toLocaleDateString("en-IN", {
              month: "long",
              year: "numeric",
            });

            buckets.push(bucket);
          }
        }
      }
    }

    return buckets;
  }, [timeRange, completedTransactions]);

  const hasTrendData = useMemo(
    () => trendData.some((item) => item.revenue > 0 || item.count > 0),
    [trendData]
  );

  const maxRevenue = useMemo(
    () => Math.max(...trendData.map((item) => item.revenue), 10),
    [trendData]
  );

  const maxCount = useMemo(
    () => Math.max(...trendData.map((item) => item.count), 1),
    [trendData]
  );

  const exportSupportersCsv = () => {
    if (topSupporters.length === 0) return;

    const headers = [
      "Rank",
      "Supporter",
      "Total Supports",
      "Total Contributed (INR)",
      "Favorite Interaction",
      "Latest Support Date",
    ];

    const rows = topSupporters.map((supporter) => [
      supporter.rank,
      `"${supporter.name.replace(/"/g, '""')}"`,
      supporter.totalSupports,
      Math.round(supporter.totalContributed),
      `"${interactionName(supporter.favoriteInteraction)}"`,
      supporter.lastActive ? new Date(supporter.lastActive).toISOString() : "",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `streamlounge-top-supporters-${timeRange}.csv`);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /* ---------------- LOADING ---------------- */

  if (loading) {
    return <StreamLoader messages={["Preparing your analytics"]} />;
  }

  /* ---------------- ERROR ---------------- */

  if (error) {
    return (
      <div className="an-load px-5">
        <style>{THEME_CSS}</style>
        <div className="an-glass an-rise w-full max-w-md p-10 text-center">
          <h1 className="an-h2 !text-2xl">Analytics</h1>
          <p className="mt-3 text-sm text-red-300">{error}</p>

          <div className="mt-6 flex items-center justify-center gap-3">
            <button onClick={() => router.push("/login")} className="an-btn-mint">
              Go to Login
            </button>

            <button onClick={loadInitial} className="an-btn-ghost">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const selectedRangeLabel =
    TIME_RANGES.find((range) => range.id === timeRange)?.label || "30 Days";

  const rangeIndex = Math.max(
    0,
    TIME_RANGES.findIndex((range) => range.id === timeRange)
  );

  /* =======================================================
     UI
  ======================================================== */

  return (
    <div className="an-root">
      <style>{THEME_CSS}</style>

      {/* BACKGROUND */}
      <div className="an-ambient" aria-hidden="true">
        <span className="an-orb an-orb-1" />
        <span className="an-orb an-orb-2" />
        <span className="an-orb an-orb-3" />
        <span className="an-grid" />
        <span className="an-beam an-beam-1" />
        <span className="an-beam an-beam-2" />
      </div>

      <DashboardSidebar
        activeItem="Analytics"
        creatorName={profile?.creator_name || undefined}
        email={email}
      />

      <main className="an-main lg:pl-[250px]">
        <div className="mx-auto max-w-[1500px] p-5 lg:p-8">
          {/* HEADER */}
          <header
            className="an-rise mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"
            style={d(0)}
          >
            <div>
              <p className="an-eyebrow">
                <span className="an-dot" />
                Creator insights
              </p>

              <h1 className="an-h1 mt-5">
                Your <span className="an-grad">creator universe.</span>
              </h1>

              <p className="an-muted mt-3 max-w-xl text-base leading-7">
                The numbers behind your community, your creativity, and your growth.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="an-icon-btn hidden p-3 sm:inline-flex"
                aria-label="Notifications"
              >
                <Bell size={18} />
              </button>

              <div className="an-glass flex items-center gap-3 !rounded-2xl px-3 py-2">
                {effectiveAvatarUrl && !avatarError ? (
                  <img
                    src={effectiveAvatarUrl}
                    alt=""
                    onError={() => setAvatarError(true)}
                    className="h-9 w-9 rounded-full border border-white/15 object-cover"
                  />
                ) : (
                  <div className="an-avatar h-9 w-9 text-xs">
                    {(profile?.creator_name || "C")[0].toUpperCase()}
                  </div>
                )}

                <div className="hidden sm:block">
                  <div className="text-xs font-semibold">
                    {profile?.creator_name || profile?.username || "Creator"}
                  </div>
                  <div className="an-muted mt-0.5 text-[10px]">Your workspace</div>
                </div>

                <ChevronDown size={14} className="an-muted" />
              </div>
            </div>
          </header>

          {/* TIME FILTER */}
          <section
            className="an-glass an-violet an-rise mb-5 flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
            style={d(100)}
          >
            <div className="flex items-center gap-4">
              <div className="an-tile h-11 w-11 !rounded-2xl">
                <CalendarDays size={20} />
              </div>

              <div>
                <div className="text-sm font-semibold">Analytics period</div>
                <p className="an-muted mt-0.5 text-xs">
                  Explore your performance across different time ranges.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="an-seg">
                <div className="an-seg-inner">
                  <span
                    className="an-seg-pill"
                    style={{ transform: `translateX(${rangeIndex * 100}%)` }}
                  />

                  {TIME_RANGES.map((range) => {
                    const isActive = timeRange === range.id;

                    return (
                      <button
                        key={range.id}
                        type="button"
                        onClick={() => handleTimeRangeChange(range.id)}
                        disabled={fetchingSubmissions}
                        className={`an-seg-btn ${isActive ? "an-seg-btn-active" : ""} disabled:opacity-60`}
                      >
                        {range.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleTimeRangeChange(timeRange)}
                disabled={fetchingSubmissions}
                title="Refresh metrics"
                aria-label="Refresh metrics"
                className="an-icon-btn h-[46px] w-[46px] disabled:opacity-50"
              >
                <RefreshCw size={16} className={fetchingSubmissions ? "animate-spin" : ""} />
              </button>
            </div>
          </section>

          {/* ERROR BANNER */}
          {submissionsError && (
            <div className="an-rise mb-5 flex flex-col gap-3 rounded-2xl border border-red-400/20 bg-red-500/[0.07] p-4 text-xs text-red-200 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                <AlertCircle size={17} className="shrink-0 text-red-400" />
                <span>{submissionsError}</span>
              </div>

              <button
                type="button"
                onClick={handleRetrySubmissions}
                disabled={fetchingSubmissions}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-500/10 px-3.5 py-1.5 font-semibold text-white transition hover:bg-red-500/20 disabled:opacity-50"
              >
                <RefreshCw size={12} className={fetchingSubmissions ? "animate-spin" : ""} />
                Retry
              </button>
            </div>
          )}

          <div className={`an-content ${fetchingSubmissions ? "an-busy" : ""}`}>
            {/* SUMMARY CARDS */}
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title="Support Revenue"
                value={Number(totals.totalEarnings) || 0}
                format={(n) => money(Math.round(n))}
                subtitle={`90% creator share: ${money(totals.creatorReceive)}`}
                badge={totals.totalSupports > 0 ? `${totals.totalSupports} supports` : undefined}
                icon={<Wallet size={20} />}
                color="#5BE0CF"
                delay={180}
              />

              <StatCard
                title="Completed Transactions"
                value={Number(totals.totalSupports) || 0}
                format={(n) => Math.round(n).toLocaleString("en-IN")}
                subtitle={`Successful supports (${selectedRangeLabel})`}
                badge={totals.totalSupports > 0 ? "100% completed" : undefined}
                icon={<Gift size={20} />}
                color="#A78BFA"
                delay={250}
              />

              <StatCard
                title="Average Support"
                value={Number(averageSupport) || 0}
                format={(n) => (totals.totalSupports > 0 ? money(Math.round(n)) : "₹0")}
                subtitle="Average per completed transaction"
                badge={totals.totalSupports > 0 ? "Avg amount" : undefined}
                icon={<CreditCard size={20} />}
                color="#4D8AFF"
                delay={320}
              />

              <StatCard
                title="Most-Used Type"
                text={mostUsedInteraction.type ? interactionName(mostUsedInteraction.type) : "—"}
                subtitle={
                  mostUsedInteraction.count > 0
                    ? `${mostUsedInteraction.count} supports (${mostUsedInteraction.percentage}% of total)`
                    : "No completed interactions"
                }
                badge={
                  mostUsedInteraction.count > 0
                    ? `${mostUsedInteraction.percentage}% share`
                    : undefined
                }
                icon={<Sparkles size={20} />}
                color="#F472B6"
                delay={390}
              />
            </div>

            {/* CHARTS */}
            <div className="mt-5 grid gap-5 xl:grid-cols-[1.7fr_1fr]">
              <section className="an-glass an-rise p-6" style={d(460)}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="an-eyebrow !tracking-[.14em]">The big picture</p>
                    <h2 className="an-h2 mt-2">Revenue & Activity Trend</h2>
                    <p className="an-muted mt-1 text-xs">
                      Revenue and interaction volume for {selectedRangeLabel}.
                    </p>
                  </div>

                  <div className="flex gap-4 text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#5BE0CF]" />
                      Revenue
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#A78BFA]" />
                      Interactions
                    </div>
                  </div>
                </div>

                <div className="mt-8">
                  {!hasTrendData ? (
                    <div className="an-empty relative flex h-[285px] items-center justify-center p-6 text-center">
                      <div className="flex max-w-sm flex-col items-center">
                        <div className="an-empty-icon h-14 w-14">
                          <BarChart3 size={26} />
                        </div>
                        <h3 className="mt-4 text-sm font-semibold text-white">
                          Your story starts here
                        </h3>
                        <p className="an-muted mt-2 text-xs leading-relaxed">
                          Once viewers support you through your creator page, your activity
                          will appear here.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div key={timeRange} className="relative h-[285px]">
                      <div className="absolute inset-0 flex flex-col justify-between">
                        {[0, 1, 2, 3, 4].map((line) => (
                          <div key={line} className="an-gridline" />
                        ))}
                      </div>

                      <div className="absolute inset-0 flex items-end justify-between gap-1 px-1">
                        {trendData.map((item, index) => {
                          const revenueHeight =
                            item.revenue === 0 ? 3 : Math.max(6, (item.revenue / maxRevenue) * 100);

                          const countHeight =
                            item.count === 0 ? 3 : Math.max(6, (item.count / maxCount) * 100);

                          return (
                            <div
                              key={item.key}
                              className="an-col flex h-full flex-1 items-end justify-center"
                            >
                              <div className="an-tip">
                                {item.fullDateLabel}
                                <b>Revenue {money(item.revenue)}</b>
                                <em>
                                  {item.count} {item.count === 1 ? "interaction" : "interactions"}
                                </em>
                              </div>

                              <div className="relative flex h-full w-full max-w-[28px] items-end justify-center gap-[2px]">
                                <div
                                  className="an-bar an-bar-rev w-[45%] rounded-t-md"
                                  style={{ ...idx(index), height: `${revenueHeight}%` }}
                                />
                                <div
                                  className="an-bar an-bar-cnt w-[45%] rounded-t-md"
                                  style={{ ...idx(index), height: `${countHeight}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="an-muted mt-3 flex justify-between text-[10px]">
                    {trendData.map((item, index) => {
                      const total = trendData.length;

                      const show =
                        total <= 10
                          ? true
                          : total <= 15
                            ? index % 2 === 0
                            : total <= 31
                              ? index % 5 === 0 || index === total - 1
                              : index % 3 === 0 || index === total - 1;

                      return (
                        <span key={item.key} className={show ? "" : "opacity-0"}>
                          {item.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* INTERACTION BREAKDOWN */}
              <section
                className="an-glass an-rise flex flex-col justify-between p-6"
                style={d(530)}
              >
                <div>
                  <p className="an-eyebrow !tracking-[.14em]">Your community</p>
                  <h2 className="an-h2 mt-2">Interaction Breakdown</h2>
                  <p className="an-muted mt-1 text-xs">
                    All six interaction types ({selectedRangeLabel}).
                  </p>

                  {totals.totalSupports === 0 ? (
                    <div className="an-empty my-6 flex flex-col items-center justify-center p-6 text-center">
                      <div className="an-empty-icon h-12 w-12">
                        <Layers size={22} />
                      </div>
                      <h3 className="mt-3 text-xs font-semibold text-white">
                        No interaction breakdown
                      </h3>
                      <p className="an-muted mt-1 text-[11px]">
                        Your interaction mix will appear here.
                      </p>
                    </div>
                  ) : (
                    <div key={timeRange} className="my-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="an-dist">
                        {categoriesWithStats
                          .filter((category) => category.count > 0)
                          .map((category, index) => (
                            <div
                              key={category.type}
                              style={{
                                ...idx(index),
                                width: `${(category.count / totals.totalSupports) * 100}%`,
                              }}
                              className={`an-seg-fill ${category.barColor}`}
                              title={`${category.name}: ${category.count} supports (${category.percentage}%)`}
                            />
                          ))}
                      </div>

                      <div className="mt-3 flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#C7D2FE]">
                          {totals.totalSupports}{" "}
                          {totals.totalSupports === 1 ? "support" : "supports"}
                        </span>
                        <span className="font-semibold text-[#5BE0CF]">
                          {money(totals.totalEarnings)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2.5">
                  {categoriesWithStats.map((category, index) => {
                    const Icon = category.icon;

                    return (
                      <div
                        key={category.type}
                        className="an-row px-3.5 py-3"
                        style={idx(index)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`flex h-7 w-7 items-center justify-center rounded-lg ${category.bg} ${category.color}`}
                            >
                              <Icon size={14} />
                            </div>
                            <span className="text-xs font-semibold text-[#E2E8F0]">
                              {category.name}
                            </span>
                          </div>

                          {totals.totalSupports === 0 ? (
                            <span className="an-muted text-[11px] font-medium">
                              0 supports · ₹0
                            </span>
                          ) : (
                            <div className="text-right">
                              <div className="text-xs font-semibold text-white">
                                {money(category.revenue)}
                              </div>
                              <div className="an-muted text-[10px]">
                                {category.count} {category.count === 1 ? "support" : "supports"} (
                                {category.percentage}%)
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="an-meter">
                          <span
                            key={timeRange}
                            className={category.barColor}
                            style={{ ...idx(index), width: `${category.percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* TOP SUPPORTERS */}
            <section className="an-glass an-rise mt-5 overflow-hidden" style={d(600)}>
              <div className="flex flex-col gap-4 border-b border-white/10 p-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="an-eyebrow !tracking-[.14em]">The people behind it</p>
                  <h2 className="an-h2 mt-2">Top Supporters</h2>
                  <p className="an-muted mt-1 text-xs">
                    Your highest-contributing viewers for {selectedRangeLabel}.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={exportSupportersCsv}
                  disabled={topSupporters.length === 0}
                  className="an-btn-ghost"
                >
                  <Download size={15} />
                  Export CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="an-table w-full min-w-[900px] text-sm">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Supporter</th>
                      <th>Total Supports</th>
                      <th>Total Contributed</th>
                      <th>Favorite Interaction</th>
                      <th>Latest Support</th>
                    </tr>
                  </thead>

                  <tbody>
                    {topSupporters.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-14 text-center">
                          <div className="flex flex-col items-center">
                            <div className="an-empty-icon h-12 w-12">
                              <Users size={22} />
                            </div>
                            <div className="mt-4 text-sm font-semibold text-white">
                              No supporters yet
                            </div>
                            <div className="an-muted mt-1 text-xs">
                              Your supporters will appear here when they interact with your
                              creator page.
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      topSupporters.map((supporter, index) => (
                        <tr
                          key={supporter.rank + supporter.name}
                          className="an-trow"
                          style={idx(Math.min(index, 14))}
                        >
                          <td>
                            {supporter.rank <= 3 ? (
                              <span className={`an-rank an-rank-${supporter.rank}`}>
                                {supporter.rank}
                              </span>
                            ) : (
                              <span className="an-muted text-xs">#{supporter.rank}</span>
                            )}
                          </td>

                          <td>
                            <div className="flex items-center gap-3">
                              {supporter.isAnonymous ? (
                                <div className="an-anon h-9 w-9">
                                  <User size={15} />
                                </div>
                              ) : (
                                <div className="an-avatar h-9 w-9 text-xs">
                                  {supporter.name[0]?.toUpperCase() || "S"}
                                </div>
                              )}

                              <div>
                                <div className="font-semibold text-[#F8FAFC]">
                                  {supporter.name}
                                </div>
                                {supporter.isAnonymous && (
                                  <div className="an-muted text-[10px]">Anonymous supporter</div>
                                )}
                              </div>
                            </div>
                          </td>

                          <td>
                            <div className="font-semibold text-[#F8FAFC]">
                              {supporter.totalSupports}
                            </div>
                            <div className="an-muted text-[10px]">
                              {supporter.totalSupports === 1 ? "support" : "supports"}
                            </div>
                          </td>

                          <td className="font-semibold text-[#5BE0CF]">
                            {money(supporter.totalContributed)}
                          </td>

                          <td>
                            <div className="flex items-center gap-2">
                              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#B9AEF0]">
                                {getInteractionIcon(supporter.favoriteInteraction)}
                              </span>
                              <span className="text-xs font-medium text-[#C8D4EA]">
                                {interactionName(supporter.favoriteInteraction)}
                              </span>
                            </div>
                          </td>

                          <td>
                            <div className="flex items-center gap-2">
                              <span className="an-chip an-chip-on !text-[10px]">
                                <span className="h-1.5 w-1.5 rounded-full bg-[#5BE0CF]" />
                                Completed
                              </span>
                              <span className="an-muted text-[10px]">
                                {supporter.lastActive
                                  ? formatDate(new Date(supporter.lastActive))
                                  : "—"}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* FOOTER */}
          <footer className="an-muted mt-6 flex flex-col items-center justify-between gap-2 border-t border-white/10 pt-5 text-[11px] sm:flex-row">
            <span>ϟ StreamLounge · Your creator universe</span>
            <span>Platform fee: 10% · Creator share: 90%</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
