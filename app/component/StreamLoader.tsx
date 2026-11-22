"use client";

import { useEffect, useState } from "react";

import { LogoMark } from "@/app/component/ui/icons";

const DEFAULT_MESSAGES = ["Loading"];

/** Quiet full-screen loader: the mark, a hairline progress sweep, one line of copy. */
export default function StreamLoader({
  messages = DEFAULT_MESSAGES,
}: {
  messages?: string[];
  size?: "md" | "sm";
}) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (messages.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % messages.length), 1900);
    return () => clearInterval(id);
  }, [messages.length]);

  return (
    <div className="sl flex min-h-screen flex-col items-center justify-center gap-5" role="status" aria-live="polite" aria-label="Loading">
      <LogoMark size={30} />
      <div className="relative h-px w-40 overflow-hidden" style={{ background: "var(--sl-line-2)" }}>
        <span className="sl-loader-sweep" />
      </div>
      <p className="sl-kicker">{messages[index] ?? "Loading"}</p>
      <style>{`.sl-loader-sweep{position:absolute;inset:0;width:40%;background:linear-gradient(90deg,transparent,var(--sl-accent),transparent);animation:sl-sweep 1.3s cubic-bezier(.4,0,.2,1) infinite}@keyframes sl-sweep{from{transform:translateX(-100%)}to{transform:translateX(260%)}}@media (prefers-reduced-motion:reduce){.sl-loader-sweep{animation:none;width:100%;opacity:.4}}`}</style>
    </div>
  );
}
