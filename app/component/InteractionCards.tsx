"use client";

import { useEffect, useState, type CSSProperties } from "react";

type Interaction = {
  id: string;
  interaction_type: string;
  enabled: boolean;
  price: number;
  settings: Record<string, unknown>;
};

/* Hidden from the UI only. */
const HIDDEN_INTERACTIONS = ["stickers"];

const interactionInfo: Record<
  string,
  {
    icon: string;
    title: string;
    subtitle: string;
    color: string;
  }
> = {
  text: {
    icon: "T",
    title: "Text",
    subtitle: "Send a message",
    color: "#4D8AFF",
  },

  audio: {
    icon: "🎙",
    title: "Audio",
    subtitle: "Send your voice",
    color: "#6CCEB0",
  },

  soundboard: {
    icon: "🔊",
    title: "Soundboard",
    subtitle: "Play a sound",
    color: "#54A388",
  },

  stickers: {
    icon: "✦",
    title: "Stickers",
    subtitle: "Drop a sticker",
    color: "#6CCEB0",
  },

  spin_wheel: {
    icon: "◉",
    title: "Spin the Wheel",
    subtitle: "Spin and challenge",
    color: "#4D8AFF",
  },

  tasks: {
    icon: "⚡",
    title: "Tasks",
    subtitle: "Challenge creator",
    color: "#54A388",
  },
};

/* Cards grow to fill space smoothly across grid breakpoints */
const CARD_BASIS =
  "grow basis-[calc(50%-6px)] lg:basis-[calc(25%-9px)]";

export default function InteractionCards() {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadInteractions() {
      try {
        const response = await fetch("/api/interactions", {
          cache: "no-store",
        });

        const result = await response.json();

        if (result.success) {
          setInteractions(result.interactions || []);
        }
      } catch (error) {
        console.error("INTERACTIONS LOAD ERROR:", error);
      } finally {
        setLoading(false);
      }
    }

    loadInteractions();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-wrap gap-3 font-sans">
        {[1, 2, 3, 4].map((item) => (
          <div
            key={item}
            className={`${CARD_BASIS} min-h-[132px] rounded-2xl border border-[#4D8AFF]/15 bg-[#0A2137]/40 backdrop-blur-md animate-pulse`}
          />
        ))}
      </div>
    );
  }

  const enabledInteractions = interactions.filter(
    (interaction) =>
      interaction.enabled &&
      !HIDDEN_INTERACTIONS.includes(interaction.interaction_type)
  );

  if (enabledInteractions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#4D8AFF]/20 bg-[#0A2137]/30 backdrop-blur-md p-6 font-sans">
        <p className="text-sm font-semibold tracking-tight text-[#FFFFFF]">
          No interactions available
        </p>

        <p className="text-xs text-[#6CCEB0]/80 mt-1">
          The creator has not enabled any interactions yet.
        </p>
      </div>
    );
  }

  return (
    <div className="font-sans">
      <div className="flex flex-wrap gap-3">
        {enabledInteractions.map((interaction, index) => {
          const info =
            interactionInfo[interaction.interaction_type];

          if (!info) return null;

          return (
            <div
              key={interaction.id}
              onMouseMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                e.currentTarget.style.setProperty(
                  "--mx",
                  `${e.clientX - r.left}px`
                );
                e.currentTarget.style.setProperty(
                  "--my",
                  `${e.clientY - r.top}px`
                );
              }}
              style={
                {
                  "--ic": `${info.color}`,
                  animationDelay: `${0.06 + index * 0.05}s`,
                } as CSSProperties
              }
              className={`ic-card group relative overflow-hidden rounded-2xl border border-[#4D8AFF]/20 bg-[#0A2137]/60 backdrop-blur-xl p-4 min-h-[132px] transition-all duration-300 ease-out hover:-translate-y-1.5 hover:border-[var(--ic)] hover:shadow-xl hover:shadow-[var(--ic)]/10 ${CARD_BASIS}`}
            >
              {/* Dynamic Cursor Spotlight Effect */}
              <div
                className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ease-out"
                style={{
                  background: `radial-gradient(220px circle at var(--mx, 50%) var(--my, 50%), ${info.color}20, transparent 75%)`,
                }}
              />

              {/* Smooth Hover Light Reflection */}
              <span className="ic-shine pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0" />

              {/* Accent Line Highlight */}
              <div
                className="absolute top-0 inset-x-4 h-[1.5px] opacity-70 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                  background: `linear-gradient(90deg, transparent, ${info.color}, transparent)`,
                }}
              />

              <div className="relative flex h-full flex-col">
                <div className="flex items-start justify-between">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-semibold border transition-all duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3"
                    style={{
                      color: info.color,
                      backgroundColor: `${info.color}14`,
                      borderColor: `${info.color}33`,
                      boxShadow: `0 0 18px ${info.color}20`,
                    }}
                  >
                    {info.icon}
                  </div>

                  <span className="text-[10px] font-mono tracking-[0.2em] text-[#6CCEB0]/60">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>

                <p className="font-semibold tracking-tight text-[15px] text-[#FFFFFF] mt-3.5">
                  {info.title}
                </p>

                <p className="text-[11px] text-[#6CCEB0]/80 mt-0.5">
                  {info.subtitle}
                </p>

                <div className="mt-auto pt-3 flex items-center justify-between">
                  <span className="rounded-full border border-[#4D8AFF]/30 bg-[#4D8AFF]/10 px-3 py-0.5 text-xs font-semibold text-[#4D8AFF] transition-colors duration-300 group-hover:border-[#4D8AFF]/50 group-hover:bg-[#4D8AFF]/20">
                    ₹{interaction.price}
                  </span>

                  <span className="text-sm font-semibold text-[#4D8AFF] opacity-0 -translate-x-1 translate-y-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0">
                    ↗
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <style jsx global>{`
        @keyframes icCardIn {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes icShine {
          from {
            transform: translateX(0) skewX(-12deg);
          }
          to {
            transform: translateX(550%) skewX(-12deg);
          }
        }

        .ic-card {
          animation: icCardIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) backwards;
          font-family: "Neue Haas Grotesk", "Helvetica Neue", -apple-system, BlinkMacSystemFont, sans-serif;
        }

        .ic-card:hover .ic-shine {
          opacity: 1;
          animation: icShine 0.85s cubic-bezier(0.4, 0, 0.2, 1);
        }

        @media (prefers-reduced-motion: reduce) {
          .ic-card,
          .ic-card:hover .ic-shine {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}