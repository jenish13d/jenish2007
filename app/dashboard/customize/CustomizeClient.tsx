"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { StudioShell, apiJson, useStudioSession } from "@/app/component/studio/StudioShell";
import { Icon } from "@/app/component/ui/icons";
import { ACCENTS, DEFAULT_PAGE_STYLE, resolvePageStyle, type AccentId, type PageStyleResolved } from "@/lib/creator/page-style";
import { OVERLAY_THEMES } from "@/lib/overlay/themes";

type Profile = {
  creator_name: string;
  username: string | null;
  bio: string | null;
  profile_image_url: string | null;
  banner_image_url: string | null;
  public_page_enabled: boolean;
  overlay_theme: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  youtube_url: string | null;
  twitch_url: string | null;
  kick_url: string | null;
  discord_url: string | null;
};

const SOCIALS: [keyof Profile, string][] = [
  ["youtube_url", "YouTube channel"],
  ["twitch_url", "Twitch"],
  ["kick_url", "Kick"],
  ["instagram_url", "Instagram"],
  ["twitter_url", "X"],
  ["discord_url", "Discord"],
];

const THEME_NAME: Record<string, string> = { emerald: "Emerald", crimson: "Crimson", violet: "Violet", "cyber-blue": "Cyber Blue", gold: "Gold", rose: "Rose" };

export default function CustomizeClient() {
  const { session, authError, retryAuth } = useStudioSession("/dashboard/customize");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initial, setInitial] = useState<Profile | null>(null);
  const [style, setStyle] = useState<PageStyleResolved>(DEFAULT_PAGE_STYLE);
  const [styleAvailable, setStyleAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const notify = useCallback((text: string, tone: "success" | "error") => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    Promise.all([
      apiJson<{ profile: Profile }>("/api/creator/profile"),
      apiJson<{ preferences: { page_style?: unknown } | null }>("/api/creator/preferences"),
    ]).then(([p, prefs]) => {
      if (!alive) return;
      if (p.ok) {
        setProfile(p.data.profile);
        setInitial(p.data.profile);
      } else notify(p.error, "error");
      if (prefs.ok) {
        const raw = prefs.data.preferences?.page_style;
        setStyleAvailable(raw !== undefined);
        setStyle(resolvePageStyle(raw));
      }
    });
    return () => { alive = false; };
  }, [session, notify]);

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setProfile((p) => (p ? { ...p, [k]: v } : p));

  async function save() {
    if (!profile || !initial) return;
    setBusy(true);
    const changed: Record<string, unknown> = {};
    for (const key of ["creator_name", "username", "bio", "profile_image_url", "banner_image_url", "public_page_enabled", ...SOCIALS.map((s) => s[0])] as (keyof Profile)[]) {
      if (profile[key] !== initial[key]) changed[key] = typeof profile[key] === "string" ? (profile[key] as string).trim() : profile[key] ?? "";
    }
    const tasks: Promise<{ ok: boolean; error?: string }>[] = [];
    if (Object.keys(changed).length) tasks.push(apiJson("/api/creator/profile", { method: "PATCH", body: JSON.stringify(changed) }));
    if (profile.overlay_theme && profile.overlay_theme !== initial.overlay_theme)
      tasks.push(apiJson("/api/creator/theme", { method: "POST", body: JSON.stringify({ theme: profile.overlay_theme }) }));
    if (styleAvailable) tasks.push(apiJson("/api/creator/preferences", { method: "PATCH", body: JSON.stringify({ page_style: style }) }));
    const results = await Promise.all(tasks);
    setBusy(false);
    const failed = results.find((r) => !r.ok);
    if (failed) return notify(failed.error || "Some changes were not saved.", "error");
    setInitial(profile);
    notify("Your page is updated.", "success");
  }

  return (
    <StudioShell
      active="Customization"
      session={session}
      authError={authError}
      onRetry={retryAuth}
      eyebrow="Brand · Customization"
      title="Customization"
      subtitle="Your public page, how it looks, and how alerts appear on stream."
      toast={toast}
      aside={
        <div className="flex gap-2">
          {profile?.username && <a className="sl-btn" href={`/c/${profile.username}`} target="_blank" rel="noreferrer">Preview <Icon name="external" size={13} /></a>}
          <button type="button" className="sl-btn sl-btn-primary" onClick={save} disabled={busy || !profile}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      }
    >
      {!profile ? (
        <div className="sl-grid">{[0, 1].map((i) => <div key={i} className="sl-span-6 sl-skel h-72" />)}</div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            <Section title="Profile" subtitle="Shown at the top of your public page.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Display name"><input className="sl-input" maxLength={60} value={profile.creator_name ?? ""} onChange={(e) => set("creator_name", e.target.value)} /></Field>
                <Field label="Username" hint={profile.username ? `Your page: /c/${profile.username}` : "3–30 letters, numbers or underscores."}>
                  <div className="sl-input-group"><span className="sl-addon">/c/</span><input className="sl-input" maxLength={30} value={profile.username ?? ""} onChange={(e) => set("username", e.target.value.replace(/[^A-Za-z0-9_]/g, ""))} /></div>
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Bio" hint={`${(profile.bio ?? "").length}/500`}><textarea className="sl-textarea" maxLength={500} rows={3} value={profile.bio ?? ""} onChange={(e) => set("bio", e.target.value)} /></Field>
                </div>
                <Field label="Profile image URL" hint="https:// link to a square image."><input className="sl-input" value={profile.profile_image_url ?? ""} onChange={(e) => set("profile_image_url", e.target.value)} placeholder="https://" /></Field>
                <Field label="Banner image URL" hint="https:// link, wide image (3:1 works well)."><input className="sl-input" value={profile.banner_image_url ?? ""} onChange={(e) => set("banner_image_url", e.target.value)} placeholder="https://" /></Field>
              </div>
              <div className="mt-5 flex items-center justify-between gap-4 border-t pt-4" style={{ borderColor: "var(--sl-line)" }}>
                <span>
                  <span className="block text-[13.5px] font-medium">Public page</span>
                  <span className="sl-muted text-[12.5px]">When off, your page and QR code show as unavailable.</span>
                </span>
                <button type="button" role="switch" aria-checked={profile.public_page_enabled} aria-label="Public page" className="sl-switch" onClick={() => set("public_page_enabled", !profile.public_page_enabled)} />
              </div>
            </Section>

            <Section title="Social links" subtitle="Shown as quiet links under your bio. Must start with https://">
              <div className="grid gap-4 sm:grid-cols-2">
                {SOCIALS.map(([key, label]) => (
                  <Field key={key} label={label}><input className="sl-input" value={(profile[key] as string | null) ?? ""} onChange={(e) => set(key, e.target.value as never)} placeholder="https://" /></Field>
                ))}
              </div>
            </Section>

            <Section title="Page appearance" subtitle={styleAvailable ? "Theme, accent and the superchat amounts offered to viewers." : "Available once the latest database update is applied."}>
              <fieldset disabled={!styleAvailable} className="space-y-5">
                <Choice label="Theme">
                  <Seg value={style.theme} options={[["dark", "Dark"], ["light", "Light"]]} onChange={(v) => setStyle((s) => ({ ...s, theme: v }))} />
                </Choice>
                <Choice label="Accent">
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(ACCENTS) as AccentId[]).map((id) => (
                      <button key={id} type="button" aria-pressed={style.accent === id} onClick={() => setStyle((s) => ({ ...s, accent: id }))}
                        className="sl-btn sl-btn-sm" style={style.accent === id ? { borderColor: "var(--sl-fg)" } : undefined}>
                        <span className="h-3 w-3 rounded-full" style={{ background: ACCENTS[id].hex }} /> {ACCENTS[id].name}
                      </button>
                    ))}
                  </div>
                </Choice>
                <Choice label="Layout">
                  <Seg value={style.layout} options={[["editorial", "Editorial"], ["centered", "Centered"], ["compact", "Compact"]]} onChange={(v) => setStyle((s) => ({ ...s, layout: v }))} />
                </Choice>
                <Choice label="Superchat button">
                  <Seg value={style.button} options={[["solid", "Solid"], ["outline", "Outline"]]} onChange={(v) => setStyle((s) => ({ ...s, button: v }))} />
                </Choice>
                <Choice label="Typography">
                  <Seg value={style.font} options={[["sans", "Sans"], ["mono", "Mono accents"]]} onChange={(v) => setStyle((s) => ({ ...s, font: v }))} />
                </Choice>
                <Choice label="Quick amounts (₹)">
                  <input className="sl-input max-w-sm" value={style.amounts.join(", ")}
                    onChange={(e) => setStyle((s) => ({ ...s, amounts: e.target.value.split(/[ ,]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 500000).slice(0, 6) }))} />
                </Choice>
                <Choice label="QR on page">
                  <button type="button" role="switch" aria-checked={style.show_qr} aria-label="Show QR code on page" className="sl-switch" onClick={() => setStyle((s) => ({ ...s, show_qr: !s.show_qr }))} />
                </Choice>
              </fieldset>
            </Section>

            <Section title="Alert theme" subtitle="The frame used for superchat alerts in your OBS and Streamlabs overlay. Fine-tune alert timing and the announcer in Manage Interactions.">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {OVERLAY_THEMES.map((t) => (
                  <button key={t} type="button" aria-pressed={profile.overlay_theme === t} onClick={() => set("overlay_theme", t)}
                    className="sl-well flex items-center gap-3 p-3 text-left text-[13px]" style={profile.overlay_theme === t ? { borderColor: "var(--sl-accent)" } : undefined}>
                    <img src={`/overlay/frames/${t}.png`} alt="" className="h-8 w-12 rounded object-cover" />
                    {THEME_NAME[t] ?? t}
                  </button>
                ))}
              </div>
            </Section>
          </div>

          <aside className="xl:sticky xl:top-20 xl:self-start">
            <p className="sl-kicker mb-3">Live preview</p>
            <PagePreview profile={profile} style={style} />
          </aside>
        </div>
      )}
    </StudioShell>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="sl-card sl-in">
      <header className="sl-card-head"><div><h2 className="sl-h3">{title}</h2>{subtitle && <p className="sl-muted mt-1 text-[13px]">{subtitle}</p>}</div></header>
      <div className="sl-card-body">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="sl-label">{label}</span>
      {children}
      {hint && <span className="sl-hint block">{hint}</span>}
    </label>
  );
}

function Choice({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid items-center gap-2 sm:grid-cols-[170px_1fr]">
      <span className="sl-label !mb-0">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="sl-seg" role="group">
      {options.map(([v, l]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

function PagePreview({ profile, style }: { profile: Profile; style: PageStyleResolved }) {
  const accent = ACCENTS[style.accent];
  return (
    <div data-theme={style.theme} className="overflow-hidden rounded-[14px] border" style={{ borderColor: "var(--sl-line-2)", background: "var(--sl-bg)", color: "var(--sl-fg)" }}>
      <div className="h-20" style={{ background: profile.banner_image_url ? `center/cover url("${profile.banner_image_url.replace(/"/g, "")}")` : "linear-gradient(120deg, var(--sl-surface-3), var(--sl-bg-1))" }} />
      <div className={`px-5 pb-5 ${style.layout === "centered" ? "text-center" : ""}`}>
        <div className={`-mt-7 h-14 w-14 overflow-hidden rounded-full border-2 ${style.layout === "centered" ? "mx-auto" : ""}`} style={{ borderColor: "var(--sl-bg)", background: "var(--sl-surface-3)" }}>
          {profile.profile_image_url && <img src={profile.profile_image_url} alt="" className="h-full w-full object-cover" />}
        </div>
        <p className="mt-3 text-[17px] font-medium tracking-[-0.02em]">{profile.creator_name || "Your name"}</p>
        <p className={`sl-muted text-[12px] ${style.font === "mono" ? "sl-mono" : ""}`}>@{profile.username || "username"}</p>
        {profile.bio && <p className="sl-muted mt-2 line-clamp-2 text-[12.5px]">{profile.bio}</p>}
        <div className={`mt-4 flex flex-wrap gap-1.5 ${style.layout === "centered" ? "justify-center" : ""}`}>
          {style.amounts.slice(0, 4).map((a, i) => (
            <span key={a} className="rounded-md border px-2.5 py-1 text-[12px]" style={i === 1 ? { borderColor: accent.hex, color: accent.hex } : { borderColor: "var(--sl-line-2)" }}>₹{a}</span>
          ))}
        </div>
        <div className="mt-3 rounded-md border px-3 py-2 text-[12px]" style={{ borderColor: "var(--sl-line-2)", color: "var(--sl-faint)" }}>Say something nice…</div>
        <div className="mt-3 grid h-9 place-items-center rounded-md text-[12.5px] font-medium"
          style={style.button === "solid" ? { background: accent.hex, color: accent.ink } : { border: `1px solid ${accent.hex}`, color: accent.hex }}>
          Send superchat
        </div>
      </div>
    </div>
  );
}
