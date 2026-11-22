"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Upload limits for creator soundboard media.
 *
 * Mirrored by the storage policies and by lib/storage/soundboard.ts. Checking
 * here gives the creator an immediate, specific message instead of a rejected
 * upload.
 */
const ALLOWED_SOUND_MIME = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
];
const MAX_SOUND_BYTES = 5 * 1024 * 1024;

const ALLOWED_IMAGE_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
import StreamLoader from "@/app/component/StreamLoader";
import LoadError from "@/app/component/LoadError";
import { loginUrl, resolveClientAuth } from "@/lib/supabase/client-auth";
import { StudioShell } from "@/app/component/studio/StudioShell";

type Sound = {
  id: string;
  creator_id: string | null;
  name: string;
  description: string | null;
  storage_path: string;
  image_path: string | null;
  category: "meme" | "custom" | "favorite";
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  isDefault?: boolean;
  previewUrl?: string | null;
  imageUrl?: string | null;
};

const MAX_AUDIO_SIZE = 10 * 1024 * 1024;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

/* =========================================================
   THEME (matches the creator dashboard)
========================================================= */

const THEME_CSS = `
@property --snd-angle { syntax: "<angle>"; initial-value: 0deg; inherits: false; }

.snd-root {
  position: relative; isolation: isolate; min-height: 100vh; color: #F4F7FB;
  font-family: var(--font-geist-sans), Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  letter-spacing: -0.011em; -webkit-font-smoothing: antialiased;
  background:
    radial-gradient(ellipse at 18% 32%, rgba(246,245,241,.20), transparent 55%),
    radial-gradient(ellipse at 88% 78%, rgba(200,168,120,.09), transparent 50%),
    #0B0C0D;
  background-attachment: fixed;
}
.snd-main { position: relative; z-index: 1; min-width: 0; }

/* ---------- ambient background ---------- */
.snd-ambient { position: fixed; inset: 0; overflow: hidden; pointer-events: none; z-index: 0; contain: paint; }
.snd-orb { position: absolute; border-radius: 50%; filter: blur(130px); will-change: transform; }
.snd-orb-1 { width: 34rem; height: 34rem; top: 8rem; left: -14rem; background: #3A3F43; opacity: .28; animation: snd-drift-a 30s ease-in-out infinite alternate; }
.snd-orb-2 { width: 28rem; height: 28rem; bottom: -8rem; right: -9rem; background: #2A2F33; opacity: .26; animation: snd-drift-b 34s ease-in-out infinite alternate; }
.snd-orb-3 { width: 18rem; height: 18rem; top: 22%; right: 18%; background: #C8A878; opacity: .12; animation: snd-drift-b 28s ease-in-out infinite alternate-reverse; }
.snd-grid { position: absolute; inset: 0; opacity: .05; background-image: linear-gradient(rgba(246,245,241,.2) 1px, transparent 1px), linear-gradient(90deg, rgba(246,245,241,.2) 1px, transparent 1px); background-size: 62px 62px; mask-image: linear-gradient(to bottom, black, transparent 80%); animation: snd-grid 14s ease-in-out infinite alternate; }
.snd-beam { position: absolute; top: -10rem; width: 1px; height: 56rem; transform: rotate(32deg); transform-origin: top; opacity: .08; background: linear-gradient(to bottom, transparent, #C8A878, transparent); animation: snd-sway 26s ease-in-out infinite alternate; }
.snd-beam-1 { left: 30%; }
.snd-beam-2 { right: 24%; background: linear-gradient(to bottom, transparent, #D3D4D0, transparent); animation-direction: alternate-reverse; }
@keyframes snd-drift-a { from { transform: translate3d(0,0,0) scale(1); } to { transform: translate3d(90px,70px,0) scale(1.12); } }
@keyframes snd-drift-b { from { transform: translate3d(0,0,0) scale(1); } to { transform: translate3d(-80px,-60px,0) scale(1.1); } }
@keyframes snd-grid { from { opacity: .06; transform: translateY(0); } to { opacity: .13; transform: translateY(12px); } }
@keyframes snd-sway { from { transform: rotate(28deg) translateX(-20px); opacity: .06; } to { transform: rotate(38deg) translateX(30px); opacity: .2; } }

/* ---------- entrance ---------- */
@keyframes snd-rise { from { opacity: 0; transform: translate3d(0,26px,0) scale(.985); filter: blur(8px); } to { opacity: 1; transform: none; filter: none; } }
.snd-rise { animation: snd-rise .95s cubic-bezier(.16,1,.3,1) backwards; animation-delay: calc(var(--d, 0) * 1ms); }

/* ---------- type ---------- */
.snd-eyebrow { display: inline-flex; align-items: center; gap: 10px; font-size: 11px; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; color: #9FB0C6; }
.snd-dot { width: 7px; height: 7px; border-radius: 999px; background: #C8A878; box-shadow: 0 0 14px rgba(200,168,120,.85); animation: snd-blip 2s ease-out infinite; }
@keyframes snd-blip { 0% { box-shadow: 0 0 0 0 rgba(200,168,120,.6), 0 0 14px rgba(200,168,120,.85); } 80%,100% { box-shadow: 0 0 0 9px rgba(200,168,120,0), 0 0 14px rgba(200,168,120,.85); } }
.snd-h1 { font-size: clamp(2.5rem, 5.4vw, 4rem); line-height: 1; letter-spacing: -.05em; font-weight: 500; color: #fff; }
.snd-grad { background: linear-gradient(90deg, #cfc6fa 0%, #a995f2 55%, #8e7cea 100%); -webkit-background-clip: text; background-clip: text; color: transparent; background-size: 200% 100%; animation: snd-grad-move 9s ease-in-out infinite alternate; }
@keyframes snd-grad-move { from { background-position: 0% 50%; } to { background-position: 100% 50%; } }
.snd-h2 { font-size: 1.15rem; font-weight: 500; letter-spacing: -.03em; color: #fff; }
.snd-muted { color: #9FB0C6; }
.snd-label { display: block; margin-bottom: 8px; font-size: 11px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: #9FB0C6; }

/* ---------- surfaces ---------- */
.snd-glass { position: relative; background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.1); backdrop-filter: blur(18px); border-radius: 28px; transition: transform .5s cubic-bezier(.2,.8,.2,1), border-color .4s ease, box-shadow .5s ease, background-color .4s ease; }
.snd-glass-hover:hover { border-color: rgba(200,168,120,.3); box-shadow: 0 22px 60px rgba(4,10,35,.28), 0 0 34px rgba(246,245,241,.12); }
.snd-tile { display: flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 18px; color: #C8A878; background: rgba(200,168,120,.1); border: 1px solid rgba(200,168,120,.28); }
.snd-chip { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 5px 12px; font-size: 11px; font-weight: 600; letter-spacing: .04em; }
.snd-chip-on { color: #C8A878; background: rgba(200,168,120,.1); border: 1px solid rgba(200,168,120,.25); }
.snd-chip-violet { color: #B9AEF0; background: rgba(246,245,241,.1); border: 1px solid rgba(246,245,241,.25); }
.snd-panel { border-radius: 20px; border: 1px solid rgba(255,255,255,.09); background: rgba(255,255,255,.035); }
.snd-float { animation: snd-float 5.5s ease-in-out infinite; }
@keyframes snd-float { 0%,100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-4px) rotate(-3deg); } }

/* ---------- buttons / fields ---------- */
.snd-btn-mint, .snd-btn-ghost { position: relative; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; gap: 10px; border-radius: 999px; font-weight: 600; transition: transform .4s cubic-bezier(.2,.8,.2,1), box-shadow .4s ease, border-color .3s ease, background-color .3s ease, opacity .3s ease; }
.snd-btn-mint { padding: 14px 24px; font-size: 14px; color: #04201C; background: #C8A878; box-shadow: 0 12px 40px rgba(200,168,120,.28); }
.snd-btn-mint:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 16px 50px rgba(200,168,120,.42); }
.snd-btn-mint:active:not(:disabled) { transform: scale(.985); }
.snd-btn-mint:disabled { opacity: .5; cursor: not-allowed; box-shadow: none; }
.snd-btn-mint::after { content: ""; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 32%, rgba(255,255,255,.55) 50%, transparent 68%); transform: translateX(-130%); pointer-events: none; }
.snd-btn-mint:hover:not(:disabled)::after { animation: snd-sheen .85s ease; }
@keyframes snd-sheen { to { transform: translateX(130%); } }
.snd-btn-ghost { padding: 11px 18px; font-size: 13px; color: #F4F7FB; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.14); }
.snd-btn-ghost:hover:not(:disabled) { border-color: rgba(200,168,120,.55); background: rgba(255,255,255,.09); transform: translateY(-1px); }
.snd-icon-btn { display: inline-flex; align-items: center; justify-content: center; border-radius: 16px; color: #B8C7D6; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); transition: transform .35s cubic-bezier(.2,.8,.2,1), border-color .3s ease, color .3s ease, background-color .3s ease, opacity .3s ease; }
.snd-icon-btn:hover:not(:disabled) { color: #fff; border-color: rgba(200,168,120,.5); background: rgba(255,255,255,.09); transform: translateY(-2px); }
.snd-icon-btn-danger:hover:not(:disabled) { color: #fb7185; border-color: rgba(251,113,133,.5); }
.snd-icon-btn:disabled { opacity: .4; cursor: not-allowed; }
.snd-field { width: 100%; border-radius: 16px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.05); padding: 13px 16px; color: #fff; font-size: 14px; font-weight: 500; outline: none; transition: border-color .3s ease, box-shadow .3s ease; }
.snd-field::placeholder { color: #61758A; }
.snd-field:focus { border-color: rgba(200,168,120,.7); box-shadow: 0 0 0 3px rgba(200,168,120,.12); }
.snd-drop { display: block; cursor: pointer; overflow: hidden; border-radius: 20px; border: 1px dashed rgba(255,255,255,.2); background: rgba(255,255,255,.03); transition: border-color .35s ease, background-color .35s ease, transform .35s cubic-bezier(.2,.8,.2,1); }
.snd-drop:hover { border-color: rgba(200,168,120,.6); background: rgba(200,168,120,.05); transform: translateY(-2px); }

/* ---------- tabs ---------- */
.snd-tabs { position: relative; padding: 4px; border-radius: 18px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); }
.snd-tabs-inner { position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.snd-tab-pill { position: absolute; left: 0; top: 0; width: 33.3333%; height: 100%; border-radius: 14px; background: linear-gradient(120deg, rgba(200,168,120,.2), rgba(246,245,241,.28)); border: 1px solid rgba(200,168,120,.45); box-shadow: 0 0 22px rgba(200,168,120,.2); transition: transform .55s cubic-bezier(.34,1.3,.64,1); }
.snd-tab { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 8px; font-size: 12px; font-weight: 600; color: #9FB0C6; white-space: nowrap; transition: color .3s ease; }
.snd-tab:hover { color: #fff; }
.snd-tab-active { color: #fff; }
.snd-tab-count { border-radius: 999px; padding: 1px 7px; font-size: 10px; background: rgba(255,255,255,.08); }
.snd-tab-active .snd-tab-count { background: rgba(200,168,120,.2); color: #C8A878; }

/* ---------- stat cards ---------- */
.snd-stat { --accent: #C8A878; overflow: hidden; padding: 20px; border-radius: 24px; }
.snd-stat:hover { transform: translateY(-4px); border-color: color-mix(in srgb, var(--accent) 55%, transparent); }
.snd-stat::before { content: ""; position: absolute; width: 160px; height: 160px; right: -60px; top: -70px; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--accent) 32%, transparent), transparent 68%); animation: snd-breathe 6s ease-in-out infinite; pointer-events: none; }
.snd-stat::after { content: ""; position: absolute; left: 20px; right: 20px; bottom: 0; height: 2px; border-radius: 2px; background: linear-gradient(90deg, var(--accent), transparent); opacity: .7; transform-origin: left; animation: snd-line 1.4s cubic-bezier(.16,1,.3,1) .6s backwards; }
@keyframes snd-breathe { 0%,100% { transform: scale(1); opacity: .75; } 50% { transform: scale(1.18); opacity: 1; } }
@keyframes snd-line { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.snd-stat-icon { display: flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 13px; color: var(--accent); background: color-mix(in srgb, var(--accent) 13%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 32%, transparent); animation: snd-float 5.5s ease-in-out infinite; }
.snd-stat-value { font-size: 2rem; font-weight: 500; letter-spacing: -.05em; color: #fff; font-variant-numeric: tabular-nums; }

/* ---------- sound cards ---------- */
.snd-card { position: relative; overflow: hidden; border-radius: 24px; background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.1); backdrop-filter: blur(18px); animation: snd-card-in .85s cubic-bezier(.16,1,.3,1) backwards; animation-delay: calc(var(--i, 0) * 60ms + 120ms); transition: transform .45s cubic-bezier(.2,.8,.2,1), border-color .4s ease, box-shadow .45s ease, background-color .4s ease; }
.snd-card:hover { transform: translateY(-5px); border-color: rgba(200,168,120,.4); background: rgba(255,255,255,.07); box-shadow: 0 24px 60px rgba(4,10,35,.34), 0 0 34px rgba(246,245,241,.16); }
@keyframes snd-card-in { from { opacity: 0; transform: translate3d(0,34px,0) scale(.95); filter: blur(8px); } to { opacity: 1; transform: none; filter: none; } }
.snd-card-playing { border-color: rgba(200,168,120,.55); background: rgba(200,168,120,.06); box-shadow: 0 0 40px rgba(200,168,120,.2); }
.snd-card-playing::after { content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1.5px; pointer-events: none; background: conic-gradient(from var(--snd-angle), transparent 0 55%, #C8A878 74%, #D3D4D0 88%, transparent 100%); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); mask-composite: exclude; animation: snd-spin 3.6s linear infinite; }
@keyframes snd-spin { to { --snd-angle: 360deg; } }
.snd-card-img { transition: transform .8s cubic-bezier(.16,1,.3,1); }
.snd-card:hover .snd-card-img { transform: scale(1.06); }
.snd-play { position: relative; display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: 999px; color: #fff; background: rgba(8,16,34,.62); border: 1px solid rgba(255,255,255,.2); backdrop-filter: blur(10px); transition: transform .35s cubic-bezier(.34,1.56,.64,1), background-color .3s ease, color .3s ease; }
.snd-play:hover:not(:disabled) { transform: scale(1.12); background: #C8A878; color: #04201C; }
.snd-play-on { background: #C8A878; color: #04201C; border-color: transparent; }
.snd-play-on::before { content: ""; position: absolute; inset: 0; border-radius: inherit; border: 2px solid #C8A878; animation: snd-ping 1.6s ease-out infinite; }
@keyframes snd-ping { 0% { transform: scale(1); opacity: .8; } 100% { transform: scale(1.7); opacity: 0; } }
.snd-heart { display: flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 999px; color: #fff; background: rgba(8,16,34,.55); border: 1px solid rgba(255,255,255,.18); backdrop-filter: blur(10px); transition: transform .35s cubic-bezier(.34,1.56,.64,1), color .3s ease; }
.snd-heart:hover { transform: scale(1.12); }
.snd-heart-on { color: #F472B6; border-color: rgba(244,114,182,.45); }
.snd-pop { display: inline-flex; animation: snd-pop .55s cubic-bezier(.34,1.56,.64,1); }
@keyframes snd-pop { 0% { transform: scale(.5); } 60% { transform: scale(1.35); } 100% { transform: scale(1); } }
.snd-eq { display: flex; align-items: flex-end; gap: 3px; height: 18px; }
.snd-eq span { width: 3px; border-radius: 2px; background: #C8A878; box-shadow: 0 0 8px rgba(200,168,120,.6); animation: snd-eq 1s ease-in-out infinite; }
.snd-eq span:nth-child(1) { animation-delay: -.2s; }
.snd-eq span:nth-child(2) { animation-delay: -.5s; }
.snd-eq span:nth-child(3) { animation-delay: -.1s; }
.snd-eq span:nth-child(4) { animation-delay: -.7s; }
@keyframes snd-eq { 0%,100% { height: 20%; } 50% { height: 100%; } }
.snd-status-dot { width: 7px; height: 7px; border-radius: 999px; }
.snd-status-on { background: #C8A878; box-shadow: 0 0 10px rgba(200,168,120,.8); animation: snd-blip 2s ease-out infinite; }
.snd-status-off { background: #475569; }

/* ---------- skeleton ---------- */
.snd-skel { position: relative; overflow: hidden; border-radius: 24px; background: rgba(255,255,255,.05); }
.snd-skel::after { content: ""; position: absolute; inset: 0; transform: translateX(-100%); background: linear-gradient(90deg, transparent, rgba(255,255,255,.09), transparent); animation: snd-shimmer 1.6s ease-in-out infinite; }
@keyframes snd-shimmer { to { transform: translateX(100%); } }

/* ---------- toast ---------- */
.snd-toast { position: fixed; top: 24px; left: 50%; z-index: 80; display: flex; align-items: center; gap: 10px; max-width: calc(100vw - 32px); padding: 13px 20px; border-radius: 999px; font-size: 13px; font-weight: 500; backdrop-filter: blur(20px); box-shadow: 0 20px 60px rgba(2,8,24,.5); animation: snd-toast-in .6s cubic-bezier(.34,1.4,.64,1) both; }
.snd-toast-success { color: #C8A878; background: rgba(10,40,48,.88); border: 1px solid rgba(200,168,120,.4); }
.snd-toast-error { color: #fda4af; background: rgba(48,14,28,.88); border: 1px solid rgba(251,113,133,.4); }
@keyframes snd-toast-in { from { opacity: 0; transform: translate(-50%, -24px) scale(.94); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }

/* ---------- steps ---------- */
.snd-step { display: flex; gap: 14px; padding: 14px; border-radius: 18px; background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.08); transition: transform .35s cubic-bezier(.2,.8,.2,1), border-color .3s ease; }
.snd-step:hover { transform: translateX(4px); border-color: rgba(200,168,120,.4); }

/* ---------- spinner ---------- */
.snd-spin { width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(255,255,255,.3); border-top-color: currentColor; animation: snd-rot .8s linear infinite; }
@keyframes snd-rot { to { transform: rotate(360deg); } }

.snd-root button:focus-visible { outline: 2px solid rgba(200,168,120,.8); outline-offset: 3px; }

@media (prefers-reduced-motion: reduce) {
  .snd-root *, .snd-root *::before, .snd-root *::after, .snd-toast { animation: none !important; transition-duration: .01ms !important; }
}

/* Design-system alignment (StreamLounge redesign) */
.snd-root { background: none !important; min-height: 0; color: var(--sl-fg); font-family: var(--sl-font); }
.snd-ambient { display: none !important; }
.snd-glass, .snd-card, .snd-tile, .snd-panel { background: var(--sl-surface) !important; border: 1px solid var(--sl-line) !important; border-radius: 14px !important; box-shadow: var(--sl-shadow) !important; backdrop-filter: none !important; }
.snd-muted { color: var(--sl-muted) !important; }
.snd-h1, .snd-h2 { color: var(--sl-fg); letter-spacing: -.025em; font-weight: 500; }
.snd-grad { color: var(--sl-accent); background: none !important; -webkit-text-fill-color: currentColor !important; }
.snd-eyebrow { font-family: var(--sl-mono); font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--sl-muted); }
.snd-field { background: var(--sl-bg-1) !important; border: 1px solid var(--sl-line-2) !important; color: var(--sl-fg) !important; border-radius: 6px !important; }
.snd-btn-mint { background: var(--sl-invert-bg) !important; color: var(--sl-invert-fg) !important; border: 1px solid var(--sl-invert-bg) !important; box-shadow: none !important; border-radius: 6px !important; }
.snd-btn-ghost { background: transparent !important; color: var(--sl-fg) !important; border: 1px solid var(--sl-line-2) !important; border-radius: 6px !important; }
[data-theme="light"] .snd-root .text-white { color: var(--sl-fg) !important; }
`;

function d(ms: number): CSSProperties {
  return { ["--d" as string]: ms } as CSSProperties;
}

function idx(i: number): CSSProperties {
  return { ["--i" as string]: i } as CSSProperties;
}

/* =========================================================
   ICONS
========================================================= */

function Icon({
  name,
  size = 20,
}: {
  name:
    | "search"
    | "play"
    | "pause"
    | "heart"
    | "upload"
    | "plus"
    | "trash"
    | "power"
    | "music"
    | "image"
    | "bolt"
    | "volume"
    | "x"
    | "check";
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  const paths = {
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    play: <path d="m9 6 9 6-9 6V6Z" fill="currentColor" stroke="none" />,
    pause: (
      <>
        <path d="M8 6v12" />
        <path d="M16 6v12" />
      </>
    ),
    heart: (
      <path d="M20.8 8.6c0 5-8.8 10-8.8 10S3.2 13.6 3.2 8.6A4.6 4.6 0 0 1 12 6.1a4.6 4.6 0 0 1 8.8 2.5Z" />
    ),
    upload: (
      <>
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M5 20h14" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="m9 7 .7-2h4.6l.7 2" />
        <path d="M6 7l1 13h10l1-13" />
      </>
    ),
    power: (
      <>
        <path d="M12 3v9" />
        <path d="M18.4 6.6a8 8 0 1 1-12.8 0" />
      </>
    ),
    music: (
      <>
        <path d="M9 18V5l10-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="16" cy="16" r="3" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9" r="1.5" />
        <path d="m21 15-5-5L5 20" />
      </>
    ),
    bolt: <path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" />,
    volume: (
      <>
        <path d="M4 10v4h4l5 4V6l-5 4H4Z" />
        <path d="M16 9a5 5 0 0 1 0 6" />
        <path d="M18.5 6.5a9 9 0 0 1 0 11" />
      </>
    ),
    x: (
      <>
        <path d="M6 6l12 12" />
        <path d="M18 6 6 18" />
      </>
    ),
    check: <path d="M5 12l5 5L20 7" />,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

/* =========================================================
   PAGE
========================================================= */

export default function SoundboardClient() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [creatorName, setCreatorName] = useState<string | undefined>(undefined);
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"memes" | "my" | "favorites">("memes");

  const [search, setSearch] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  const [uploading, setUploading] = useState(false);

  const [uploadName, setUploadName] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");

  const [uploadAudio, setUploadAudio] = useState<File | null>(null);
  const [uploadImage, setUploadImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [creatorPrice, setCreatorPrice] = useState(28);
  const [minimumPrice, setMinimumPrice] = useState(28);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  const [addingDefault, setAddingDefault] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function stopAudioPlayback() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    setPlayingId(null);
    setLoadingAudioId(null);
  }

  function handleTabChange(tab: "memes" | "my" | "favorites") {
    stopAudioPlayback();
    setActiveTab(tab);
  }

  useEffect(() => {
    loadPage();

    return () => {
      stopAudioPlayback();

      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, []);

  async function loadPage() {
    setLoading(true);
    setLoadError(null);
    try {
      await loadPageInner();
    } catch (err) {
      console.error("Soundboard load failed:", err);
      setLoadError("We couldn't reach the server. Check your connection and try again.");
    }
  }

  async function loadPageInner() {
    const auth = await resolveClientAuth();

    if (auth.status === "signed_out") {
      router.replace(loginUrl("/dashboard/soundboard"));
      return;
    }
    if (auth.status === "error") {
      setLoadError(auth.message);
      return;
    }
    const user = auth.user;

    setUserId(user.id);
    setEmail(user.email || "");

    const [
      { data: soundData, error: soundError },
      { data: interactionData },
      { data: pricingData },
      { data: profileData },
    ] = await Promise.all([
      supabase
        .from("soundboard_sounds")
        .select("*")
        .or(`creator_id.is.null,creator_id.eq.${user.id}`)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),

      supabase
        .from("creator_interactions")
        .select("price")
        .eq("creator_id", user.id)
        .eq("interaction_type", "soundboard")
        .maybeSingle(),

      supabase
        .from("interaction_pricing")
        .select("minimum_price")
        .eq("interaction_type", "soundboard")
        .maybeSingle(),

      supabase
        .from("creator_profiles")
        .select("creator_name, username")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    if (profileData) {
      setCreatorName(profileData.creator_name || profileData.username || undefined);
    }

    if (soundError) {
      showMessage(soundError.message, "error");
    }

    setCreatorPrice(Number(interactionData?.price ?? 28));

    setMinimumPrice(Number(pricingData?.minimum_price ?? 28));

    type SoundRow = {
      id: string;
      creator_id: string | null;
      name: string;
      storage_path: string | null;
      image_path: string | null;
      enabled: boolean | null;
      created_at: string;
    };

    // Rows whose stored object is a known-missing placeholder are hidden rather
    // than offered to viewers, since selecting one would queue an alert that
    // cannot play.
    const validSounds = ((soundData as SoundRow[] | null) ?? []).filter((sound) => {
      if (!sound.storage_path) return false;
      const cleanPath = sound.storage_path.trim().replace(/^\/+/, "");
      // Exclude missing placeholder files
      if (/(^|\/)memes\//.test(cleanPath)) return false;
      return true;
    });

    // One batch request instead of one signing request per sound.
    const paths = validSounds.map((sound) => (sound.storage_path ?? "").trim().replace(/^\/+/, ""));
    const signed = new Map<string, string>();
    if (paths.length) {
      try {
        const { data: urls, error: signError } = await supabase.storage
          .from("soundboard-audio")
          .createSignedUrls(paths, 3600);
        if (signError) console.warn("[soundboard] batch signing failed:", signError.message);
        for (const entry of urls ?? []) {
          if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
        }
      } catch (err) {
        console.warn("[soundboard] batch signing threw:", err);
      }
    }

    const soundResults = validSounds.map((sound, i) => ({
      ...sound,
      image_path: sound.image_path ?? null,
      isDefault: sound.creator_id === null,
      previewUrl: signed.get(paths[i]) ?? null,
      imageUrl: null,
    }) as Sound);

    setSounds(soundResults);

    setLoading(false);
  }

  function showMessage(text: string, type: "success" | "error") {
    setMessage(text);
    setMessageType(type);

    setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 3500);
  }

  const defaultSounds = useMemo(() => sounds.filter((sound) => sound.isDefault), [sounds]);

  const mySounds = useMemo(
    () => sounds.filter((sound) => sound.creator_id === userId),
    [sounds, userId]
  );

  const favoriteSounds = useMemo(
    () => sounds.filter((sound) => favoriteIds.includes(sound.id)),
    [sounds, favoriteIds]
  );

  const filteredSounds = useMemo(() => {
    let list: Sound[] = [];

    if (activeTab === "memes") {
      list = defaultSounds;
    }

    if (activeTab === "my") {
      list = mySounds;
    }

    if (activeTab === "favorites") {
      list = favoriteSounds;
    }

    if (!search.trim()) {
      return list;
    }

    const q = search.toLowerCase();

    return list.filter(
      (sound) =>
        sound.name.toLowerCase().includes(q) ||
        sound.description?.toLowerCase().includes(q)
    );
  }, [activeTab, defaultSounds, mySounds, favoriteSounds, search]);

  function toggleFavorite(id: string) {
    setFavoriteIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  async function getSignedAudioUrl(
    storagePath: string | null | undefined
  ): Promise<string | null> {
    if (!storagePath) return null;
    const cleanPath = storagePath.trim().replace(/^\/+/, "");
    if (!cleanPath) return null;

    // A single signed URL for the exact stored path.
    //
    // The previous version fell back to `/api/overlay/soundboard?path=…` when
    // signing failed. That endpoint took an arbitrary path, was unauthenticated,
    // and proxied whatever it resolved out of a private bucket — so it could be
    // used to read any object in it, and its fuzzy resolver would match across
    // creators. It has been removed, and so has this fallback: a path that does
    // not resolve is a data problem to surface, not to guess around.
    try {
      const { data, error } = await supabase.storage
        .from("soundboard-audio")
        .createSignedUrl(cleanPath, 3600);

      if (error || !data?.signedUrl) {
        console.warn(
          `[soundboard] could not sign "${cleanPath}":`,
          error?.message ?? "no url returned",
        );
        return null;
      }

      return data.signedUrl;
    } catch (err: unknown) {
      console.warn(`[soundboard] signing threw for "${cleanPath}":`, err);
      return null;
    }
  }

  async function previewSound(sound: Sound) {
    try {
      if (playingId === sound.id) {
        stopAudioPlayback();
        return;
      }

      stopAudioPlayback();
      setLoadingAudioId(sound.id);

      let url = sound.previewUrl;

      if (!url) {
        url = await getSignedAudioUrl(sound.storage_path);

        if (!url) {
          setLoadingAudioId(null);
          showMessage("Audio file could not be loaded from storage.", "error");
          return;
        }

        setSounds((current) =>
          current.map((item) => (item.id === sound.id ? { ...item, previewUrl: url } : item))
        );
      }

      // Pass signed URL directly without re-encoding with encodeURI
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setPlayingId(null);
        setLoadingAudioId(null);
        audioRef.current = null;
      };

      audio.onerror = () => {
        setPlayingId(null);
        setLoadingAudioId(null);
        audioRef.current = null;

        const errCode = audio.error?.code;
        const errMsg = audio.error?.message;
        console.error("[Soundboard] Audio element error:", { code: errCode, message: errMsg, url });

        let userMsg = "Could not play this audio file.";
        if (errCode === 4) {
          userMsg = "Audio format or URL not supported by browser.";
        } else if (errCode === 3) {
          userMsg = "Audio file could not be decoded.";
        } else if (errCode === 2) {
          userMsg = "Network error loading audio file.";
        } else if (errMsg) {
          userMsg = `Could not play audio: ${errMsg}`;
        }

        showMessage(userMsg, "error");
      };

      await audio.play();
      setLoadingAudioId(null);
      setPlayingId(sound.id);
    } catch (err: unknown) {
      stopAudioPlayback();

      // An AbortError is what the browser throws when playback is cancelled
      // because the creator clicked another sound; that is not worth reporting.
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        console.error("Audio playback error:", err);
        showMessage(
          err instanceof Error
            ? `Playback failed: ${err.message}`
            : "Could not preview this sound.",
          "error"
        );
      }
    }
  }

  async function addDefaultToBoard(sound: Sound) {
    let activeUserId = userId;
    if (!activeUserId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) {
        activeUserId = user.id;
        setUserId(user.id);
      }
    }

    if (!activeUserId) {
      showMessage("Please sign in to add sounds to your board.", "error");
      return;
    }

    if (!sound.storage_path) {
      showMessage("Audio file is missing for this sound.", "error");
      return;
    }

    setAddingDefault(sound.id);

    try {
      const cleanStoragePath = sound.storage_path.trim().replace(/^\/+/, "");

      const alreadyAdded = mySounds.some(
        (item) =>
          item.storage_path === cleanStoragePath || item.storage_path === sound.storage_path
      );

      if (alreadyAdded) {
        showMessage("Already added to your board.", "error");
        return;
      }

      // Pre-resolve signed URL for playback cache if possible, but do not block clone if pending
      let previewUrl = sound.previewUrl;
      if (!previewUrl) {
        try {
          previewUrl = await getSignedAudioUrl(cleanStoragePath);
        } catch {
          previewUrl = null;
        }
      }

      const nextSort =
        mySounds.reduce((max, item) => Math.max(max, Number(item.sort_order) || 0), 0) + 1;

      const { data, error } = await supabase
        .from("soundboard_sounds")
        .insert({
          creator_id: activeUserId,
          name: sound.name,
          description: sound.description ?? null,
          storage_path: cleanStoragePath,
          image_path: sound.image_path ?? null,
          category: "meme",
          enabled: true,
          sort_order: nextSort,
        })
        .select()
        .single();

      if (error) {
        console.error("[Soundboard] Add to board database error:", error);
        showMessage(`Failed to add sound: ${error.message}`, "error");
        return;
      }

      if (!data) {
        showMessage("Failed to add sound: No data returned from database.", "error");
        return;
      }

      setSounds((current) => [
        ...current,
        {
          ...data,
          isDefault: false,
          previewUrl: previewUrl ?? null,
          imageUrl: sound.imageUrl ?? null,
        },
      ]);

      showMessage(`${sound.name} added to your board.`, "success");
    } catch (err: unknown) {
      console.error("[Soundboard] Unexpected error adding to board:", err);
      showMessage(
        err instanceof Error
          ? `Failed to add sound: ${err.message}`
          : "Failed to add sound to your board.",
        "error"
      );
    } finally {
      setAddingDefault(null);
    }
  }

  async function toggleSound(sound: Sound) {
    if (!userId || sound.creator_id !== userId) {
      return;
    }

    const enabled = !sound.enabled;

    const { error } = await supabase
      .from("soundboard_sounds")
      .update({ enabled })
      .eq("id", sound.id)
      .eq("creator_id", userId);

    if (error) {
      showMessage(error.message, "error");
      return;
    }

    setSounds((current) =>
      current.map((item) => (item.id === sound.id ? { ...item, enabled } : item))
    );
  }

  async function deleteSound(sound: Sound) {
    if (!userId || sound.creator_id !== userId) {
      return;
    }

    const confirmed = window.confirm(`Delete "${sound.name}" from your soundboard?`);

    if (!confirmed) {
      return;
    }

    setDeletingId(sound.id);

    if (playingId === sound.id) {
      stopAudioPlayback();
    }

    if (sound.storage_path) {
      await supabase.storage.from("soundboard-audio").remove([sound.storage_path]);
    }

    if (sound.image_path) {
      await supabase.storage.from("soundboard-images").remove([sound.image_path]);
    }

    const { error } = await supabase
      .from("soundboard_sounds")
      .delete()
      .eq("id", sound.id)
      .eq("creator_id", userId);

    if (error) {
      showMessage(error.message, "error");

      setDeletingId(null);
      return;
    }

    setSounds((current) => current.filter((item) => item.id !== sound.id));

    setFavoriteIds((current) => current.filter((id) => id !== sound.id));

    showMessage("Sound deleted.", "success");

    setDeletingId(null);
  }

  function handleAudioChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("audio/")) {
      showMessage("Please select an audio file.", "error");
      return;
    }

    if (file.size > MAX_AUDIO_SIZE) {
      showMessage("Audio must be under 10 MB.", "error");
      return;
    }

    setUploadAudio(file);

    if (!uploadName.trim()) {
      setUploadName(file.name.replace(/\.[^/.]+$/, ""));
    }
  }

  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showMessage("Please select an image.", "error");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      showMessage("Image must be under 5 MB.", "error");
      return;
    }

    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    setUploadImage(file);

    setImagePreview(URL.createObjectURL(file));
  }

  function cleanFileName(name: string) {
    return name
      .toLowerCase()
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  async function uploadSound() {
    if (!userId) return;

    if (!uploadAudio) {
      showMessage("Select an audio file first.", "error");
      return;
    }

    if (!uploadImage) {
      showMessage("Select a cover image first.", "error");
      return;
    }

    if (!uploadName.trim()) {
      showMessage("Enter a sound name.", "error");
      return;
    }

    // File type and size are validated before anything is uploaded. The
    // original flow sent whatever the picker returned, so a creator could put a
    // 200 MB file or an arbitrary type into the bucket.
    if (!ALLOWED_SOUND_MIME.includes(uploadAudio.type)) {
      showMessage(
        "Sounds must be MP3, WAV, OGG or WebM audio.",
        "error",
      );
      return;
    }
    if (uploadAudio.size > MAX_SOUND_BYTES) {
      showMessage(
        `Sounds must be under ${Math.round(MAX_SOUND_BYTES / 1024 / 1024)} MB.`,
        "error",
      );
      return;
    }
    if (!ALLOWED_IMAGE_MIME.includes(uploadImage.type)) {
      showMessage("Artwork must be a PNG, JPEG, WebP or GIF image.", "error");
      return;
    }
    if (uploadImage.size > MAX_IMAGE_BYTES) {
      showMessage(
        `Artwork must be under ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.`,
        "error",
      );
      return;
    }

    setUploading(true);

    try {
      const audioExtension = uploadAudio.name.split(".").pop()?.toLowerCase() || "mp3";

      const imageExtension = uploadImage.name.split(".").pop()?.toLowerCase() || "jpg";

      const safeName = cleanFileName(uploadName) || "sound";

      const audioPath = `${userId}/${crypto.randomUUID()}-${safeName}.${audioExtension}`;

      const imagePath = `${userId}/${crypto.randomUUID()}-${safeName}.${imageExtension}`;

      const { error: audioError } = await supabase.storage
        .from("soundboard-audio")
        .upload(audioPath, uploadAudio, {
          cacheControl: "3600",
          upsert: false,
          contentType: uploadAudio.type,
        });

      if (audioError) {
        showMessage(audioError.message, "error");

        setUploading(false);
        return;
      }

      const { error: imageError } = await supabase.storage
        .from("soundboard-images")
        .upload(imagePath, uploadImage, {
          cacheControl: "3600",
          upsert: false,
          contentType: uploadImage.type,
        });

      if (imageError) {
        await supabase.storage.from("soundboard-audio").remove([audioPath]);

        showMessage(imageError.message, "error");

        setUploading(false);
        return;
      }

      const nextSort =
        mySounds.reduce((max, item) => Math.max(max, Number(item.sort_order) || 0), 0) + 1;

      const { data, error } = await supabase
        .from("soundboard_sounds")
        .insert({
          creator_id: userId,
          name: uploadName.trim(),
          description: uploadDescription.trim() || "Creator uploaded sound",
          storage_path: audioPath,
          image_path: imagePath,
          category: "custom",
          enabled: true,
          sort_order: nextSort,
        })
        .select()
        .single();

      if (error) {
        await supabase.storage.from("soundboard-audio").remove([audioPath]);

        await supabase.storage.from("soundboard-images").remove([imagePath]);

        showMessage(error.message, "error");

        setUploading(false);
        return;
      }

      const uploadedSignedUrl = await getSignedAudioUrl(data.storage_path);

      setSounds((current) => [
        ...current,
        {
          ...data,
          isDefault: false,
          previewUrl: uploadedSignedUrl,
          imageUrl: imagePreview,
        },
      ]);

      setUploadName("");
      setUploadDescription("");
      setUploadAudio(null);
      setUploadImage(null);

      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }

      setImagePreview(null);

      const audioInput = document.getElementById("sound-audio") as HTMLInputElement | null;

      const imageInput = document.getElementById("sound-image") as HTMLInputElement | null;

      if (audioInput) {
        audioInput.value = "";
      }

      if (imageInput) {
        imageInput.value = "";
      }

      setActiveTab("my");

      showMessage("Sound uploaded successfully.", "success");
    } catch (error) {
      console.error(error);

      showMessage("Something went wrong while uploading.", "error");
    } finally {
      setUploading(false);
    }
  }

  if (loadError) {
    return <LoadError message={loadError} onRetry={() => void loadPage()} />;
  }

  if (loading) {
    return (
      <StreamLoader
        size="sm"
        messages={["Tuning your soundboard…", "Loading your sounds…", "Almost there…"]}
      />
    );
  }

  const tabIndex = activeTab === "memes" ? 0 : activeTab === "my" ? 1 : 2;

  return (
    <StudioShell
      active="Soundboard"
      session={userId ? { userId, creatorName: creatorName ?? "Creator", email } : null}
      eyebrow="Broadcast · Soundboard"
      title="Soundboard"
      subtitle="Build your visual soundboard with custom artwork and sounds viewers can trigger on stream."
      toast={message ? { text: message, tone: messageType === "success" ? "success" : "error" } : null}
      aside={
              <div className="flex items-center gap-3">
                <div className="snd-glass snd-glass-hover !rounded-3xl px-6 py-4">
                  <div className="snd-eyebrow !tracking-[.14em]">Viewer trigger</div>
  
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-3xl font-medium tracking-tight text-white">
                      ₹{creatorPrice}
                    </span>
  
                    <span className="snd-muted text-[11px]">min ₹{minimumPrice}</span>
                  </div>
                </div>
  
                <div className="snd-tile snd-float hidden h-[72px] w-[72px] !rounded-3xl lg:flex">
                  <Icon name="volume" size={28} />
                </div>
              </div>
      }
    >
      <style>{THEME_CSS}</style>
      <div className="snd-root">

          {/* MINI STATS */}
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <MiniStat
              label="Meme Library"
              value={defaultSounds.length}
              icon="bolt"
              color="var(--sl-accent)"
              delay={100}
            />

            <MiniStat
              label="Your Sounds"
              value={mySounds.length}
              icon="music"
              color="var(--sl-accent)"
              delay={170}
            />

            <MiniStat
              label="Active Sounds"
              value={mySounds.filter((sound) => sound.enabled).length}
              icon="volume"
              color="var(--sl-accent)"
              delay={240}
            />

            <MiniStat
              label="Favorites"
              value={favoriteSounds.length}
              icon="heart"
              color="var(--sl-accent)"
              delay={310}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
            {/* LIBRARY */}
            <section className="snd-glass snd-rise overflow-hidden" style={d(380)}>
              <div className="border-b border-white/10 p-5 md:p-7">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="snd-h2 !text-xl">Sound Library</h2>

                      <span className="snd-chip snd-chip-on !px-2.5 !py-0.5 !text-[10px]">
                        {filteredSounds.length}
                      </span>
                    </div>

                    <p className="snd-muted mt-1 text-xs">
                      Choose the sounds that appear on your stream.
                    </p>
                  </div>

                  <div className="relative w-full lg:w-[290px]">
                    <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#61758A]">
                      <Icon name="search" size={16} />
                    </div>

                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search sounds"
                      className="snd-field !rounded-full !py-3 !pl-11 !pr-4 !text-[13px]"
                    />
                  </div>
                </div>

                <div className="snd-tabs mt-6">
                  <div className="snd-tabs-inner">
                    <span
                      className="snd-tab-pill"
                      style={{ transform: `translateX(${tabIndex * 100}%)` }}
                    />

                    <Tab
                      active={activeTab === "memes"}
                      label="Viral Memes"
                      count={defaultSounds.length}
                      onClick={() => handleTabChange("memes")}
                    />

                    <Tab
                      active={activeTab === "my"}
                      label="My Sounds"
                      count={mySounds.length}
                      onClick={() => handleTabChange("my")}
                    />

                    <Tab
                      active={activeTab === "favorites"}
                      label="Favorites"
                      count={favoriteSounds.length}
                      onClick={() => handleTabChange("favorites")}
                    />
                  </div>
                </div>
              </div>

              <div className="p-5 md:p-7">
                {loading ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="snd-skel h-[230px]" />
                    ))}
                  </div>
                ) : filteredSounds.length === 0 ? (
                  <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
                    <div className="snd-tile snd-float mb-4 h-16 w-16 !rounded-3xl">
                      <Icon name="music" size={27} />
                    </div>

                    <h3 className="text-base font-medium text-white">No sounds here yet</h3>

                    <p className="snd-muted mt-2 max-w-xs text-xs leading-5">
                      Upload your own sound with a custom meme image.
                    </p>
                  </div>
                ) : (
                  <div key={activeTab} className="grid gap-4 md:grid-cols-2">
                    {filteredSounds.map((sound, index) => (
                      <SoundCard
                        key={sound.id}
                        index={Math.min(index, 12)}
                        sound={sound}
                        favorite={favoriteIds.includes(sound.id)}
                        playing={playingId === sound.id}
                        loading={loadingAudioId === sound.id}
                        mine={sound.creator_id === userId}
                        adding={addingDefault === sound.id}
                        deleting={deletingId === sound.id}
                        onPlay={() => previewSound(sound)}
                        onFavorite={() => toggleFavorite(sound.id)}
                        onAdd={() => addDefaultToBoard(sound)}
                        onToggle={() => toggleSound(sound)}
                        onDelete={() => deleteSound(sound)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* SIDE */}
            <aside className="space-y-5">
              <section className="snd-glass snd-rise p-5 md:p-6" style={d(450)}>
                <div className="mb-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="snd-tile h-12 w-12 !rounded-2xl">
                      <Icon name="upload" size={20} />
                    </div>

                    <span className="snd-chip snd-chip-violet !text-[10px]">10 MB audio</span>
                  </div>

                  <h2 className="snd-h2 !text-lg">Add your sound</h2>

                  <p className="snd-muted mt-1 text-xs leading-5">
                    Upload your own meme image and audio together.
                  </p>
                </div>

                <div className="space-y-4">
                  <Field label="Sound name">
                    <input
                      value={uploadName}
                      onChange={(e) => setUploadName(e.target.value)}
                      placeholder="Meowww Ghop Ghop"
                      className="snd-field"
                    />
                  </Field>

                  <Field label="Description">
                    <textarea
                      value={uploadDescription}
                      onChange={(e) => setUploadDescription(e.target.value)}
                      placeholder="Short description"
                      rows={3}
                      className="snd-field resize-none"
                    />
                  </Field>

                  <Field label="Soundboard image">
                    <label htmlFor="sound-image" className="snd-drop">
                      {imagePreview ? (
                        <div className="relative">
                          <img src={imagePreview} alt="" className="h-40 w-full object-cover" />

                          <div className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-2 text-[11px] font-semibold backdrop-blur">
                            Click to change image
                          </div>
                        </div>
                      ) : (
                        <div className="p-7 text-center">
                          <div className="snd-tile snd-float mx-auto mb-3 h-12 w-12 !rounded-2xl">
                            <Icon name="image" size={22} />
                          </div>

                          <div className="text-sm font-medium text-white">Choose meme image</div>

                          <div className="snd-muted mt-1 text-[11px]">JPG · PNG · WEBP · GIF</div>
                        </div>
                      )}

                      <input
                        id="sound-image"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={handleImageChange}
                        className="hidden"
                      />
                    </label>
                  </Field>

                  <Field label="Audio file">
                    <label htmlFor="sound-audio" className="snd-drop p-6 text-center">
                      <div className="snd-tile snd-float mx-auto mb-3 h-12 w-12 !rounded-2xl">
                        <Icon name="music" size={22} />
                      </div>

                      <div className="truncate text-sm font-medium text-white">
                        {uploadAudio ? uploadAudio.name : "Choose audio file"}
                      </div>

                      <div className="snd-muted mt-1 text-[11px]">MP3 · WAV · OGG · WEBM · MP4</div>

                      {uploadAudio && (
                        <div className="mt-3 text-[11px] font-semibold text-[#5EEAD4]">
                          {(uploadAudio.size / 1024 / 1024).toFixed(2)} MB selected
                        </div>
                      )}

                      <input
                        id="sound-audio"
                        type="file"
                        accept="audio/*"
                        onChange={handleAudioChange}
                        className="hidden"
                      />
                    </label>
                  </Field>

                  <button onClick={uploadSound} disabled={uploading} className="snd-btn-mint w-full">
                    {uploading ? (
                      <>
                        <span className="snd-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Icon name="upload" size={16} />
                        Upload Sound
                      </>
                    )}
                  </button>
                </div>
              </section>

              <section className="snd-glass snd-rise p-5 md:p-6" style={d(520)}>
                <div className="mb-5 flex items-center gap-3">
                  <div className="snd-tile h-11 w-11 !rounded-2xl">
                    <Icon name="bolt" size={18} />
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-white">Soundboard flow</h3>

                    <p className="snd-muted text-[11px]">Built for live interaction</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <Step
                    number="01"
                    title="Viewer picks a sound"
                    text="Your public page shows your active sound cards."
                  />

                  <Step
                    number="02"
                    title="Viewer pays"
                    text={`Soundboard starts from ₹${creatorPrice}.`}
                  />

                  <Step
                    number="03"
                    title="Sound triggers live"
                    text="The approved interaction reaches your stream."
                  />
                </div>
              </section>

              <div className="snd-panel snd-rise p-4" style={d(580)}>
                <p className="snd-muted text-[11px] leading-5">
                  Upload only audio and images you created yourself or have permission/licensing
                  to use.
                </p>
              </div>
            </aside>
          </div>
      </div>
    </StudioShell>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function SoundCard({
  sound,
  index,
  favorite,
  playing,
  loading = false,
  mine,
  adding,
  deleting,
  onPlay,
  onFavorite,
  onAdd,
  onToggle,
  onDelete,
}: {
  sound: Sound;
  index: number;
  favorite: boolean;
  playing: boolean;
  loading?: boolean;
  mine: boolean;
  adding: boolean;
  deleting: boolean;
  onPlay: () => void;
  onFavorite: () => void;
  onAdd: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(sound.imageUrl ?? null);

  const [imageLoading, setImageLoading] = useState(false);

  async function loadImage() {
    if (imageUrl || !sound.image_path || imageLoading) {
      return;
    }

    setImageLoading(true);

    try {
      const result = await getSupabaseBrowserClient()
        .storage.from("soundboard-images")
        .createSignedUrl(sound.image_path, 3600);

      if (result.data?.signedUrl) {
        setImageUrl(result.data.signedUrl);
      }
    } finally {
      setImageLoading(false);
    }
  }

  useEffect(() => {
    loadImage();
  }, [sound.image_path]);

  return (
    <div className={`snd-card group ${playing ? "snd-card-playing" : ""}`} style={idx(index)}>
      <div className="relative aspect-[16/8] overflow-hidden bg-[#0B1130]">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="snd-card-img h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[#61758A]">
            <Icon name="image" size={32} />
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-[#070B1F]/90 via-[#070B1F]/10 to-transparent" />

        <button
          onClick={onPlay}
          disabled={loading}
          className={`snd-play absolute left-3 top-3 ${playing ? "snd-play-on" : ""}`}
          title={loading ? "Loading preview..." : playing ? "Pause preview" : "Play preview"}
          aria-label={loading ? "Loading preview..." : playing ? "Pause preview" : "Play preview"}
        >
          {loading ? <span className="snd-spin" /> : playing ? <Icon name="pause" size={17} /> : <Icon name="play" size={17} />}
        </button>

        <button
          onClick={onFavorite}
          className={`snd-heart absolute right-3 top-3 ${favorite ? "snd-heart-on" : ""}`}
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
        >
          <span key={String(favorite)} className="snd-pop">
            <Icon name="heart" size={16} />
          </span>
        </button>

        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium text-white">{sound.name}</h3>

            <p className="mt-1 truncate text-[11px] text-white/65">
              {sound.description || "Meme sound"}
            </p>
          </div>

          {playing && (
            <div className="snd-eq shrink-0" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 p-3.5">
        {sound.isDefault ? (
          <>
            <span className="snd-chip snd-chip-violet !text-[9px] uppercase">StreamLounge</span>

            <button onClick={onAdd} disabled={adding} className="snd-btn-mint !px-4 !py-2 !text-[11px]">
              {adding ? "Adding..." : "Add to Board"}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className={`snd-status-dot ${sound.enabled ? "snd-status-on" : "snd-status-off"}`} />

              <span className="snd-muted text-[10px] font-semibold uppercase tracking-wider">
                {sound.enabled ? "Active" : "Disabled"}
              </span>
            </div>

            {mine && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onToggle}
                  className={`snd-icon-btn h-11 w-11 ${sound.enabled ? "!text-[#5EEAD4]" : ""}`}
                  title={sound.enabled ? "Disable" : "Enable"}
                  aria-label={sound.enabled ? "Disable sound" : "Enable sound"}
                >
                  <Icon name="power" size={17} />
                </button>

                <button
                  type="button"
                  onClick={onDelete}
                  disabled={deleting}
                  className="snd-icon-btn snd-icon-btn-danger h-11 w-11"
                  title="Delete"
                  aria-label="Delete sound"
                >
                  <Icon name="trash" size={17} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Tab({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`snd-tab ${active ? "snd-tab-active" : ""}`}
    >
      {label}

      <span className="snd-tab-count">{count}</span>
    </button>
  );
}

function CountUp({ value }: { value: number }) {
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
    const duration = 1000;
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

  return <>{Math.round(display)}</>;
}

function MiniStat({
  label,
  value,
  icon,
  color,
  delay,
}: {
  label: string;
  value: number;
  icon: "bolt" | "music" | "volume" | "heart";
  color: string;
  delay: number;
}) {
  return (
    <div
      className="snd-glass snd-stat snd-rise"
      style={{ ...d(delay), ["--accent" as string]: color } as CSSProperties}
    >
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <span className="snd-eyebrow !tracking-[.14em]">{label}</span>

          <div className="snd-stat-value mt-3">
            <CountUp value={value} />
          </div>
        </div>

        <div className="snd-stat-icon">
          <Icon name={icon} size={17} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="snd-label">{label}</label>

      {children}
    </div>
  );
}

function Step({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="snd-step">
      <span className="text-xs font-semibold text-[#5EEAD4]">{number}</span>

      <div>
        <div className="text-[13px] font-medium text-white">{title}</div>

        <div className="snd-muted mt-0.5 text-[11px] leading-4">{text}</div>
      </div>
    </div>
  );
}
