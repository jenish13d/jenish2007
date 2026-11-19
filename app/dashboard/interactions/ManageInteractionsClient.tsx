"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Panel,
  StudioShell,
  Toggle,
  apiJson,
  formatRupees,
  useStudioSession,
} from "@/app/component/studio/StudioShell";
import { INTERACTION_DEFINITIONS, INTERACTION_TYPES, type InteractionType } from "@/lib/interactions/registry";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { buildAnnouncement } from "@/lib/announcer/announce";

type Preferences = {
  message_max_length: number;
  alert_duration_ms: number;
  alert_position: string;
  show_amount: boolean;
  show_sender: boolean;
  animated_alerts_enabled: boolean;
  sound_alerts_enabled: boolean;
  emoji_reactions_enabled: boolean;
  announcer_enabled: boolean;
  announcer_muted: boolean;
  announcer_voice: string;
  announcer_rate: number;
  announcer_volume: number;
  announcer_read_emojis: boolean;
  announcer_read_message: boolean;
  announcer_min_paise: number;
  leaderboard_opt_in: boolean;
  location_city: string | null;
  location_district: string | null;
  location_state: string | null;
  location_country: string | null;
  location_continent: string | null;
};

type Platform = {
  message_limit_default: number;
  message_limit_min: number;
  message_limit_max: number;
  platform_fee_bps: number;
  gateway_fee_bearer: "platform" | "creator";
};

type InteractionRow = {
  interaction_type: InteractionType;
  enabled: boolean;
  price: number;
  settings: { options?: string[]; tasks?: string[] } | null;
};

const POSITIONS = [
  "top-left", "top-center", "top-right",
  "center",
  "bottom-left", "bottom-center", "bottom-right",
] as const;

export default function ManageInteractionsClient() {
  const { session, authError, retryAuth } = useStudioSession("/dashboard/interactions");
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [rows, setRows] = useState<InteractionRow[]>([]);
  const [minimums, setMinimums] = useState<Record<string, number>>({});
  const [dirtyPrefs, setDirtyPrefs] = useState<Partial<Preferences>>({});
  const [dirtyPricing, setDirtyPricing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [voices, setVoices] = useState<string[]>([]);

  const notify = useCallback((text: string, tone: "success" | "error") => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const [prefRes, interactionsRes, pricingRes] = await Promise.all([
        apiJson<{ preferences: Preferences; platform: Platform }>("/api/creator/preferences"),
        supabase.from("creator_interactions").select("interaction_type, enabled, price, settings").eq("creator_id", session.userId),
        supabase.from("interaction_pricing").select("interaction_type, minimum_price"),
      ]);
      if (prefRes.ok) {
        setPrefs(prefRes.data.preferences);
        setPlatform(prefRes.data.platform);
      } else {
        notify(prefRes.error, "error");
      }
      const mins: Record<string, number> = {};
      const pricingRows = (pricingRes.data ?? []) as { interaction_type: string; minimum_price: number | string }[];
      for (const p of pricingRows) mins[p.interaction_type] = Number(p.minimum_price);
      setMinimums(mins);
      const existingRows = (interactionsRes.data ?? []) as InteractionRow[];
      const existing = new Map<string, InteractionRow>(existingRows.map((r: InteractionRow) => [r.interaction_type, r]));
      setRows(
        INTERACTION_TYPES.map((type) =>
          existing.get(type) ?? {
            interaction_type: type,
            enabled: false,
            price: mins[type] ?? INTERACTION_DEFINITIONS[type].fallbackMinimumPrice,
            settings: {},
          },
        ),
      );
    })();
  }, [session, notify]);

  // Voices the browser offers; OBS uses the same engine as the overlay page.
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices().map((v) => v.name).slice(0, 60));
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const view = useMemo(() => (prefs ? { ...prefs, ...dirtyPrefs } : null), [prefs, dirtyPrefs]);
  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    setDirtyPrefs((current) => ({ ...current, [key]: value }));

  function creatorReceives(rupees: number): number {
    if (!platform) return Math.round(rupees * 100);
    const gross = Math.round(rupees * 100);
    const fee = Math.round((gross * platform.platform_fee_bps) / 10000);
    // Gateway fees are estimated at 2.36% only for this preview; the ledger uses Razorpay's actual fee.
    const gateway = platform.gateway_fee_bearer === "creator" ? Math.round(gross * 0.0236) : 0;
    return gross - fee - gateway;
  }

  async function save() {
    if (!view) return;
    setSaving(true);
    let ok = true;
    if (Object.keys(dirtyPrefs).length > 0) {
      const res = await apiJson<{ preferences: Preferences }>("/api/creator/preferences", {
        method: "PATCH",
        body: JSON.stringify(dirtyPrefs),
      });
      if (res.ok) {
        setPrefs(res.data.preferences);
        setDirtyPrefs({});
      } else {
        ok = false;
        notify(res.error, "error");
      }
    }
    if (ok && dirtyPricing) {
      const res = await apiJson<{ interactions: InteractionRow[] }>("/api/creator/interactions", {
        method: "PUT",
        body: JSON.stringify({
          interactions: rows.map((r) => ({
            interaction_type: r.interaction_type,
            enabled: r.enabled,
            price: r.price,
            ...(r.interaction_type === "spin_wheel" ? { options: r.settings?.options ?? [] } : {}),
            ...(r.interaction_type === "tasks" ? { tasks: r.settings?.tasks ?? [] } : {}),
          })),
        }),
      });
      if (res.ok) setDirtyPricing(false);
      else {
        ok = false;
        notify(res.error, "error");
      }
    }
    setSaving(false);
    if (ok) notify("Saved.", "success");
  }

  function testAnnouncement() {
    if (!view || !("speechSynthesis" in window)) {
      notify("This browser can't speak. OBS uses the overlay's fallback voice instead.", "error");
      return;
    }
    const text = buildAnnouncement(
      { senderName: "Jay", amountPaise: 10000, currency: "INR", message: "Keep going! 😀😀" },
      { readEmojis: view.announcer_read_emojis, readMessage: view.announcer_read_message },
    );
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = Number(view.announcer_rate);
    utterance.volume = Number(view.announcer_volume);
    const voice = window.speechSynthesis.getVoices().find((v) => v.name === view.announcer_voice);
    if (voice) utterance.voice = voice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  const dirty = Object.keys(dirtyPrefs).length > 0 || dirtyPricing;

  return (
    <StudioShell
      active="Manage Interactions"
      session={session}
      authError={authError}
      onRetry={retryAuth}
      eyebrow="Creator studio"
      title="Manage"
      accent="interactions."
      subtitle="Choose what viewers can send, what it costs, and how it shows up and sounds on your stream."
      toast={toast}
      aside={
        <button type="button" className="st-btn-mint px-6 py-3 text-sm font-semibold" onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : dirty ? "Save changes" : "All saved"}
        </button>
      }
    >
      {!view || !platform ? (
        <div className="st-glass st-skel h-64" aria-busy="true" />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel
            title="Interactions & pricing"
            subtitle={`StreamLounge's fee is ${(platform.platform_fee_bps / 100).toFixed(1)}%. ${
              platform.gateway_fee_bearer === "platform" ? "Payment gateway charges come out of StreamLounge's fee, not yours." : "Payment gateway charges (about 2.36%) are deducted from your share."
            }`}
            delay={80}
          >
            <ul className="divide-y divide-white/10">
              {rows.map((row, index) => {
                const def = INTERACTION_DEFINITIONS[row.interaction_type];
                const min = minimums[row.interaction_type] ?? def.fallbackMinimumPrice;
                return (
                  <li key={row.interaction_type} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">{def.label}</p>
                      <p className="st-muted text-xs leading-5">
                        Viewers pay ₹{row.price} · you receive about {formatRupees(creatorReceives(row.price))}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="sr-only" htmlFor={`price-${row.interaction_type}`}>{def.label} price</label>
                      <div className="flex items-center rounded-xl border border-white/15 bg-black/20 px-3">
                        <span className="st-muted text-sm">₹</span>
                        <input
                          id={`price-${row.interaction_type}`}
                          type="number"
                          inputMode="numeric"
                          min={min}
                          max={100000}
                          value={row.price}
                          onChange={(e) => {
                            const value = Math.max(0, Math.floor(Number(e.target.value) || 0));
                            setRows((current) => current.map((r, i) => (i === index ? { ...r, price: value } : r)));
                            setDirtyPricing(true);
                          }}
                          onBlur={() => {
                            if (row.price < min) {
                              setRows((current) => current.map((r, i) => (i === index ? { ...r, price: min } : r)));
                              notify(`Minimum for ${def.label} is ₹${min}.`, "error");
                            }
                          }}
                          className="w-20 bg-transparent py-2 pl-1 text-sm text-white outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={row.enabled}
                        aria-label={`Enable ${def.label}`}
                        onClick={() => {
                          setRows((current) => current.map((r, i) => (i === index ? { ...r, enabled: !r.enabled } : r)));
                          setDirtyPricing(true);
                        }}
                        className={`st-chip ${row.enabled ? "st-chip-on" : ""} !px-3 !py-1.5 !text-xs`}
                      >
                        {row.enabled ? "On" : "Off"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="st-muted mt-3 text-xs leading-5">
              Spin-wheel segments and task lists are edited from the Overview page&apos;s interactions panel; they are kept as they are when you save here.
            </p>
          </Panel>

          <Panel title="Messages" subtitle="What viewers can type, and what the stream shows." delay={140}>
            <label className="block text-sm font-medium text-white" htmlFor="msg-limit">
              Maximum message length: <span className="text-[#5EEAD4]">{view.message_max_length} characters</span>
            </label>
            <input
              id="msg-limit"
              type="range"
              min={platform.message_limit_min}
              max={platform.message_limit_max}
              value={view.message_max_length}
              onChange={(e) => set("message_max_length", Number(e.target.value))}
              className="mt-3 w-full accent-[#5EEAD4]"
            />
            <p className="st-muted mt-1 text-xs">Default is {platform.message_limit_default}. Emoji count as one character each.</p>
            <div className="mt-4 divide-y divide-white/10">
              <Toggle label="Show sender name" hint="Off shows every alert as from “A viewer”." checked={view.show_sender} onChange={(v) => set("show_sender", v)} />
              <Toggle label="Show amount" checked={view.show_amount} onChange={(v) => set("show_amount", v)} />
              <Toggle label="Emoji reactions" hint="Lets viewers send emoji-only messages." checked={view.emoji_reactions_enabled} onChange={(v) => set("emoji_reactions_enabled", v)} />
            </div>
          </Panel>

          <Panel title="On-screen alerts" subtitle="Applies to OBS, Streamlabs and StreamYard overlays." delay={200}>
            <label className="block text-sm font-medium text-white" htmlFor="alert-duration">
              Alert duration: <span className="text-[#5EEAD4]">{(view.alert_duration_ms / 1000).toFixed(0)} seconds</span>
            </label>
            <input
              id="alert-duration"
              type="range"
              min={3000}
              max={30000}
              step={1000}
              value={view.alert_duration_ms}
              onChange={(e) => set("alert_duration_ms", Number(e.target.value))}
              className="mt-3 w-full accent-[#5EEAD4]"
            />
            <p className="mt-5 text-sm font-medium text-white">Position on screen</p>
            <div className="mt-3 grid max-w-[260px] grid-cols-3 gap-2" role="radiogroup" aria-label="Alert position">
              {POSITIONS.map((pos) => (
                <button
                  key={pos}
                  type="button"
                  role="radio"
                  aria-checked={view.alert_position === pos}
                  aria-label={pos.replace("-", " ")}
                  onClick={() => set("alert_position", pos)}
                  className={`h-10 rounded-lg border text-[10px] uppercase tracking-wider ${
                    pos === "center" ? "col-span-3" : ""
                  } ${view.alert_position === pos ? "border-[#5EEAD4]/50 bg-[#5EEAD4]/15 text-[#5EEAD4]" : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white"}`}
                >
                  {pos.replace("-", " ")}
                </button>
              ))}
            </div>
            <div className="mt-4 divide-y divide-white/10">
              <Toggle label="Animated alerts" checked={view.animated_alerts_enabled} onChange={(v) => set("animated_alerts_enabled", v)} />
              <Toggle label="Sound alerts" hint="Plays a short chime with each alert." checked={view.sound_alerts_enabled} onChange={(v) => set("sound_alerts_enabled", v)} />
            </div>
          </Panel>

          <Panel
            title="Automatic announcer"
            subtitle="Reads each superchat aloud through your overlay, so you don't have to."
            delay={260}
            right={
              <button
                type="button"
                onClick={() => set("announcer_muted", !view.announcer_muted)}
                className={`rounded-full border px-4 py-2 text-xs font-semibold ${
                  view.announcer_muted ? "border-red-400/50 bg-red-500/20 text-red-200" : "border-white/15 bg-white/[0.05] text-white"
                }`}
                aria-pressed={view.announcer_muted}
              >
                {view.announcer_muted ? "Muted — tap to unmute" : "Emergency mute"}
              </button>
            }
          >
            <div className="divide-y divide-white/10">
              <Toggle label="Announce superchats" checked={view.announcer_enabled} onChange={(v) => set("announcer_enabled", v)} />
              <Toggle label="Read the message" hint="Off announces only the name and amount." checked={view.announcer_read_message} onChange={(v) => set("announcer_read_message", v)} />
              <Toggle label="Read emoji aloud" hint="“Smiley face, smiley face.”" checked={view.announcer_read_emojis} onChange={(v) => set("announcer_read_emojis", v)} />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="st-label" htmlFor="voice">Voice</label>
                <select
                  id="voice"
                  value={view.announcer_voice}
                  onChange={(e) => set("announcer_voice", e.target.value)}
                  className="st-field mt-1 w-full"
                >
                  <option value="default">Default voice</option>
                  {voices.map((name) => (
                    <option key={name} value={name.slice(0, 40)}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="st-label" htmlFor="min-announce">Only announce from (₹)</label>
                <input
                  id="min-announce"
                  type="number"
                  min={0}
                  value={view.announcer_min_paise / 100}
                  onChange={(e) => set("announcer_min_paise", Math.max(0, Math.round(Number(e.target.value) * 100) || 0))}
                  className="st-field mt-1 w-full"
                />
              </div>
              <div>
                <label className="st-label" htmlFor="rate">Speed: {Number(view.announcer_rate).toFixed(2)}×</label>
                <input id="rate" type="range" min={0.5} max={2} step={0.05} value={view.announcer_rate}
                  onChange={(e) => set("announcer_rate", Number(e.target.value))} className="mt-2 w-full accent-[#5EEAD4]" />
              </div>
              <div>
                <label className="st-label" htmlFor="volume">Volume: {Math.round(Number(view.announcer_volume) * 100)}%</label>
                <input id="volume" type="range" min={0} max={1} step={0.05} value={view.announcer_volume}
                  onChange={(e) => set("announcer_volume", Number(e.target.value))} className="mt-2 w-full accent-[#5EEAD4]" />
              </div>
            </div>
            <button type="button" onClick={testAnnouncement} className="st-btn-ghost mt-5 px-5 py-2.5 text-sm">
              Play a test announcement
            </button>
          </Panel>

          <Panel title="LoungeBoard" subtitle="Appear in the public superchat rankings. Off by default; only the places you enter here are shown." delay={320}>
            <Toggle label="Show me on LoungeBoard" checked={view.leaderboard_opt_in} onChange={(v) => set("leaderboard_opt_in", v)} />
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {([
                ["location_city", "City"],
                ["location_district", "District"],
                ["location_state", "State"],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label className="st-label" htmlFor={key}>{label}</label>
                  <input id={key} maxLength={60} value={view[key] ?? ""} onChange={(e) => set(key, e.target.value || null)} className="st-field w-full" />
                </div>
              ))}
              <div>
                <label className="st-label" htmlFor="location_country">Country code</label>
                <input id="location_country" maxLength={2} placeholder="IN" value={view.location_country ?? ""}
                  onChange={(e) => set("location_country", e.target.value.toUpperCase().replace(/[^A-Z]/g, "") || null)} className="st-field w-full" />
              </div>
              <div>
                <label className="st-label" htmlFor="location_continent">Continent</label>
                <select id="location_continent" value={view.location_continent ?? ""} onChange={(e) => set("location_continent", e.target.value || null)} className="st-field w-full">
                  <option value="">Not set</option>
                  {[["AS", "Asia"], ["EU", "Europe"], ["NA", "North America"], ["SA", "South America"], ["AF", "Africa"], ["OC", "Oceania"]].map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="st-muted mt-3 text-xs leading-5">Never enter a street address. Rankings count verified superchats after refunds.</p>
          </Panel>
        </div>
      )}
    </StudioShell>
  );
}
