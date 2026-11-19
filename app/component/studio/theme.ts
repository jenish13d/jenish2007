/* Shared studio theme for new dashboard pages. Derived verbatim from the
   Soundboard page theme (class prefix snd- renamed to st-) so new screens
   match the existing StreamLounge design exactly. */
export const STUDIO_CSS = `
@property --st-angle { syntax: "<angle>"; initial-value: 0deg; inherits: false; }

.st-root {
  position: relative; isolation: isolate; min-height: 100vh; color: #F4F7FB;
  font-family: var(--font-geist-sans), Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  letter-spacing: -0.011em; -webkit-font-smoothing: antialiased;
  background:
    radial-gradient(ellipse at 18% 32%, rgba(124,92,255,.20), transparent 55%),
    radial-gradient(ellipse at 88% 78%, rgba(94,234,212,.09), transparent 50%),
    #070B1F;
  background-attachment: fixed;
}
.st-main { position: relative; z-index: 1; min-width: 0; }

/* ---------- ambient background ---------- */
.st-ambient { position: fixed; inset: 0; overflow: hidden; pointer-events: none; z-index: 0; contain: paint; }
.st-orb { position: absolute; border-radius: 50%; filter: blur(130px); will-change: transform; }
.st-orb-1 { width: 34rem; height: 34rem; top: 8rem; left: -14rem; background: #7C5CFF; opacity: .28; animation: st-drift-a 30s ease-in-out infinite alternate; }
.st-orb-2 { width: 28rem; height: 28rem; bottom: -8rem; right: -9rem; background: #4F46E5; opacity: .26; animation: st-drift-b 34s ease-in-out infinite alternate; }
.st-orb-3 { width: 18rem; height: 18rem; top: 22%; right: 18%; background: #5EEAD4; opacity: .12; animation: st-drift-b 28s ease-in-out infinite alternate-reverse; }
.st-grid { position: absolute; inset: 0; opacity: .05; background-image: linear-gradient(rgba(199,210,254,.2) 1px, transparent 1px), linear-gradient(90deg, rgba(199,210,254,.2) 1px, transparent 1px); background-size: 62px 62px; mask-image: linear-gradient(to bottom, black, transparent 80%); animation: st-grid 14s ease-in-out infinite alternate; }
.st-beam { position: absolute; top: -10rem; width: 1px; height: 56rem; transform: rotate(32deg); transform-origin: top; opacity: .08; background: linear-gradient(to bottom, transparent, #5EEAD4, transparent); animation: st-sway 26s ease-in-out infinite alternate; }
.st-beam-1 { left: 30%; }
.st-beam-2 { right: 24%; background: linear-gradient(to bottom, transparent, #A78BFA, transparent); animation-direction: alternate-reverse; }
@keyframes st-drift-a { from { transform: translate3d(0,0,0) scale(1); } to { transform: translate3d(90px,70px,0) scale(1.12); } }
@keyframes st-drift-b { from { transform: translate3d(0,0,0) scale(1); } to { transform: translate3d(-80px,-60px,0) scale(1.1); } }
@keyframes st-grid { from { opacity: .06; transform: translateY(0); } to { opacity: .13; transform: translateY(12px); } }
@keyframes st-sway { from { transform: rotate(28deg) translateX(-20px); opacity: .06; } to { transform: rotate(38deg) translateX(30px); opacity: .2; } }

/* ---------- entrance ---------- */
@keyframes st-rise { from { opacity: 0; transform: translate3d(0,26px,0) scale(.985); filter: blur(8px); } to { opacity: 1; transform: none; filter: none; } }
.st-rise { animation: st-rise .95s cubic-bezier(.16,1,.3,1) backwards; animation-delay: calc(var(--d, 0) * 1ms); }

/* ---------- type ---------- */
.st-eyebrow { display: inline-flex; align-items: center; gap: 10px; font-size: 11px; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; color: #9FB0C6; }
.st-dot { width: 7px; height: 7px; border-radius: 999px; background: #5EEAD4; box-shadow: 0 0 14px rgba(94,234,212,.85); animation: st-blip 2s ease-out infinite; }
@keyframes st-blip { 0% { box-shadow: 0 0 0 0 rgba(94,234,212,.6), 0 0 14px rgba(94,234,212,.85); } 80%,100% { box-shadow: 0 0 0 9px rgba(94,234,212,0), 0 0 14px rgba(94,234,212,.85); } }
.st-h1 { font-size: clamp(2.5rem, 5.4vw, 4rem); line-height: 1; letter-spacing: -.05em; font-weight: 500; color: #fff; }
.st-grad { background: linear-gradient(90deg, #cfc6fa 0%, #a995f2 55%, #8e7cea 100%); -webkit-background-clip: text; background-clip: text; color: transparent; background-size: 200% 100%; animation: st-grad-move 9s ease-in-out infinite alternate; }
@keyframes st-grad-move { from { background-position: 0% 50%; } to { background-position: 100% 50%; } }
.st-h2 { font-size: 1.15rem; font-weight: 500; letter-spacing: -.03em; color: #fff; }
.st-muted { color: #9FB0C6; }
.st-label { display: block; margin-bottom: 8px; font-size: 11px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: #9FB0C6; }

/* ---------- surfaces ---------- */
.st-glass { position: relative; background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.1); backdrop-filter: blur(18px); border-radius: 28px; transition: transform .5s cubic-bezier(.2,.8,.2,1), border-color .4s ease, box-shadow .5s ease, background-color .4s ease; }
.st-glass-hover:hover { border-color: rgba(94,234,212,.3); box-shadow: 0 22px 60px rgba(4,10,35,.28), 0 0 34px rgba(124,92,255,.12); }
.st-tile { display: flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 18px; color: #5EEAD4; background: rgba(94,234,212,.1); border: 1px solid rgba(94,234,212,.28); }
.st-chip { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 5px 12px; font-size: 11px; font-weight: 600; letter-spacing: .04em; }
.st-chip-on { color: #5EEAD4; background: rgba(94,234,212,.1); border: 1px solid rgba(94,234,212,.25); }
.st-chip-violet { color: #B9AEF0; background: rgba(167,139,250,.1); border: 1px solid rgba(167,139,250,.25); }
.st-panel { border-radius: 20px; border: 1px solid rgba(255,255,255,.09); background: rgba(255,255,255,.035); }
.st-float { animation: st-float 5.5s ease-in-out infinite; }
@keyframes st-float { 0%,100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-4px) rotate(-3deg); } }

/* ---------- buttons / fields ---------- */
.st-btn-mint, .st-btn-ghost { position: relative; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; gap: 10px; border-radius: 999px; font-weight: 600; transition: transform .4s cubic-bezier(.2,.8,.2,1), box-shadow .4s ease, border-color .3s ease, background-color .3s ease, opacity .3s ease; }
.st-btn-mint { padding: 14px 24px; font-size: 14px; color: #04201C; background: #5EEAD4; box-shadow: 0 12px 40px rgba(94,234,212,.28); }
.st-btn-mint:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 16px 50px rgba(94,234,212,.42); }
.st-btn-mint:active:not(:disabled) { transform: scale(.985); }
.st-btn-mint:disabled { opacity: .5; cursor: not-allowed; box-shadow: none; }
.st-btn-mint::after { content: ""; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 32%, rgba(255,255,255,.55) 50%, transparent 68%); transform: translateX(-130%); pointer-events: none; }
.st-btn-mint:hover:not(:disabled)::after { animation: st-sheen .85s ease; }
@keyframes st-sheen { to { transform: translateX(130%); } }
.st-btn-ghost { padding: 11px 18px; font-size: 13px; color: #F4F7FB; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.14); }
.st-btn-ghost:hover:not(:disabled) { border-color: rgba(94,234,212,.55); background: rgba(255,255,255,.09); transform: translateY(-1px); }
.st-icon-btn { display: inline-flex; align-items: center; justify-content: center; border-radius: 16px; color: #B8C7D6; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); transition: transform .35s cubic-bezier(.2,.8,.2,1), border-color .3s ease, color .3s ease, background-color .3s ease, opacity .3s ease; }
.st-icon-btn:hover:not(:disabled) { color: #fff; border-color: rgba(94,234,212,.5); background: rgba(255,255,255,.09); transform: translateY(-2px); }
.st-icon-btn-danger:hover:not(:disabled) { color: #fb7185; border-color: rgba(251,113,133,.5); }
.st-icon-btn:disabled { opacity: .4; cursor: not-allowed; }
.st-field { width: 100%; border-radius: 16px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.05); padding: 13px 16px; color: #fff; font-size: 14px; font-weight: 500; outline: none; transition: border-color .3s ease, box-shadow .3s ease; }
.st-field::placeholder { color: #61758A; }
.st-field:focus { border-color: rgba(94,234,212,.7); box-shadow: 0 0 0 3px rgba(94,234,212,.12); }
.st-drop { display: block; cursor: pointer; overflow: hidden; border-radius: 20px; border: 1px dashed rgba(255,255,255,.2); background: rgba(255,255,255,.03); transition: border-color .35s ease, background-color .35s ease, transform .35s cubic-bezier(.2,.8,.2,1); }
.st-drop:hover { border-color: rgba(94,234,212,.6); background: rgba(94,234,212,.05); transform: translateY(-2px); }

/* ---------- tabs ---------- */
.st-tabs { position: relative; padding: 4px; border-radius: 18px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); }
.st-tabs-inner { position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.st-tab-pill { position: absolute; left: 0; top: 0; width: 33.3333%; height: 100%; border-radius: 14px; background: linear-gradient(120deg, rgba(94,234,212,.2), rgba(124,92,255,.28)); border: 1px solid rgba(94,234,212,.45); box-shadow: 0 0 22px rgba(94,234,212,.2); transition: transform .55s cubic-bezier(.34,1.3,.64,1); }
.st-tab { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 8px; font-size: 12px; font-weight: 600; color: #9FB0C6; white-space: nowrap; transition: color .3s ease; }
.st-tab:hover { color: #fff; }
.st-tab-active { color: #fff; }
.st-tab-count { border-radius: 999px; padding: 1px 7px; font-size: 10px; background: rgba(255,255,255,.08); }
.st-tab-active .st-tab-count { background: rgba(94,234,212,.2); color: #5EEAD4; }

/* ---------- stat cards ---------- */
.st-stat { --accent: #5EEAD4; overflow: hidden; padding: 20px; border-radius: 24px; }
.st-stat:hover { transform: translateY(-4px); border-color: color-mix(in srgb, var(--accent) 55%, transparent); }
.st-stat::before { content: ""; position: absolute; width: 160px; height: 160px; right: -60px; top: -70px; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--accent) 32%, transparent), transparent 68%); animation: st-breathe 6s ease-in-out infinite; pointer-events: none; }
.st-stat::after { content: ""; position: absolute; left: 20px; right: 20px; bottom: 0; height: 2px; border-radius: 2px; background: linear-gradient(90deg, var(--accent), transparent); opacity: .7; transform-origin: left; animation: st-line 1.4s cubic-bezier(.16,1,.3,1) .6s backwards; }
@keyframes st-breathe { 0%,100% { transform: scale(1); opacity: .75; } 50% { transform: scale(1.18); opacity: 1; } }
@keyframes st-line { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.st-stat-icon { display: flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 13px; color: var(--accent); background: color-mix(in srgb, var(--accent) 13%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 32%, transparent); animation: st-float 5.5s ease-in-out infinite; }
.st-stat-value { font-size: 2rem; font-weight: 500; letter-spacing: -.05em; color: #fff; font-variant-numeric: tabular-nums; }

/* ---------- sound cards ---------- */
.st-card { position: relative; overflow: hidden; border-radius: 24px; background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.1); backdrop-filter: blur(18px); animation: st-card-in .85s cubic-bezier(.16,1,.3,1) backwards; animation-delay: calc(var(--i, 0) * 60ms + 120ms); transition: transform .45s cubic-bezier(.2,.8,.2,1), border-color .4s ease, box-shadow .45s ease, background-color .4s ease; }
.st-card:hover { transform: translateY(-5px); border-color: rgba(94,234,212,.4); background: rgba(255,255,255,.07); box-shadow: 0 24px 60px rgba(4,10,35,.34), 0 0 34px rgba(124,92,255,.16); }
@keyframes st-card-in { from { opacity: 0; transform: translate3d(0,34px,0) scale(.95); filter: blur(8px); } to { opacity: 1; transform: none; filter: none; } }
.st-card-playing { border-color: rgba(94,234,212,.55); background: rgba(94,234,212,.06); box-shadow: 0 0 40px rgba(94,234,212,.2); }
.st-card-playing::after { content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1.5px; pointer-events: none; background: conic-gradient(from var(--st-angle), transparent 0 55%, #5EEAD4 74%, #A78BFA 88%, transparent 100%); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); mask-composite: exclude; animation: st-spin 3.6s linear infinite; }
@keyframes st-spin { to { --st-angle: 360deg; } }
.st-card-img { transition: transform .8s cubic-bezier(.16,1,.3,1); }
.st-card:hover .st-card-img { transform: scale(1.06); }
.st-play { position: relative; display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: 999px; color: #fff; background: rgba(8,16,34,.62); border: 1px solid rgba(255,255,255,.2); backdrop-filter: blur(10px); transition: transform .35s cubic-bezier(.34,1.56,.64,1), background-color .3s ease, color .3s ease; }
.st-play:hover:not(:disabled) { transform: scale(1.12); background: #5EEAD4; color: #04201C; }
.st-play-on { background: #5EEAD4; color: #04201C; border-color: transparent; }
.st-play-on::before { content: ""; position: absolute; inset: 0; border-radius: inherit; border: 2px solid #5EEAD4; animation: st-ping 1.6s ease-out infinite; }
@keyframes st-ping { 0% { transform: scale(1); opacity: .8; } 100% { transform: scale(1.7); opacity: 0; } }
.st-heart { display: flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 999px; color: #fff; background: rgba(8,16,34,.55); border: 1px solid rgba(255,255,255,.18); backdrop-filter: blur(10px); transition: transform .35s cubic-bezier(.34,1.56,.64,1), color .3s ease; }
.st-heart:hover { transform: scale(1.12); }
.st-heart-on { color: #F472B6; border-color: rgba(244,114,182,.45); }
.st-pop { display: inline-flex; animation: st-pop .55s cubic-bezier(.34,1.56,.64,1); }
@keyframes st-pop { 0% { transform: scale(.5); } 60% { transform: scale(1.35); } 100% { transform: scale(1); } }
.st-eq { display: flex; align-items: flex-end; gap: 3px; height: 18px; }
.st-eq span { width: 3px; border-radius: 2px; background: #5EEAD4; box-shadow: 0 0 8px rgba(94,234,212,.6); animation: st-eq 1s ease-in-out infinite; }
.st-eq span:nth-child(1) { animation-delay: -.2s; }
.st-eq span:nth-child(2) { animation-delay: -.5s; }
.st-eq span:nth-child(3) { animation-delay: -.1s; }
.st-eq span:nth-child(4) { animation-delay: -.7s; }
@keyframes st-eq { 0%,100% { height: 20%; } 50% { height: 100%; } }
.st-status-dot { width: 7px; height: 7px; border-radius: 999px; }
.st-status-on { background: #5EEAD4; box-shadow: 0 0 10px rgba(94,234,212,.8); animation: st-blip 2s ease-out infinite; }
.st-status-off { background: #475569; }

/* ---------- skeleton ---------- */
.st-skel { position: relative; overflow: hidden; border-radius: 24px; background: rgba(255,255,255,.05); }
.st-skel::after { content: ""; position: absolute; inset: 0; transform: translateX(-100%); background: linear-gradient(90deg, transparent, rgba(255,255,255,.09), transparent); animation: st-shimmer 1.6s ease-in-out infinite; }
@keyframes st-shimmer { to { transform: translateX(100%); } }

/* ---------- toast ---------- */
.st-toast { position: fixed; top: 24px; left: 50%; z-index: 80; display: flex; align-items: center; gap: 10px; max-width: calc(100vw - 32px); padding: 13px 20px; border-radius: 999px; font-size: 13px; font-weight: 500; backdrop-filter: blur(20px); box-shadow: 0 20px 60px rgba(2,8,24,.5); animation: st-toast-in .6s cubic-bezier(.34,1.4,.64,1) both; }
.st-toast-success { color: #5EEAD4; background: rgba(10,40,48,.88); border: 1px solid rgba(94,234,212,.4); }
.st-toast-error { color: #fda4af; background: rgba(48,14,28,.88); border: 1px solid rgba(251,113,133,.4); }
@keyframes st-toast-in { from { opacity: 0; transform: translate(-50%, -24px) scale(.94); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }

/* ---------- steps ---------- */
.st-step { display: flex; gap: 14px; padding: 14px; border-radius: 18px; background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.08); transition: transform .35s cubic-bezier(.2,.8,.2,1), border-color .3s ease; }
.st-step:hover { transform: translateX(4px); border-color: rgba(94,234,212,.4); }

/* ---------- spinner ---------- */
.st-spin { width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(255,255,255,.3); border-top-color: currentColor; animation: st-rot .8s linear infinite; }
@keyframes st-rot { to { transform: rotate(360deg); } }

.st-root button:focus-visible { outline: 2px solid rgba(94,234,212,.8); outline-offset: 3px; }

@media (prefers-reduced-motion: reduce) {
  .st-root *, .st-root *::before, .st-root *::after, .st-toast { animation: none !important; transition-duration: .01ms !important; }
}
`;
