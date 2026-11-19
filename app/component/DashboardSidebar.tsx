"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/* ---------------------------------------------------------------
   Edit the hrefs here if any of your routes are different.
   --------------------------------------------------------------- */
const NAV = [
  { label: "Overview", icon: "home", href: "/dashboard" },
  { label: "Creator Page", icon: "sparkle", href: "/creator" },
  { label: "Interactions", icon: "bolt", href: "" }, // opens the interactions modal
  { label: "Earnings", icon: "rupee", href: "/dashboard/earnings" },
  { label: "Payouts", icon: "rupee", href: "/dashboard/payouts" },
  { label: "Analytics", icon: "analytics", href: "/dashboard/analytics" },
  { label: "Soundboard", icon: "sound", href: "/dashboard/soundboard" },
  { label: "Stream Kit", icon: "sparkle", href: "/dashboard/stream-kit" },
  { label: "Manage Interactions", icon: "settings", href: "/dashboard/interactions" },
];

/* Hidden from the sidebar UI only. The Interactions item and its code stay
   in place. To bring it back, remove "Interactions" from this list. */
const HIDDEN_NAV = ["Interactions"];

const NAV_ITEMS = NAV.filter((item) => !HIDDEN_NAV.includes(item.label));

const ITEM_H = 48; // px, must match h-12
const GAP = 4; // px, must match gap-1

type Props = {
  activeItem?: string;
  creatorName?: string;
  email?: string;
  onInteractionsClick?: () => void;
  onSignOut?: () => void;
  [key: string]: unknown;
};

export default function DashboardSidebar({
  activeItem = "Overview",
  creatorName = "Creator",
  email = "",
  onInteractionsClick,
  onSignOut,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  const activeIndex = NAV_ITEMS.findIndex(
    (item) => item.label.toLowerCase() === String(activeItem).toLowerCase()
  );

  const target = hover ?? activeIndex;

  function handleInteractions() {
    setOpen(false);

    if (onInteractionsClick) {
      onInteractionsClick();
    } else {
      router.push("/dashboard?modal=interactions");
    }
  }

  return (
    <>
      {/* mobile toggle */}
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="lg:hidden fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full bg-[#5EEAD4] text-[#04201C] flex items-center justify-center shadow-[0_10px_30px_rgba(94,234,212,0.35)]"
      >
        <NavIcon name={open ? "close" : "menu"} />
      </button>

      {open && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`sb-root fixed left-0 top-0 z-40 h-screen w-[250px] flex flex-col overflow-hidden border-r border-white/[0.07] bg-[#070B1F]/70 backdrop-blur-xl transition-transform duration-300 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* drifting light inside the sidebar */}
        <div className="pointer-events-none absolute -bottom-24 -left-20 w-72 h-72 rounded-full bg-[#7C5CFF]/25 blur-[80px] sb-drift-a" />
        <div className="pointer-events-none absolute -top-24 -right-24 w-60 h-60 rounded-full bg-[#5EEAD4]/[0.12] blur-[80px] sb-drift-b" />

        {/* LOGO */}
        <Link
          href="/"
          className="relative flex items-center gap-3 px-6 pt-7 pb-6"
        >
          <span className="sb-glow w-10 h-10 rounded-xl bg-gradient-to-br from-[#5EEAD4] to-[#7C5CFF] flex items-center justify-center text-[#04201C]">
            <NavIcon name="bolt" filled />
          </span>

          <span className="text-[22px] font-semibold tracking-[-0.04em] leading-none">
            Stream
            <span className="sb-shimmer bg-gradient-to-r from-[#A78BFA] via-[#5EEAD4] to-[#A78BFA] bg-clip-text text-transparent">
              Lounge
            </span>
          </span>
        </Link>

        <p className="relative px-6 pb-2 text-[10px] tracking-[0.22em] text-[#475569]">
          MENU
        </p>

        {/* NAV */}
        <nav
          className="relative px-3"
          onMouseLeave={() => setHover(null)}
        >
          <div className="relative flex flex-col gap-1">
            {/* sliding highlight */}
            <div
              className="pointer-events-none absolute left-0 top-0 w-full rounded-2xl border border-[#5EEAD4]/25 bg-gradient-to-r from-[#5EEAD4]/[0.14] via-[#7C5CFF]/[0.10] to-transparent"
              style={{
                height: ITEM_H,
                transform: `translateY(${Math.max(target, 0) * (ITEM_H + GAP)}px)`,
                opacity: target < 0 ? 0 : 1,
                transition:
                  "transform .4s cubic-bezier(.3,1.25,.4,1), opacity .25s",
              }}
            >
              <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-[#5EEAD4] shadow-[0_0_12px_#5EEAD4]" />
            </div>

            {NAV_ITEMS.map((item, i) => {
              const isActive = i === activeIndex;
              const isTarget = i === target;

              const inner = (
                <>
                  <span
                    className={`sb-icon transition-all duration-300 ${
                      isTarget
                        ? "text-[#5EEAD4] scale-110"
                        : "text-[#64748B]"
                    }`}
                  >
                    <NavIcon name={item.icon} />
                  </span>

                  <span
                    className={`transition-all duration-300 ${
                      isTarget
                        ? "text-white translate-x-0.5"
                        : "text-[#94A3B8]"
                    }`}
                  >
                    {item.label}
                  </span>

                  {isActive && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#5EEAD4] shadow-[0_0_10px_#5EEAD4] animate-pulse" />
                  )}
                </>
              );

              const cls =
                "sb-in relative z-10 flex h-12 w-full items-center gap-3.5 rounded-2xl px-4 text-[15px] text-left";

              const style = { animationDelay: `${0.08 + i * 0.06}s` };

              return item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  onMouseEnter={() => setHover(i)}
                  className={cls}
                  style={style}
                >
                  {inner}
                </Link>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  onClick={handleInteractions}
                  onMouseEnter={() => setHover(i)}
                  className={cls}
                  style={style}
                >
                  {inner}
                </button>
              );
            })}
          </div>
        </nav>

        {/* PROFILE */}
        <div className="relative mt-auto p-3">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md p-4">
            <div className="flex items-center gap-3">
              <div className="relative w-11 h-11 shrink-0">
                <span className="sb-ring absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,#5EEAD4,#7C5CFF,#A78BFA,#5EEAD4)]" />
                <span className="absolute inset-[2px] rounded-full bg-[#0B1130] flex items-center justify-center font-semibold">
                  {creatorName.charAt(0).toUpperCase()}
                </span>
              </div>

              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">
                  {creatorName}
                </p>

                <p className="text-[11px] text-[#64748B] truncate">
                  {email}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onSignOut}
              className="group mt-4 w-full flex items-center justify-between rounded-xl border border-white/10 px-4 py-2.5 text-sm text-[#94A3B8] transition hover:border-transparent hover:bg-[#5EEAD4] hover:text-[#04201C]"
            >
              Sign out
              <span className="transition-transform duration-300 group-hover:translate-x-1">
                →
              </span>
            </button>
          </div>
        </div>
      </aside>

      <style jsx global>{`
        @keyframes sbIn {
          from {
            opacity: 0;
            transform: translateX(-18px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }

        @keyframes sbShimmer {
          0% {
            background-position: 0% 50%;
          }
          100% {
            background-position: 200% 50%;
          }
        }

        @keyframes sbGlow {
          0%,
          100% {
            box-shadow: 0 6px 22px rgba(94, 234, 212, 0.25);
          }
          50% {
            box-shadow: 0 6px 34px rgba(124, 92, 255, 0.55);
          }
        }

        @keyframes sbSpin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes sbDriftA {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(70px, -60px, 0) scale(1.18);
          }
        }

        @keyframes sbDriftB {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(-60px, 70px, 0) scale(1.12);
          }
        }

        .sb-in {
          animation: sbIn 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) backwards;
        }
        .sb-shimmer {
          background-size: 200% 100%;
          animation: sbShimmer 4s linear infinite;
        }
        .sb-glow {
          animation: sbGlow 3.5s ease-in-out infinite;
        }
        .sb-ring {
          animation: sbSpin 6s linear infinite;
        }
        .sb-drift-a {
          animation: sbDriftA 16s ease-in-out infinite;
        }
        .sb-drift-b {
          animation: sbDriftB 20s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .sb-in,
          .sb-shimmer,
          .sb-glow,
          .sb-ring,
          .sb-drift-a,
          .sb-drift-b {
            animation: none !important;
          }
        }
      `}</style>
    </>
  );
}

/* ---------------------------------------------------------------
   ICONS
   --------------------------------------------------------------- */

function NavIcon({
  name,
  filled = false,
}: {
  name: string;
  filled?: boolean;
}) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: filled ? "currentColor" : "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 11.5L12 4l9 7.5" />
          <path d="M5.5 10v9.5h13V10" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...common}>
          <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
          <path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z" />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common}>
          <path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" />
        </svg>
      );
    case "rupee":
      return (
        <svg {...common}>
          <path d="M7 5h10M7 9.5h10M7 5h2.5a4.25 4.25 0 010 8.5H7l7 6.5" />
        </svg>
      );
    case "analytics":
      return (
        <svg {...common}>
          <path d="M5 20v-8M12 20V5M19 20v-5" />
        </svg>
      );
    case "sound":
      return (
        <svg {...common}>
          <path d="M11 5L6.5 9H3v6h3.5L11 19z" />
          <path d="M15 9a4 4 0 010 6M18 6.5a8 8 0 010 11" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
          <circle cx="15" cy="7" r="2" />
          <circle cx="9" cy="17" r="2" />
        </svg>
      );
    case "menu":
      return (
        <svg {...common}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
    case "close":
      return (
        <svg {...common}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
    default:
      return null;
  }
}
