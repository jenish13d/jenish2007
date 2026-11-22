"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import ConnectionsPanel from "@/app/dashboard/stream-kit/ConnectionsPanel";
import { StudioShell, Toggle, apiJson, useStudioSession, useUiTheme } from "@/app/component/studio/StudioShell";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const NOTIFY_KEY = "sl-notify";
type NotifyPrefs = { browser: boolean; sound: boolean };

export default function SettingsClient() {
  const { session, authError, retryAuth } = useStudioSession("/dashboard/settings");
  const [theme, setTheme] = useUiTheme();
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const notify = useCallback((text: string, tone: "success" | "error") => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const [boardOptIn, setBoardOptIn] = useState<boolean | null>(null);
  const [n, setN] = useState<NotifyPrefs>({ browser: false, sound: true });

  useEffect(() => {
    if (!session) return;
    apiJson<{ preferences: { leaderboard_opt_in?: boolean } | null }>("/api/creator/preferences").then((r) => {
      if (r.ok) setBoardOptIn(Boolean(r.data.preferences?.leaderboard_opt_in));
    });
    try {
      const saved = JSON.parse(window.localStorage.getItem(NOTIFY_KEY) || "null");
      if (saved && typeof saved === "object") setN({ browser: Boolean(saved.browser), sound: saved.sound !== false });
    } catch {
      /* ignore */
    }
  }, [session]);

  function saveNotify(next: NotifyPrefs) {
    setN(next);
    try {
      window.localStorage.setItem(NOTIFY_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  async function changePassword() {
    if (pw.next.length < 10) return notify("Use at least 10 characters.", "error");
    if (pw.next !== pw.confirm) return notify("The passwords don't match.", "error");
    setPwBusy(true);
    const { error } = await getSupabaseBrowserClient().auth.updateUser({ password: pw.next });
    setPwBusy(false);
    if (error) return notify(error.message, "error");
    setPw({ next: "", confirm: "" });
    notify("Password updated.", "success");
  }

  async function setBoard(value: boolean) {
    setBoardOptIn(value);
    const r = await apiJson("/api/creator/preferences", { method: "PATCH", body: JSON.stringify({ leaderboard_opt_in: value }) });
    if (!r.ok) {
      setBoardOptIn(!value);
      notify(r.error, "error");
    }
  }

  async function signOutEverywhere() {
    await getSupabaseBrowserClient().auth.signOut({ scope: "global" });
    window.location.href = "/login";
  }

  return (
    <StudioShell
      active="Settings"
      session={session}
      authError={authError}
      onRetry={retryAuth}
      eyebrow="Account · Settings"
      title="Settings"
      subtitle="Account, security, notifications, privacy and connected platforms."
      toast={toast}
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Account">
          <dl className="space-y-3 text-[13.5px]">
            <Row k="Email" v={session?.email ?? ""} />
            <Row k="Display name" v={session?.creatorName ?? ""} />
            <Row k="Public page" v={session?.username ? `/c/${session.username}` : "Not set"} />
          </dl>
          <div className="mt-5 flex items-center justify-between gap-4 border-t pt-4" style={{ borderColor: "var(--sl-line)" }}>
            <span className="text-[13.5px] font-medium">Studio theme</span>
            <div className="sl-seg" role="group" aria-label="Studio theme">
              <button type="button" aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>Dark</button>
              <button type="button" aria-pressed={theme === "light"} onClick={() => setTheme("light")}>Light</button>
            </div>
          </div>
        </Card>

        <Card title="Security">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="sl-label">New password</span><input className="sl-input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></label>
            <label className="block"><span className="sl-label">Confirm password</span><input className="sl-input" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="sl-btn sl-btn-primary" onClick={changePassword} disabled={pwBusy || !pw.next}>Update password</button>
            <button type="button" className="sl-btn" onClick={signOutEverywhere}>Sign out of all devices</button>
          </div>
          <p className="sl-hint">Your overlay URL is a separate secret. Rotate it in Stream Setup if it was ever shown on screen.</p>
        </Card>

        <Card title="Notifications" subtitle="Stored on this device.">
          <Toggle label="Browser notification for new superchats" hint="While the studio is open in this browser." checked={n.browser}
            onChange={async (v) => {
              if (v && typeof Notification !== "undefined" && Notification.permission !== "granted") {
                const p = await Notification.requestPermission();
                if (p !== "granted") return notify("Notifications are blocked in this browser.", "error");
              }
              saveNotify({ ...n, browser: v });
            }} />
          <Toggle label="Sound in the studio" hint="A soft chime in the studio when a superchat arrives." checked={n.sound} onChange={(v) => saveNotify({ ...n, sound: v })} />
        </Card>

        <Card title="Privacy">
          <Toggle label="Appear on LoungeBoard" hint="Off by default. Shows your page in public rankings, with only the coarse location you choose." checked={Boolean(boardOptIn)} disabled={boardOptIn === null} onChange={setBoard} />
          <p className="sl-hint">Supporters&apos; accounts are never shown to you or to other viewers; only the name they choose appears.</p>
        </Card>

        <div className="lg:col-span-2">
          <ConnectionsPanel notify={notify} />
          <p className="sl-faint mt-3 text-[12px]">
            YouTube doesn&apos;t need a connection: stream to YouTube as usual with the StreamLounge overlay in OBS or Streamlabs.
          </p>
        </div>
      </div>
    </StudioShell>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="sl-card sl-in">
      <header className="sl-card-head"><div><h2 className="sl-h3">{title}</h2>{subtitle && <p className="sl-muted mt-1 text-[12.5px]">{subtitle}</p>}</div></header>
      <div className="sl-card-body">{children}</div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4"><dt className="sl-muted">{k}</dt><dd className="truncate">{v}</dd></div>;
}
