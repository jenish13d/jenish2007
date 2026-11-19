"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import DashboardSidebar from "@/app/component/DashboardSidebar";
import {
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Download,
  Gift,
  MessageSquare,
  Mic,
  Percent,
  RotateCw,
  Wallet,
  Volume2,
  Sparkles,
  CreditCard,
  X,
} from "lucide-react";
import {
  PLATFORM_FEE,
  Submission,
  DayData,
  money,
  getCycleStart,
  getCycleByOffset,
  formatShortDate,
  formatDateTime,
  isCompleted,
  calculateEarningsTotals,
  calculateCycleProgress,
  aggregateDailyEarnings,
  interactionName,
} from "@/lib/earnings/utils";

type Profile = {
  creator_name: string | null;
  username: string | null;
  profile_image_url: string | null;
  youtube_avatar_url: string | null;
};

/* Optional rotating words under the loader (small and quiet). */
const DEFAULT_MESSAGES = ["Loading"];

/*
  StreamLoader: a single "going live" signal.
  One glowing dot at the centre, broadcast rings drifting outward from it.
  Same props as before, so every page that already uses it keeps working.
*/
function EarningsStreamLoader({
  messages = DEFAULT_MESSAGES,
  size = "md",
}: {
  messages?: string[];
  size?: "md" | "sm";
}) {
  const [index, setIndex] = useState(0);
  const scale = size === "sm" ? 0.78 : 1;

  useEffect(() => {
    if (messages.length < 2) return;

    const id = setInterval(
      () => setIndex((i) => (i + 1) % messages.length),
      1900
    );

    return () => clearInterval(id);
  }, [messages.length]);

  return (
    <div
      className="ls-root relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070B1F] text-[#F8FAFC]"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      {/* quiet atmosphere */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_30%,rgba(124,92,255,0.18),transparent_55%),radial-gradient(ellipse_at_85%_80%,rgba(94,234,212,0.08),transparent_50%)]" />
        <div className="ls-orb-a absolute -top-[300px] -left-[240px] h-[720px] w-[720px] rounded-full bg-[#7C5CFF]/20 blur-[170px]" />
        <div className="ls-orb-b absolute -bottom-[320px] -right-[260px] h-[720px] w-[720px] rounded-full bg-[#5EEAD4]/[0.10] blur-[170px]" />
      </div>

      <div className="relative flex flex-col items-center px-6">
        <div
          className="relative flex items-center justify-center"
          style={{ width: 200 * scale, height: 200 * scale }}
        >
          <div
            className="absolute left-1/2 top-1/2 h-[200px] w-[200px]"
            style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
            aria-hidden="true"
          >
            {/* broadcast rings */}
            <span className="ls-ring" style={{ animationDelay: "0s" }} />
            <span className="ls-ring" style={{ animationDelay: "1.2s" }} />
            <span className="ls-ring" style={{ animationDelay: "2.4s" }} />

            {/* soft halo */}
            <span className="ls-halo absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(94,234,212,0.35),rgba(124,92,255,0.18)_50%,transparent_72%)]" />

            {/* the signal */}
            <span className="ls-dot absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full" />
          </div>
        </div>

        <p className="mt-6 flex items-center text-[11px] uppercase tracking-[0.35em] text-[#64748B]">
          <span key={index} className="ls-msg">
            {messages[index % messages.length]}
          </span>
        </p>
      </div>

      <style jsx global>{`
        @keyframes lsFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes lsRing {
          0% { transform: translate(-50%, -50%) scale(0.12); opacity: 0; }
          15% { opacity: 0.85; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
        }
        @keyframes lsDot {
          0%, 100% { transform: translate(-50%, -50%) scale(1); background: #5EEAD4; box-shadow: 0 0 22px 4px rgba(94,234,212,0.65); }
          50% { transform: translate(-50%, -50%) scale(1.25); background: #A78BFA; box-shadow: 0 0 28px 6px rgba(167,139,250,0.7); }
        }
        @keyframes lsHalo {
          0%, 100% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.7; }
          50% { transform: translate(-50%, -50%) scale(1.15); opacity: 1; }
        }
        @keyframes lsMsg {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes lsDriftA {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(160px, 110px, 0) scale(1.12); }
        }
        @keyframes lsDriftB {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(-170px, -100px, 0) scale(1.1); }
        }

        /* short delay so very fast loads never flash the loader */
        .ls-root { animation: lsFadeIn 0.4s ease 0.12s backwards; }

        .ls-ring {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 200px;
          height: 200px;
          border-radius: 9999px;
          border: 1px solid rgba(94, 234, 212, 0.55);
          box-shadow: 0 0 24px rgba(124, 92, 255, 0.25), inset 0 0 24px rgba(94, 234, 212, 0.08);
          opacity: 0;
          animation: lsRing 3.6s cubic-bezier(0.2, 0.6, 0.3, 1) infinite;
        }
        .ls-dot { animation: lsDot 3.6s ease-in-out infinite; }
        .ls-halo { animation: lsHalo 3.6s ease-in-out infinite; }
        .ls-msg { animation: lsMsg 0.45s ease backwards; }
        .ls-orb-a { animation: lsDriftA 26s ease-in-out infinite; }
        .ls-orb-b { animation: lsDriftB 30s ease-in-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .ls-root, .ls-ring, .ls-halo, .ls-msg, .ls-orb-a, .ls-orb-b { animation: none !important; }
          .ls-dot { animation: none !important; background: #5EEAD4; box-shadow: 0 0 22px 4px rgba(94,234,212,0.65); }
          .ls-ring { opacity: 0.25; transform: translate(-50%, -50%) scale(0.5); }
        }
      `}</style>
    </div>
  );
}


/* =========================================================
   THEME (matches the creator dashboard)
========================================================= */

const THEME_CSS = `
@property --er-angle { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
@property --er-reveal { syntax: "<angle>"; initial-value: 0deg; inherits: false; }

.er-root {
  position: relative; isolation: isolate; min-height: 100vh; color: #F4F7FB;
  font-family: var(--font-geist-sans), Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  letter-spacing: -0.011em; -webkit-font-smoothing: antialiased;
  background:
    radial-gradient(ellipse 60% 55% at 6% 52%, rgba(122,104,200,.5), transparent 66%),
    radial-gradient(ellipse 48% 40% at 62% 24%, rgba(49,63,120,.4), transparent 70%),
    linear-gradient(115deg, #1d2350 0%, #142848 46%, #0A2137 100%);
  background-attachment: fixed;
}
.er-main { position: relative; z-index: 1; min-width: 0; }

/* ---------- ambient background ---------- */
.er-ambient { position: fixed; inset: 0; overflow: hidden; pointer-events: none; z-index: 0; contain: paint; }
.er-orb { position: absolute; border-radius: 50%; filter: blur(80px); will-change: transform; }
.er-orb-1 { width: 34rem; height: 34rem; top: 8rem; left: -14rem; background: #8B79D6; opacity: .3; animation: er-drift-a 30s ease-in-out infinite alternate; }
.er-orb-2 { width: 28rem; height: 28rem; bottom: -8rem; right: -9rem; background: #162A50; opacity: .6; animation: er-drift-b 34s ease-in-out infinite alternate; }
.er-orb-3 { width: 18rem; height: 18rem; top: 22%; right: 18%; background: #5BE0CF; opacity: .09; animation: er-drift-b 28s ease-in-out infinite alternate-reverse; }
.er-grid { position: absolute; inset: 0; opacity: .05; background-image: linear-gradient(rgba(199,210,254,.2) 1px, transparent 1px), linear-gradient(90deg, rgba(199,210,254,.2) 1px, transparent 1px); background-size: 62px 62px; mask-image: linear-gradient(to bottom, black, transparent 80%); animation: er-grid 14s ease-in-out infinite alternate; }
.er-beam { position: absolute; top: -10rem; width: 1px; height: 56rem; transform: rotate(32deg); transform-origin: top; opacity: .08; background: linear-gradient(to bottom, transparent, #5BE0CF, transparent); animation: er-sway 26s ease-in-out infinite alternate; }
.er-beam-1 { left: 30%; }
.er-beam-2 { right: 24%; background: linear-gradient(to bottom, transparent, #A78BFA, transparent); animation-direction: alternate-reverse; }
@keyframes er-drift-a { from { transform: translate3d(0,0,0) scale(1); } to { transform: translate3d(90px,70px,0) scale(1.12); } }
@keyframes er-drift-b { from { transform: translate3d(0,0,0) scale(1); } to { transform: translate3d(-80px,-60px,0) scale(1.1); } }
@keyframes er-grid { from { opacity: .06; transform: translateY(0); } to { opacity: .13; transform: translateY(12px); } }
@keyframes er-sway { from { transform: rotate(28deg) translateX(-20px); opacity: .06; } to { transform: rotate(38deg) translateX(30px); opacity: .2; } }

/* ---------- entrance ---------- */
@keyframes er-rise { from { opacity: 0; transform: translate3d(0,26px,0) scale(.985); filter: blur(8px); } to { opacity: 1; transform: none; filter: none; } }
.er-rise { animation: er-rise .95s cubic-bezier(.16,1,.3,1) backwards; animation-delay: calc(var(--d, 0) * 1ms); }

/* ---------- type ---------- */
.er-eyebrow { display: inline-flex; align-items: center; gap: 10px; font-size: 11px; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; color: #9FB0C6; }
.er-dot { width: 7px; height: 7px; border-radius: 999px; background: #5BE0CF; box-shadow: 0 0 14px rgba(91,224,207,.85); animation: er-blip 2s ease-out infinite; }
@keyframes er-blip { 0% { box-shadow: 0 0 0 0 rgba(91,224,207,.6), 0 0 14px rgba(91,224,207,.85); } 80%,100% { box-shadow: 0 0 0 9px rgba(91,224,207,0), 0 0 14px rgba(91,224,207,.85); } }
.er-h1 { font-size: clamp(2.5rem, 5.4vw, 4rem); line-height: 1; letter-spacing: -.05em; font-weight: 500; color: #fff; }
.er-grad { background: linear-gradient(90deg, #cfc6fa 0%, #a995f2 55%, #8e7cea 100%); -webkit-background-clip: text; background-clip: text; color: transparent; background-size: 200% 100%; animation: er-grad-move 9s ease-in-out infinite alternate; }
@keyframes er-grad-move { from { background-position: 0% 50%; } to { background-position: 100% 50%; } }
.er-h2 { font-size: 1.15rem; font-weight: 500; letter-spacing: -.03em; color: #fff; }
.er-muted { color: #9FB0C6; }

/* ---------- surfaces ---------- */
.er-glass { position: relative; background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.1); backdrop-filter: blur(18px); border-radius: 26px; transition: transform .5s cubic-bezier(.2,.8,.2,1), border-color .4s ease, box-shadow .5s ease, background-color .4s ease; }
.er-glass:hover { border-color: rgba(91,224,207,.3); box-shadow: 0 22px 60px rgba(4,10,35,.28), 0 0 34px rgba(122,104,200,.12); }
.er-violet { background: linear-gradient(120deg, rgba(122,104,200,.22), rgba(255,255,255,.04) 55%); }

/* rotating gradient border (banner) */
.er-orbit::after { content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1.5px; pointer-events: none; background: conic-gradient(from var(--er-angle), transparent 0 55%, #5BE0CF 74%, #A78BFA 88%, transparent 100%); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); mask-composite: exclude; animation: er-spin 6s linear infinite; }
@keyframes er-spin { to { --er-angle: 360deg; } }

.er-tile { display: flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 18px; color: #5BE0CF; background: rgba(91,224,207,.1); border: 1px solid rgba(91,224,207,.28); }
.er-chip { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 5px 12px; font-size: 11px; font-weight: 600; letter-spacing: .04em; }
.er-chip-on { color: #5BE0CF; background: rgba(91,224,207,.1); border: 1px solid rgba(91,224,207,.25); }
.er-pill { display: inline-flex; align-items: center; gap: 10px; border-radius: 999px; padding: 10px 18px; font-size: 14px; font-weight: 500; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); }

/* ---------- buttons ---------- */
.er-btn-mint, .er-btn-ghost { position: relative; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; gap: 10px; border-radius: 999px; font-weight: 600; transition: transform .4s cubic-bezier(.2,.8,.2,1), box-shadow .4s ease, border-color .3s ease, background-color .3s ease, filter .3s ease; }
.er-btn-mint { padding: 14px 24px; font-size: 14px; color: #06222b; background: #5BE0CF; box-shadow: 0 12px 40px rgba(91,224,207,.28); }
.er-btn-mint:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 16px 50px rgba(91,224,207,.42); }
.er-btn-mint:active:not(:disabled) { transform: scale(.985); }
.er-btn-mint::after { content: ""; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 32%, rgba(255,255,255,.55) 50%, transparent 68%); transform: translateX(-130%); pointer-events: none; }
.er-btn-mint:hover:not(:disabled)::after { animation: er-sheen .85s ease; }
@keyframes er-sheen { to { transform: translateX(130%); } }
.er-btn-ghost { padding: 11px 18px; font-size: 13px; color: #F4F7FB; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.14); }
.er-btn-ghost:hover:not(:disabled) { border-color: rgba(91,224,207,.55); background: rgba(255,255,255,.09); transform: translateY(-1px); }
.er-btn-ghost:disabled { opacity: .4; cursor: not-allowed; }

/* ---------- progress ---------- */
.er-progress { position: relative; height: 12px; border-radius: 999px; background: rgba(255,255,255,.08); overflow: hidden; }
.er-progress-fill { position: relative; height: 100%; width: var(--w); border-radius: inherit; background: linear-gradient(90deg, #5BE0CF, #4D8AFF 55%, #8e7cea); box-shadow: 0 0 18px rgba(91,224,207,.45); animation: er-fill 1.6s cubic-bezier(.16,1,.3,1) .5s backwards; overflow: hidden; }
.er-progress-fill::after { content: ""; position: absolute; inset: 0; background: linear-gradient(100deg, transparent 30%, rgba(255,255,255,.45) 50%, transparent 70%); transform: translateX(-120%); animation: er-glide 2.8s ease-in-out 2s infinite; }
@keyframes er-fill { from { width: 0; } to { width: var(--w); } }
@keyframes er-glide { to { transform: translateX(120%); } }

/* ---------- countdown ---------- */
.er-time { display: flex; align-items: center; justify-content: center; height: 58px; width: 56px; overflow: hidden; border-radius: 16px; font-size: 1.5rem; font-weight: 500; letter-spacing: -.03em; color: #fff; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); font-variant-numeric: tabular-nums; }
.er-tick { display: inline-block; animation: er-tick .5s cubic-bezier(.16,1,.3,1); }
@keyframes er-tick { from { transform: translateY(-45%); opacity: 0; filter: blur(4px); } to { transform: none; opacity: 1; filter: none; } }

/* ---------- stat cards ---------- */
.er-stat { --accent: #5BE0CF; overflow: hidden; padding: 22px; }
.er-stat:hover { transform: translateY(-4px); border-color: color-mix(in srgb, var(--accent) 55%, transparent); }
.er-stat::before { content: ""; position: absolute; width: 190px; height: 190px; right: -70px; top: -80px; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--accent) 34%, transparent), transparent 68%); animation: er-breathe 6s ease-in-out infinite; pointer-events: none; }
.er-stat::after { content: ""; position: absolute; left: 22px; right: 22px; bottom: 0; height: 2px; border-radius: 2px; background: linear-gradient(90deg, var(--accent), transparent); opacity: .7; transform-origin: left; animation: er-line 1.4s cubic-bezier(.16,1,.3,1) .6s backwards; }
@keyframes er-breathe { 0%,100% { transform: scale(1); opacity: .75; } 50% { transform: scale(1.18); opacity: 1; } }
@keyframes er-line { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.er-stat-icon { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 15px; color: var(--accent); background: color-mix(in srgb, var(--accent) 13%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 32%, transparent); animation: er-float 5.5s ease-in-out infinite; }
@keyframes er-float { 0%,100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-4px) rotate(-3deg); } }
.er-stat-value { font-size: clamp(1.7rem, 2.4vw, 2.2rem); font-weight: 500; letter-spacing: -.05em; color: #fff; font-variant-numeric: tabular-nums; }

/* ---------- bar chart ---------- */
.er-gridline { border-top: 1px dashed rgba(255,255,255,.08); }
.er-col { position: relative; }
.er-bar { transform-origin: bottom; animation: er-grow 1s cubic-bezier(.16,1,.3,1) backwards; animation-delay: calc(var(--i, 0) * 38ms + 350ms); transition: filter .3s ease, transform .3s ease; }
.er-col:hover .er-bar { filter: brightness(1.25) saturate(1.1); }
.er-bar-total { background: linear-gradient(to top, #5A47A8, #B9AEF0); box-shadow: 0 0 16px rgba(167,139,250,.25); }
.er-bar-receive { background: linear-gradient(to top, #2F6BD6, #5BE0CF); box-shadow: 0 0 16px rgba(91,224,207,.25); }
@keyframes er-grow { from { transform: scaleY(0); opacity: 0; } to { transform: scaleY(1); opacity: 1; } }
.er-tip { position: absolute; left: 50%; bottom: calc(100% + 6px); z-index: 5; min-width: 118px; padding: 10px 12px; border-radius: 14px; font-size: 11px; line-height: 1.55; color: #E4E2F2; background: rgba(12,26,48,.96); border: 1px solid rgba(255,255,255,.14); box-shadow: 0 14px 40px rgba(2,8,24,.5); transform: translate(-50%, 8px) scale(.96); opacity: 0; pointer-events: none; transition: opacity .25s ease, transform .35s cubic-bezier(.34,1.56,.64,1); white-space: nowrap; }
.er-tip b { display: block; color: #B9AEF0; font-weight: 600; }
.er-tip em { display: block; color: #5BE0CF; font-style: normal; font-weight: 600; }
.er-col:hover .er-tip { opacity: 1; transform: translate(-50%, 0) scale(1); }

/* ---------- donut ---------- */
.er-donut { position: relative; width: 208px; height: 208px; border-radius: 50%; background: conic-gradient(#5BE0CF 0deg 324deg, #A78BFA 324deg 360deg); -webkit-mask: conic-gradient(#000 var(--er-reveal), transparent 0); mask: conic-gradient(#000 var(--er-reveal), transparent 0); animation: er-reveal 1.6s cubic-bezier(.16,1,.3,1) .5s forwards; filter: drop-shadow(0 0 22px rgba(91,224,207,.22)); }
@keyframes er-reveal { to { --er-reveal: 360deg; } }
.er-donut-wrap { position: relative; display: flex; align-items: center; justify-content: center; }
.er-donut-hole { position: absolute; width: 146px; height: 146px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #12284a; border: 1px solid rgba(255,255,255,.08); box-shadow: inset 0 0 30px rgba(0,0,0,.3); }
.er-donut-ring { position: absolute; inset: -14px; border-radius: 50%; border: 1px dashed rgba(255,255,255,.12); animation: er-orbit 40s linear infinite; }
@keyframes er-orbit { to { transform: rotate(360deg); } }

/* ---------- table ---------- */
.er-table th { padding: 16px 20px; text-align: left; font-size: 11px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: #9FB0C6; background: rgba(255,255,255,.03); white-space: nowrap; }
.er-row { animation: er-row-in .7s cubic-bezier(.16,1,.3,1) backwards; animation-delay: calc(var(--i, 0) * 55ms + 200ms); transition: background-color .3s ease, box-shadow .3s ease; border-top: 1px solid rgba(255,255,255,.07); }
.er-row td { padding: 16px 20px; }
.er-row:hover { background: rgba(255,255,255,.045); box-shadow: inset 3px 0 0 #5BE0CF; }
@keyframes er-row-in { from { opacity: 0; transform: translate3d(-18px,0,0); } to { opacity: 1; transform: none; } }

/* ---------- modal ---------- */
.er-backdrop { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(4,12,28,.72); backdrop-filter: blur(16px); animation: er-fade .45s cubic-bezier(.16,1,.3,1) both; }
.er-dialog { position: relative; display: flex; flex-direction: column; width: 100%; max-width: 580px; max-height: 86vh; overflow: hidden; border-radius: 30px; border: 1px solid rgba(167,149,242,.3); background: rgba(14,30,56,.97); box-shadow: 0 30px 120px rgba(3,7,24,.6), 0 0 80px rgba(122,104,200,.22); transform-origin: 50% 100%; animation: er-dialog-in .85s cubic-bezier(.22,1.15,.36,1) both; }
.er-cycle { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-radius: 20px; text-align: left; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.09); animation: er-pop .6s cubic-bezier(.16,1,.3,1) backwards; animation-delay: calc(var(--i, 0) * 45ms + 150ms); transition: transform .35s cubic-bezier(.2,.8,.2,1), border-color .3s ease, background-color .3s ease; }
.er-cycle:hover { transform: translateX(4px); border-color: rgba(91,224,207,.45); background: rgba(255,255,255,.07); }
.er-cycle-active { border-color: rgba(91,224,207,.6); background: linear-gradient(120deg, rgba(91,224,207,.12), rgba(122,104,200,.14)); box-shadow: 0 0 26px rgba(91,224,207,.14); }
@keyframes er-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes er-dialog-in { 0% { opacity: 0; transform: translate3d(0,56px,0) scale(.93); filter: blur(10px); } 55% { opacity: 1; filter: blur(0); } 100% { opacity: 1; transform: none; filter: blur(0); } }
@keyframes er-pop { from { opacity: 0; transform: translate3d(0,16px,0) scale(.98); } to { opacity: 1; transform: none; } }

/* ---------- loader ---------- */
.er-load { display: flex; min-height: 100vh; flex-direction: column; align-items: center; justify-content: center; background: radial-gradient(ellipse 60% 55% at 6% 52%, rgba(122,104,200,.5), transparent 66%), linear-gradient(115deg, #1d2350 0%, #142848 46%, #0A2137 100%); }
.er-loader { position: relative; width: 92px; height: 92px; }
.er-loader span { position: absolute; inset: 0; border-radius: 50%; border: 2px solid transparent; }
.er-loader span:nth-child(1) { border-top-color: #5BE0CF; border-right-color: rgba(91,224,207,.25); animation: er-orbit-spin 1.15s cubic-bezier(.5,.1,.5,.9) infinite; filter: drop-shadow(0 0 8px rgba(91,224,207,.55)); }
.er-loader span:nth-child(2) { inset: 12px; border-bottom-color: #A78BFA; border-left-color: rgba(167,139,250,.25); animation: er-orbit-spin 1.7s cubic-bezier(.5,.1,.5,.9) infinite reverse; filter: drop-shadow(0 0 8px rgba(167,139,250,.5)); }
.er-loader span:nth-child(3) { inset: 24px; border-top-color: #4D8AFF; border-left-color: rgba(77,138,255,.25); animation: er-orbit-spin 2.3s cubic-bezier(.5,.1,.5,.9) infinite; filter: drop-shadow(0 0 8px rgba(77,138,255,.5)); }
.er-loader b { position: absolute; left: 50%; top: 50%; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: #fff; box-shadow: 0 0 18px 4px rgba(91,224,207,.65); animation: er-core 1.8s ease-in-out infinite; }
.er-loader-label { margin-top: 28px; font-size: 12px; letter-spacing: .22em; text-transform: uppercase; background: linear-gradient(100deg, #7C8FA6 30%, #fff 50%, #7C8FA6 70%); background-size: 250% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: er-label 2.2s linear infinite; }
@keyframes er-orbit-spin { to { transform: rotate(360deg); } }
@keyframes er-core { 0%,100% { transform: scale(.7); opacity: .7; } 50% { transform: scale(1.25); opacity: 1; } }
@keyframes er-label { from { background-position: 120% 0; } to { background-position: -120% 0; } }

.er-root button:focus-visible { outline: 2px solid rgba(91,224,207,.8); outline-offset: 3px; }

@media (prefers-reduced-motion: reduce) {
  .er-root *, .er-root *::before, .er-root *::after, .er-backdrop, .er-dialog, .er-dialog *, .er-load *, .er-loader * { animation: none !important; transition-duration: .01ms !important; }
  .er-donut { --er-reveal: 360deg; }
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

function InteractionIcon({ type }: { type: string }) {
  if (type === "audio") return <Mic size={15} />;
  if (type === "soundboard") return <Volume2 size={15} />;
  if (type === "spin_wheel") return <RotateCw size={15} />;
  if (type === "tasks") return <Gift size={15} />;
  if (type === "stickers") return <Sparkles size={15} />;
  return <MessageSquare size={15} />;
}

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
  subtitle,
  icon,
  badge,
  color,
  delay,
}: {
  title: string;
  value: number;
  format: (n: number) => string;
  subtitle: string;
  icon: ReactNode;
  badge?: string;
  color: string;
  delay: number;
}) {
  return (
    <div
      className="er-glass er-stat er-rise"
      style={{ ...d(delay), ["--accent" as string]: color } as CSSProperties}
    >
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="er-eyebrow !tracking-[.14em]">{title}</span>
            {badge && <span className="er-chip er-chip-on !px-2 !py-0.5 !text-[10px]">{badge}</span>}
          </div>

          <div className="er-stat-value mt-4">
            <CountUp value={value} format={format} />
          </div>

          <p className="er-muted mt-2 text-xs">{subtitle}</p>
        </div>

        <div className="er-stat-icon">{icon}</div>
      </div>
    </div>
  );
}

/* =========================================================
   PAGE
========================================================= */

export default function EarningsClient() {
  const supabase = getSupabaseBrowserClient();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [avatarError, setAvatarError] = useState(false);
  const [selectedCycleOffset, setSelectedCycleOffset] = useState<number>(0);
  const [isCycleModalOpen, setIsCycleModalOpen] = useState(false);

  const today = new Date();

  const availableCycles = useMemo(
    () => Array.from({ length: 10 }, (_, i) => getCycleByOffset(i)),
    []
  );

  const activeCycle = useMemo(
    () => getCycleByOffset(selectedCycleOffset),
    [selectedCycleOffset]
  );

  const cycleStart = activeCycle.start;
  const cycleEnd = activeCycle.end;
  const isCurrentCycle = activeCycle.isCurrent;
  const cycleLabel = activeCycle.label;

  const effectiveAvatarUrl =
    profile?.youtube_avatar_url || profile?.profile_image_url || null;

  useEffect(() => {
    setAvatarError(false);
  }, [effectiveAvatarUrl]);

  const fetchSubmissionsForRange = async (start: Date, end: Date) => {
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();

      if (authError || !authData.user) {
        return;
      }

      const { data, error: submissionsError } = await supabase
        .from("creator_submissions")
        .select(
          "id, creator_id, interaction_type, sender_name, message, amount, payment_status, status, created_at"
        )
        .eq("creator_id", authData.user.id)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: false });

      if (submissionsError) {
        console.error("SUBMISSIONS ERROR:", submissionsError);
        return;
      }

      setSubmissions((data || []) as Submission[]);
    } catch (err) {
      console.error("FETCH ERROR:", err);
    }
  };

  const selectCycle = async (offset: number) => {
    setSelectedCycleOffset(offset);
    setIsCycleModalOpen(false);
    const target = getCycleByOffset(offset);
    await fetchSubmissionsForRange(target.start, target.end);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");

      const { data: authData, error: authError } = await supabase.auth.getUser();

      if (authError) {
        throw authError;
      }

      const user = authData.user;

      if (!user) {
        setError("Please login to view earnings.");
        return;
      }

      setEmail(user.email || "");

      const [profileResult, submissionsResult] = await Promise.all([
        supabase
          .from("creator_profiles")
          .select("creator_name, username, profile_image_url, youtube_avatar_url")
          .eq("id", user.id)
          .maybeSingle(),

        supabase
          .from("creator_submissions")
          .select(
            "id, creator_id, interaction_type, sender_name, message, amount, payment_status, status, created_at"
          )
          .eq("creator_id", user.id)
          .gte("created_at", cycleStart.toISOString())
          .lte("created_at", cycleEnd.toISOString())
          .order("created_at", { ascending: false }),
      ]);

      if (profileResult.error) {
        console.error("PROFILE ERROR:", profileResult.error);
      }

      if (submissionsResult.error) {
        throw submissionsResult.error;
      }

      setProfile(profileResult.data as Profile | null);
      setSubmissions((submissionsResult.data || []) as Submission[]);
    } catch (err) {
      console.error("EARNINGS LOAD ERROR:", err);
      setError("Unable to load earnings data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const completedTransactions = useMemo(() => {
    return submissions.filter(isCompleted);
  }, [submissions]);

  const { totalEarnings, platformFee, creatorReceive, totalSupports } = useMemo(() => {
    return calculateEarningsTotals(submissions);
  }, [submissions]);

  const { currentDay, progress } = useMemo(() => {
    return calculateCycleProgress(cycleStart, isCurrentCycle, today);
  }, [cycleStart, isCurrentCycle, today]);

  const currentAnchorStart = useMemo(() => getCycleStart(new Date()), []);
  const nextCycle = useMemo(() => {
    const next = new Date(currentAnchorStart);
    next.setDate(currentAnchorStart.getDate() + 15);
    return next;
  }, [currentAnchorStart]);

  const [countdownNow, setCountdownNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCountdownNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const remainingSeconds = Math.max(
    0,
    Math.floor((nextCycle.getTime() - countdownNow) / 1000)
  );

  const countdown: { label: string; value: number }[] = [
    { label: "Days", value: Math.floor(remainingSeconds / 86400) },
    { label: "Hours", value: Math.floor((remainingSeconds % 86400) / 3600) },
    { label: "Minutes", value: Math.floor((remainingSeconds % 3600) / 60) },
    { label: "Seconds", value: remainingSeconds % 60 },
  ];

  const dailyData = useMemo<DayData[]>(
    () => aggregateDailyEarnings(completedTransactions, cycleStart),
    [cycleStart, completedTransactions]
  );

  const exportTransactionsCsv = () => {
    if (completedTransactions.length === 0) return;
    const headers = [
      "Index",
      "Date & Time",
      "Supporter",
      "Interaction",
      "Gross Amount (INR)",
      "Live Lounge Fee (10%) (INR)",
      "You Receive (INR)",
      "Payment Status",
      "Submission ID",
    ];
    const rows = completedTransactions.map((tx, i) => {
      const gross = Number(tx.amount || 0);
      const fee = Math.round(gross * PLATFORM_FEE);
      const net = gross - fee;
      return [
        i + 1,
        `"${formatDateTime(tx.created_at)}"`,
        `"${(tx.sender_name || "Anonymous").replace(/"/g, '""')}"`,
        `"${interactionName(tx.interaction_type)}"`,
        gross,
        fee,
        net,
        `"${tx.payment_status || tx.status || "paid"}"`,
        `"${tx.id}"`,
      ];
    });
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const cycleSlug = cycleLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    link.setAttribute("download", `streamlounge-earnings-${cycleSlug}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const maxChartValue = Math.max(
    100,
    ...dailyData.map((item) => Math.max(item.total, item.receive))
  );

  /* ---------------- LOADING ---------------- */

  if (loading) {
    return <EarningsStreamLoader messages={["Loading StreamLounge..."]} />;
  }

  /* ---------------- ERROR ---------------- */

  if (error) {
    return (
      <div className="er-load px-5">
        <style>{THEME_CSS}</style>
        <div className="er-glass er-rise max-w-md p-10 text-center">
          <h1 className="er-h2 !text-2xl">Earnings</h1>

          <p className="mt-3 text-sm text-red-300">{error}</p>

          <button onClick={loadData} className="er-btn-mint mt-6">
            Try again
          </button>
        </div>
      </div>
    );
  }

  const creatorName = profile?.creator_name || profile?.username || "Creator";

  /* =======================================================
     UI
  ======================================================== */

  return (
    <div className="er-root">
      <style>{THEME_CSS}</style>

      {/* BACKGROUND */}
      <div className="er-ambient" aria-hidden="true">
        <span className="er-orb er-orb-1" />
        <span className="er-orb er-orb-2" />
        <span className="er-orb er-orb-3" />
        <span className="er-grid" />
        <span className="er-beam er-beam-1" />
        <span className="er-beam er-beam-2" />
      </div>

      {/* SIDEBAR */}
      <DashboardSidebar activeItem="Earnings" creatorName={creatorName} email={email} />

      {/* MAIN */}
      <main className="er-main lg:ml-[250px]">
        <div className="mx-auto max-w-[1500px] p-5 lg:p-8">
          {/* TOP HEADER */}
          <div className="er-rise mb-8 flex items-start justify-between gap-4" style={d(0)}>
            <div>
              <p className="er-eyebrow">
                <span className="er-dot" />
                Creator earnings
                <span className="er-chip er-chip-on !py-0.5 !text-[10px]">Live data</span>
              </p>

              <h1 className="er-h1 mt-5">
                Your <span className="er-grad">earnings.</span>
              </h1>

              <p className="er-muted mt-3 text-base">
                Track your earnings, interactions and grow with Live Lounge.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                aria-label="Notifications"
                className="er-glass hidden !rounded-2xl p-3 text-[#B8C7D6] transition hover:text-white sm:block"
              >
                <Bell size={18} />
              </button>

              <div className="er-glass flex items-center gap-3 !rounded-2xl px-3 py-2">
                {effectiveAvatarUrl && !avatarError ? (
                  <img
                    src={effectiveAvatarUrl}
                    alt=""
                    onError={() => setAvatarError(true)}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#5BE0CF] to-[#4D8AFF] text-xs font-bold text-[#06222b]">
                    {(profile?.creator_name || "C")[0].toUpperCase()}
                  </div>
                )}

                <div className="hidden sm:block">
                  <div className="text-xs font-semibold">{creatorName}</div>
                  <div className="er-muted text-[10px]">Creator</div>
                </div>

                <ChevronDown size={14} className="er-muted" />
              </div>
            </div>
          </div>

          {/* DATE HEADER */}
          <div
            className="er-glass er-violet er-rise mb-5 flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
            style={d(100)}
          >
            <div className="flex items-center gap-4">
              <div className="er-tile h-11 w-11 !rounded-2xl">
                <CalendarDays size={20} />
              </div>

              <div>
                <div className="text-sm font-semibold">
                  {isCurrentCycle ? "Current Earnings Period" : "Past Earnings Period (Archived)"}
                </div>

                <div className="er-muted mt-0.5 text-xs">
                  {isCurrentCycle ? "15-day earnings period · withdrawals on the Payouts page" : "Historical 15-day earnings period"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {!isCurrentCycle && (
                <button
                  type="button"
                  onClick={() => selectCycle(0)}
                  className="text-xs font-semibold text-[#5BE0CF] underline underline-offset-4 transition hover:text-white"
                >
                  View Current Cycle
                </button>
              )}

              <div className="er-pill">
                <CalendarDays size={15} className="text-[#5BE0CF]" />
                {cycleLabel}
              </div>
            </div>
          </div>

          {/* CYCLE BANNER */}
          <div
            className="er-glass er-orbit er-rise w-full overflow-hidden p-5 xl:p-7"
            style={d(180)}
          >
            <div className="grid min-h-[150px] w-full grid-cols-1 items-center gap-7 min-[1400px]:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_minmax(0,1.8fr)] min-[1400px]:gap-6">
              {/* LEFT */}
              <div className="flex min-w-0 items-center gap-4 min-[1400px]:border-r min-[1400px]:border-white/10 min-[1400px]:pr-6">
                <div className="er-tile h-[76px] w-[76px] !rounded-full shadow-[0_0_30px_rgba(91,224,207,.2)]">
                  <CalendarDays size={34} strokeWidth={2.2} />
                </div>

                <div className="min-w-0">
                  <h2 className="text-lg font-medium tracking-tight text-white xl:text-xl">
                    {isCurrentCycle ? "Current 15-Day Cycle" : "Archived 15-Day Cycle"}
                  </h2>

                  <p className="er-muted mt-2 text-sm leading-6">
                    {isCurrentCycle
                      ? "Your earnings for the current cycle"
                      : "Your earnings for this historical period"}
                  </p>
                </div>
              </div>

              {/* CENTER */}
              <div className="min-w-0 min-[1400px]:border-r min-[1400px]:border-white/10 min-[1400px]:px-6">
                <h3 className="text-center text-lg font-medium tracking-tight text-white xl:text-xl">
                  {cycleLabel}
                </h3>

                <p className="er-muted mt-3 text-center text-sm">
                  {isCurrentCycle
                    ? `15 days ( Day ${currentDay} of 15 )`
                    : "15-day period ( 15 of 15 days completed )"}
                </p>

                <div className="er-progress mt-6">
                  <div
                    className="er-progress-fill"
                    style={{ ["--w" as string]: `${progress}%` } as CSSProperties}
                  />
                </div>
              </div>

              {/* RIGHT */}
              <div className="flex min-w-0 flex-col justify-between gap-5 sm:flex-row sm:items-center">
                <div className="flex min-w-0 items-start gap-3">
                  <Clock3 size={30} className="mt-1 shrink-0 text-[#5BE0CF]" />

                  <div className="min-w-0">
                    <p className="er-eyebrow mb-3 !tracking-[.14em]">
                      {isCurrentCycle ? "Next cycle starts in" : "Period status"}
                    </p>

                    {isCurrentCycle ? (
                      <div className="flex flex-wrap gap-2">
                        {countdown.map((item) => (
                          <div key={item.label} className="shrink-0 text-center">
                            <div className="er-time">
                              <span key={item.value} className="er-tick">
                                {String(item.value).padStart(2, "0")}
                              </span>
                            </div>

                            <span className="er-muted mt-1.5 block text-[10px]">{item.label}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-start gap-2.5 sm:flex-row sm:items-center">
                        <div className="er-chip er-chip-on !px-3.5 !py-2 !text-xs">
                          <span className="h-2 w-2 rounded-full bg-[#5BE0CF]" />
                          Completed & Archived
                        </div>

                        <button
                          type="button"
                          onClick={() => selectCycle(0)}
                          className="er-btn-ghost !px-3.5 !py-2 !text-xs"
                        >
                          Return to Current
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsCycleModalOpen(true)}
                  className="er-btn-mint shrink-0 !rounded-2xl !px-5 !py-4"
                >
                  <BarChart3 size={20} />
                  <span className="whitespace-nowrap">View All Cycles</span>
                </button>
              </div>
            </div>
          </div>

          {/* STATS */}
          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Total Earnings"
              value={Number(totalEarnings) || 0}
              format={(n) => money(Math.round(n))}
              subtitle="Total amount paid by viewers"
              icon={<Wallet size={20} />}
              color="#5BE0CF"
              delay={260}
            />

            <StatCard
              title="Live Lounge Fee"
              value={Number(platformFee) || 0}
              format={(n) => money(Math.round(n))}
              subtitle="Platform fee (10% cut)"
              icon={<Percent size={20} />}
              badge="10%"
              color="#F472B6"
              delay={330}
            />

            <StatCard
              title="You Receive"
              value={Number(creatorReceive) || 0}
              format={(n) => money(Math.round(n))}
              subtitle="Amount after 10% fee"
              icon={<CreditCard size={20} />}
              color="#4D8AFF"
              delay={400}
            />

            <StatCard
              title="Total Supports"
              value={Number(totalSupports) || 0}
              format={(n) => String(Math.round(n))}
              subtitle="Successful interactions"
              icon={<Gift size={20} />}
              color="#A78BFA"
              delay={470}
            />
          </div>

          {/* ANALYTICS */}
          <div className="mt-5 grid gap-5 xl:grid-cols-[1.7fr_1fr]">
            {/* BAR CHART */}
            <section className="er-glass er-rise p-6" style={d(540)}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="er-h2">Earnings Overview</h2>

                  <p className="er-muted mt-1 text-xs">Daily earnings for {cycleLabel}</p>
                </div>

                <div className="flex gap-4 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#A78BFA]" />
                    Total Earnings
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#5BE0CF]" />
                    You Receive
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <div className="relative h-[285px]">
                  {/* GRID */}
                  <div className="absolute inset-0 flex flex-col justify-between">
                    {[0, 1, 2, 3, 4].map((line) => (
                      <div key={line} className="er-gridline" />
                    ))}
                  </div>

                  {/* BARS */}
                  <div className="absolute inset-0 flex items-end justify-between gap-1 px-1">
                    {dailyData.map((day, index) => {
                      const totalHeight =
                        day.total === 0 ? 3 : Math.max(5, (day.total / maxChartValue) * 100);

                      const receiveHeight =
                        day.receive === 0 ? 3 : Math.max(5, (day.receive / maxChartValue) * 100);

                      return (
                        <div
                          key={index}
                          className="er-col flex h-full flex-1 items-end justify-center"
                        >
                          <div className="er-tip">
                            {day.label}
                            <b>Total {money(day.total)}</b>
                            <em>Receive {money(day.receive)}</em>
                          </div>

                          <div className="relative flex h-full w-full max-w-[30px] items-end justify-center gap-[2px]">
                            <div
                              className="er-bar er-bar-total w-[45%] rounded-t-md"
                              style={{ ...idx(index), height: `${totalHeight}%` }}
                            />

                            <div
                              className="er-bar er-bar-receive w-[45%] rounded-t-md"
                              style={{ ...idx(index), height: `${receiveHeight}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="er-muted mt-3 flex justify-between text-[10px]">
                  {dailyData.map((day, index) => (
                    <span
                      key={index}
                      className={index % 2 === 0 ? "" : "opacity-0 sm:opacity-100"}
                    >
                      {day.label}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            {/* DONUT */}
            <section className="er-glass er-rise p-6" style={d(610)}>
              <div>
                <h2 className="er-h2">Earnings Breakdown</h2>

                <p className="er-muted mt-1 text-xs">Current 15-day cycle</p>
              </div>

              <div className="flex flex-col items-center justify-center py-8">
                <div className="er-donut-wrap">
                  <div className="er-donut-ring" />

                  <div className="er-donut" />

                  <div className="er-donut-hole">
                    <div className="text-2xl font-medium tracking-tight">
                      <CountUp value={Number(totalEarnings) || 0} format={(n) => money(Math.round(n))} />
                    </div>

                    <div className="er-muted mt-1 text-[11px]">Total</div>
                  </div>
                </div>

                <div className="mt-9 w-full space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full bg-[#5BE0CF] shadow-[0_0_10px_rgba(91,224,207,.7)]" />

                      <span className="text-sm text-[#C8D4EA]">You Receive (90%)</span>
                    </div>

                    <span className="font-semibold">{money(creatorReceive)}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full bg-[#A78BFA] shadow-[0_0_10px_rgba(167,139,250,.7)]" />

                      <span className="text-sm text-[#C8D4EA]">Live Lounge Fee (10%)</span>
                    </div>

                    <span className="font-semibold">{money(platformFee)}</span>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* RECENT INTERACTIONS */}
          <section className="er-glass er-rise mt-5 overflow-hidden !rounded-[26px]" style={d(680)}>
            <div className="flex flex-col gap-4 border-b border-white/10 p-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="er-h2">
                  Recent Interactions
                  <span className="ml-2 text-[#B9AEF0]">
                    ({formatShortDate(cycleStart)} - {formatShortDate(cycleEnd)})
                  </span>
                </h2>

                <p className="er-muted mt-1 text-xs">
                  {isCurrentCycle
                    ? "Latest successful support received in the current cycle"
                    : "Latest successful support received in this historical cycle"}
                </p>
              </div>

              <button
                type="button"
                onClick={exportTransactionsCsv}
                disabled={completedTransactions.length === 0}
                className="er-btn-ghost"
              >
                <Download size={15} />
                Export CSV
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="er-table w-full min-w-[1000px] text-sm">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Date & Time</th>
                    <th>Supporter</th>
                    <th>Interaction</th>
                    <th>Amount</th>
                    <th>Live Lounge Fee</th>
                    <th>You Receive</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {completedTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-14 text-center">
                        <div className="flex flex-col items-center">
                          <div className="er-tile h-12 w-12 !rounded-2xl">
                            <Wallet size={22} />
                          </div>

                          <div className="mt-4 text-sm font-semibold">No earnings yet</div>

                          <div className="er-muted mt-1 text-xs">
                            Successful supports from this cycle will appear here.
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    completedTransactions.map((item, index) => {
                      const amount = Number(item.amount || 0);
                      const fee = Math.round(amount * 0.1);
                      const receive = amount - fee;

                      return (
                        <tr key={item.id} className="er-row" style={idx(Math.min(index, 14))}>
                          <td className="er-muted">{index + 1}</td>

                          <td className="whitespace-nowrap text-xs text-[#B8C7D6]">
                            {formatDateTime(item.created_at)}
                          </td>

                          <td>
                            <div className="font-semibold text-[#F8FAFC]">
                              {item.sender_name || "Anonymous"}
                            </div>
                          </td>

                          <td>
                            <div className="flex items-center gap-2">
                              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#B9AEF0]">
                                <InteractionIcon type={item.interaction_type} />
                              </span>

                              <span className="text-xs font-medium text-[#C8D4EA]">
                                {interactionName(item.interaction_type)}
                              </span>
                            </div>
                          </td>

                          <td className="font-semibold">{money(amount)}</td>

                          <td className="text-[#F472B6]">{money(fee)}</td>

                          <td className="font-semibold text-[#5BE0CF]">{money(receive)}</td>

                          <td>
                            <span className="er-chip er-chip-on !text-[10px]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#5BE0CF]" />
                              Completed
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* FOOTER */}
          <div className="er-muted mt-6 flex flex-col items-center justify-between gap-2 border-t border-white/10 pt-5 text-[11px] sm:flex-row">
            <span>Live Lounge · Creator Earnings</span>

            <span>Platform fee: 10% · Creator share: 90%</span>
          </div>
        </div>
      </main>

      {/* CYCLE HISTORY MODAL */}
      {isCycleModalOpen && (
        <div className="er-backdrop">
          <div className="absolute inset-0" onClick={() => setIsCycleModalOpen(false)} />

          <div className="er-dialog">
            {/* MODAL HEADER */}
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="er-tile h-11 w-11 !rounded-2xl">
                  <CalendarDays size={20} />
                </div>

                <div>
                  <h3 className="text-base font-medium tracking-tight text-white sm:text-lg">
                    15-Day Earnings Periods
                  </h3>

                  <p className="er-muted text-xs">
                    Select an earnings period to view its breakdown and transactions
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCycleModalOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[#B8C7D6] transition hover:border-white/30 hover:text-white"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* MODAL BODY */}
            <div className="flex-1 space-y-3 overflow-y-auto p-6">
              {availableCycles.map((cycle) => {
                const isSelected = selectedCycleOffset === cycle.offset;

                return (
                  <button
                    key={cycle.offset}
                    type="button"
                    onClick={() => selectCycle(cycle.offset)}
                    className={`er-cycle ${isSelected ? "er-cycle-active" : ""}`}
                    style={idx(cycle.offset)}
                  >
                    <div className="flex items-center gap-3.5">
                      <div
                        className={`er-tile h-10 w-10 !rounded-xl ${
                          isSelected ? "" : "!border-white/10 !bg-white/5 !text-[#9FB0C6]"
                        }`}
                      >
                        <CalendarDays size={18} />
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-[#F8FAFC]">{cycle.label}</span>

                          {cycle.isCurrent && (
                            <span className="er-chip er-chip-on !px-2 !py-0.5 !text-[10px]">
                              Current
                            </span>
                          )}
                        </div>

                        <p className="er-muted mt-0.5 text-xs">
                          15-day period {cycle.isCurrent ? "· In progress" : "· Completed"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isSelected ? (
                        <span className="er-chip er-chip-on">
                          <Check size={13} />
                          Active View
                        </span>
                      ) : (
                        <span className="er-muted text-xs">Select →</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* MODAL FOOTER */}
            <div className="flex items-center justify-between border-t border-white/10 bg-black/10 px-6 py-4">
              {selectedCycleOffset !== 0 ? (
                <button
                  type="button"
                  onClick={() => selectCycle(0)}
                  className="text-xs font-medium text-[#5BE0CF] underline underline-offset-4 transition hover:text-white"
                >
                  Reset to Current Cycle
                </button>
              ) : (
                <span className="er-muted text-xs">Showing current cycle</span>
              )}

              <button
                type="button"
                onClick={() => setIsCycleModalOpen(false)}
                className="er-btn-ghost !py-2 !text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
