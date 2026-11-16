"use client";

import { useEffect, useState } from "react";

/* Optional rotating words under the loader (small and quiet). */
const DEFAULT_MESSAGES = ["Loading"];

/*
  StreamLoader: a single "going live" signal.
  One glowing dot at the centre, broadcast rings drifting outward from it.
  Same props as before, so every page that already uses it keeps working.
*/
export default function StreamLoader({
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
