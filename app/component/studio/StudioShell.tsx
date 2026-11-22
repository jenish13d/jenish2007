"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import LoadError from "@/app/component/LoadError";
import StreamLoader from "@/app/component/StreamLoader";
import { Icon, LogoMark, type IconName } from "@/app/component/ui/icons";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { loginUrl, resolveClientAuth } from "@/lib/supabase/client-auth";

/**
 * The creator studio frame: sidebar navigation, top bar, theme, footer.
 * Every creator screen renders inside it, so the product reads as one system.
 */

export function d(ms: number): CSSProperties {
  return { ["--d" as string]: ms } as CSSProperties;
}

export type StudioSession = { userId: string; creatorName: string; email: string; username?: string | null };

export function useStudioSession(nextPath: string) {
  const router = useRouter();
  const [session, setSession] = useState<StudioSession | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const auth = await resolveClientAuth();
      if (cancelled) return;
      if (auth.status === "signed_out") {
        router.replace(loginUrl(nextPath));
        return;
      }
      if (auth.status === "error") {
        setAuthError(auth.message);
        return;
      }
      let creatorName = "Creator";
      let username: string | null = null;
      try {
        const { data: profile } = await getSupabaseBrowserClient()
          .from("creator_profiles")
          .select("creator_name, username")
          .eq("id", auth.user.id)
          .maybeSingle();
        creatorName = profile?.creator_name || creatorName;
        username = profile?.username || null;
      } catch {
        // Cosmetic only; never block the page on it.
      }
      if (!cancelled) setSession({ userId: auth.user.id, creatorName, email: auth.user.email || "", username });
    })();
    return () => {
      cancelled = true;
    };
  }, [router, nextPath, attempt]);

  const retryAuth = useCallback(() => {
    setAuthError(null);
    setAttempt((n) => n + 1);
  }, []);

  return { session, authError, retryAuth };
}

/* ------------------------------------------------------------------ theme */

export type UiTheme = "dark" | "light";
const THEME_KEY = "sl-theme";

export function useUiTheme(): [UiTheme, (t: UiTheme) => void] {
  const [theme, setThemeState] = useState<UiTheme>("dark");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(THEME_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage once
      if (saved === "light" || saved === "dark") setThemeState(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);
  const setTheme = useCallback((t: UiTheme) => {
    setThemeState(t);
    try {
      window.localStorage.setItem(THEME_KEY, t);
    } catch {
      /* storage unavailable */
    }
    // Best effort: remember it on the account too.
    void fetch("/api/creator/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ ui_theme: t }),
    }).catch(() => undefined);
  }, []);
  return [theme, setTheme];
}

/* ---------------------------------------------------------- notifications */

/**
 * While the studio is open, checks for new superchats every 30 seconds (one
 * single-row read under RLS) and, per the creator's device preferences in
 * Settings, shows a browser notification and/or plays a soft chime.
 */
function useSuperchatNotifier(userId: string | null) {
  useEffect(() => {
    if (!userId) return;
    let prefs = { browser: false, sound: true };
    try {
      const saved = JSON.parse(window.localStorage.getItem("sl-notify") || "null");
      if (saved && typeof saved === "object") prefs = { browser: Boolean(saved.browser), sound: saved.sound !== false };
    } catch {
      /* ignore */
    }
    if (!prefs.browser && !prefs.sound) return;
    let last: string | null = null;
    let stopped = false;
    const check = async () => {
      if (document.hidden && !prefs.browser) return;
      const { data } = await getSupabaseBrowserClient()
        .from("payments")
        .select("id, display_name, amount_paise, captured_at")
        .eq("creator_id", userId)
        .order("captured_at", { ascending: false })
        .limit(1);
      const top = data?.[0];
      if (stopped || !top) return;
      if (last && top.id !== last) {
        const text = `${top.display_name} sent ${formatRupees(top.amount_paise)}`;
        if (prefs.browser && typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("New superchat", { body: text, tag: top.id });
        }
        if (prefs.sound) chime();
      }
      last = top.id;
    };
    void check();
    const id = window.setInterval(() => void check(), 30_000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [userId]);
}

function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.55);
    o.onended = () => void ctx.close();
  } catch {
    /* audio unavailable */
  }
}

/* ------------------------------------------------------------- navigation */

type NavItem = { label: string; href: string; icon: IconName; match?: string[] };
const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: "Studio",
    items: [
      { label: "Overview", href: "/dashboard", icon: "overview" },
      { label: "Superchats", href: "/dashboard/superchats", icon: "chat" },
      { label: "Manage Interactions", href: "/dashboard/interactions", icon: "sliders" },
    ],
  },
  {
    title: "Broadcast",
    items: [
      { label: "Stream Setup", href: "/dashboard/stream-kit", icon: "broadcast", match: ["Stream Kit"] },
      { label: "Soundboard", href: "/dashboard/soundboard", icon: "wave" },
    ],
  },
  {
    title: "Brand",
    items: [{ label: "Customization", href: "/dashboard/customize", icon: "palette", match: ["Creator Page"] }],
  },
  {
    title: "Money",
    items: [
      { label: "Finance", href: "/dashboard/finance", icon: "wallet", match: ["Earnings", "Analytics"] },
      { label: "Payouts", href: "/dashboard/payouts", icon: "bank" },
    ],
  },
  {
    title: "Account",
    items: [{ label: "Settings", href: "/dashboard/settings", icon: "settings" }],
  },
];

function isActive(item: NavItem, active: string, pathname: string | null) {
  if (item.label === active || item.match?.includes(active)) return true;
  if (!pathname) return false;
  return item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
}

export function StudioShell({
  active,
  session,
  eyebrow,
  title,
  accent,
  subtitle,
  aside,
  toast,
  authError,
  onRetry,
  children,
}: {
  active: string;
  session: StudioSession | null;
  authError?: string | null;
  onRetry?: () => void;
  eyebrow: string;
  title: string;
  accent?: string;
  subtitle?: string;
  aside?: ReactNode;
  toast?: { text: string; tone: "success" | "error" } | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [theme, setTheme] = useUiTheme();
  const [navOpen, setNavOpen] = useState(false);
  useSuperchatNotifier(session?.userId ?? null);

  if (authError) return <LoadError message={authError} onRetry={onRetry ?? (() => window.location.reload())} />;
  if (!session) return <StreamLoader messages={["Opening your studio"]} />;

  const initials = (session.creatorName || "C").trim().slice(0, 1).toUpperCase();

  return (
    <div className="sl st-root" data-theme={theme}>
      <div className="sl-app">
        <aside className="sl-side" data-open={navOpen} aria-label="Studio navigation">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="sl-brand">
              <LogoMark />
              <span className="sl-wordmark">STREAMLOUNGE</span>
            </Link>
            <button type="button" className="sl-icon-btn lg:hidden" aria-label="Close navigation" onClick={() => setNavOpen(false)}>
              <Icon name="close" />
            </button>
          </div>

          <nav className="sl-nav">
            {NAV.map((group) => (
              <div key={group.title} className="sl-nav-group">
                <p className="sl-nav-title">{group.title}</p>
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive(item, active, pathname) ? "page" : undefined}
                    onClick={() => setNavOpen(false)}
                  >
                    <Icon name={item.icon} />
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>

          <div className="sl-side-foot">
            <div className="flex items-center gap-3 px-2 py-1">
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-medium"
                style={{ background: "var(--sl-surface-3)", color: "var(--sl-fg)", border: "1px solid var(--sl-line)" }}
              >
                {initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{session.creatorName}</span>
                <span className="sl-faint block truncate text-[11.5px]">{session.email}</span>
              </span>
              <button
                type="button"
                className="sl-icon-btn"
                aria-label="Sign out"
                title="Sign out"
                onClick={async () => {
                  await getSupabaseBrowserClient().auth.signOut();
                  router.push("/login");
                }}
              >
                <Icon name="logout" />
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="sl-topbar">
            <div className="flex min-w-0 items-center gap-2">
              <button type="button" className="sl-icon-btn sl-mobile-nav" aria-label="Open navigation" onClick={() => setNavOpen(true)}>
                <Icon name="menu" />
              </button>
              <span className="sl-kicker truncate">{eyebrow}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {session.username && (
                <a className="sl-btn sl-btn-sm hidden sm:inline-flex" href={`/c/${session.username}`} target="_blank" rel="noreferrer">
                  View public page <Icon name="external" size={13} />
                </a>
              )}
              <button
                type="button"
                className="sl-icon-btn"
                aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                title={theme === "dark" ? "Light theme" : "Dark theme"}
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                <Icon name={theme === "dark" ? "sun" : "moon"} />
              </button>
            </div>
          </header>

          {toast && (
            <div key={toast.text + toast.tone} role="status" aria-live="polite" className="sl-toast" data-tone={toast.tone}>
              {toast.text}
            </div>
          )}

          <main className="st-main flex-1">
            <div className="sl-page">
              <div className="sl-page-head sl-in">
                <div className="max-w-2xl">
                  <h1 className="sl-h1">
                    {title}
                    {accent ? <span className="sl-faint"> {accent}</span> : null}
                  </h1>
                  {subtitle && <p className="sl-body sl-muted mt-2.5">{subtitle}</p>}
                </div>
                {aside}
              </div>
              {children}
            </div>
          </main>

          <footer className="sl-app-foot">
            <span>© {new Date().getFullYear()} StreamLounge · Powered by Lumvik Solutions</span>
            <span className="flex gap-4">
              <Link href="/legal/terms">Terms</Link>
              <Link href="/legal/privacy">Privacy</Link>
              <Link href="/legal/fees">Fees</Link>
              <Link href="/company">Company</Link>
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  delay = 0,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  delay?: number;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="sl-card sl-in overflow-hidden" style={d(delay)}>
      <div className="flex items-start justify-between gap-4 px-5 pt-5 md:px-6">
        <div>
          <h2 className="sl-h3">{title}</h2>
          {subtitle && <p className="sl-muted mt-1 text-[13px] leading-5">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="p-5 md:p-6">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  delay = 0,
}: {
  label: string;
  value: string;
  hint?: string;
  color?: string;
  delay?: number;
}) {
  return (
    <div className="sl-card sl-in p-5" style={d(delay)}>
      <div className="sl-stat-label">{label}</div>
      <div className="sl-stat-value">{value}</div>
      {hint && <p className="sl-stat-hint">{hint}</p>}
    </div>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <span>
        <span className="block text-[13.5px] font-medium">{label}</span>
        {hint && <span className="sl-muted mt-0.5 block text-[12.5px] leading-5">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="sl-switch mt-0.5"
      />
    </div>
  );
}

export function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export async function apiJson<T>(
  input: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const response = await fetch(input, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      credentials: "same-origin",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.success === false) {
      return { ok: false, error: body?.error?.message || body?.error || "Something went wrong." };
    }
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, error: "Network error. Check your connection." };
  }
}
