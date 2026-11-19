"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import DashboardSidebar from "@/app/component/DashboardSidebar";
import StreamLoader from "@/app/component/StreamLoader";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

import { STUDIO_CSS } from "./theme";

/**
 * Shared frame for new creator-studio pages. It reuses the existing
 * Soundboard page's visual system (ambient background, glass panels, rise
 * animations, sidebar) so every new screen looks native to StreamLounge.
 */

export function d(ms: number): CSSProperties {
  return { ["--d" as string]: ms } as CSSProperties;
}

export type StudioSession = { userId: string; creatorName: string; email: string };

/** Loads the signed-in creator, redirecting to /login when there is none. */
export function useStudioSession(nextPath: string) {
  const router = useRouter();
  const [session, setSession] = useState<StudioSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
        return;
      }
      const { data: profile } = await supabase
        .from("creator_profiles")
        .select("creator_name")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!cancelled) {
        setSession({
          userId: data.user.id,
          creatorName: profile?.creator_name || "Creator",
          email: data.user.email || "",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, nextPath]);

  return session;
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
  children,
}: {
  active: string;
  session: StudioSession | null;
  eyebrow: string;
  title: string;
  accent: string;
  subtitle: string;
  aside?: ReactNode;
  toast?: { text: string; tone: "success" | "error" } | null;
  children: ReactNode;
}) {
  const router = useRouter();

  if (!session) {
    return <StreamLoader size="sm" messages={["Opening your studio…", "Almost there…"]} />;
  }

  return (
    <div className="st-root">
      <style>{STUDIO_CSS}</style>
      <div className="st-ambient" aria-hidden="true">
        <span className="st-orb st-orb-1" />
        <span className="st-orb st-orb-2" />
        <span className="st-orb st-orb-3" />
        <span className="st-grid" />
        <span className="st-beam st-beam-1" />
        <span className="st-beam st-beam-2" />
      </div>

      <DashboardSidebar
        activeItem={active}
        creatorName={session.creatorName}
        email={session.email}
        onSignOut={async () => {
          await getSupabaseBrowserClient().auth.signOut();
          router.push("/login");
        }}
      />

      {toast && (
        <div
          key={toast.text + toast.tone}
          role="status"
          aria-live="polite"
          className={`st-toast ${toast.tone === "success" ? "st-toast-success" : "st-toast-error"}`}
        >
          {toast.text}
        </div>
      )}

      <main className="st-main lg:pl-[250px]">
        <div className="mx-auto max-w-[1500px] px-5 py-7 md:px-8 lg:px-10">
          <header className="st-rise mb-8 flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between" style={d(0)}>
            <div>
              <p className="st-eyebrow">
                <span className="st-dot" />
                {eyebrow}
              </p>
              <h1 className="st-h1 mt-5">
                {title} <span className="st-grad">{accent}</span>
              </h1>
              <p className="st-muted mt-3 max-w-xl text-base leading-7">{subtitle}</p>
            </div>
            {aside}
          </header>
          {children}
        </div>
      </main>
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
    <section className="st-glass st-rise overflow-hidden" style={d(delay)}>
      <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5 md:px-7">
        <div>
          <h2 className="st-h2 !text-xl">{title}</h2>
          {subtitle && <p className="st-muted mt-1 text-sm leading-6">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="p-5 md:p-7">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  color = "#5EEAD4",
  delay = 0,
}: {
  label: string;
  value: string;
  hint?: string;
  color?: string;
  delay?: number;
}) {
  return (
    <div className="st-glass st-stat st-rise" style={{ ...d(delay), ["--accent" as string]: color } as CSSProperties}>
      <span className="st-eyebrow !tracking-[.14em]">{label}</span>
      <div className="st-stat-value mt-3">{value}</div>
      {hint && <p className="st-muted mt-1 text-[11px] leading-4">{hint}</p>}
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
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span>
        <span className="block text-sm font-medium text-white">{label}</span>
        {hint && <span className="st-muted mt-0.5 block text-xs leading-5">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition ${
          checked ? "border-[#5EEAD4]/40 bg-[#5EEAD4]/25" : "border-white/15 bg-white/[0.06]"
        } disabled:opacity-50`}
      >
        <span
          className={`absolute top-0.5 h-[18px] w-[18px] rounded-full transition-all ${
            checked ? "left-[22px] bg-[#5EEAD4]" : "left-0.5 bg-white/60"
          }`}
        />
      </button>
    </label>
  );
}

export function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export async function apiJson<T>(input: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
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
