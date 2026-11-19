"use client";

import { useCallback, useEffect, useState } from "react";

import { Panel, StudioShell, apiJson, useStudioSession } from "@/app/component/studio/StudioShell";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

import ConnectionsPanel from "./ConnectionsPanel";

type Tool = "obs" | "streamlabs" | "streamyard";

const GUIDES: Record<Tool, { name: string; steps: string[]; note: string }> = {
  obs: {
    name: "OBS Studio",
    steps: [
      "In the Sources dock, click + and choose Browser.",
      "Name it “StreamLounge alerts” and paste your Alerts overlay URL.",
      "Set width 1920 and height 1080, and tick “Control audio via OBS”.",
      "In Advanced Audio Properties, set the source to “Monitor and Output” so you hear announcements too.",
      "Optional: add the QR and Ticker URLs as two more Browser sources.",
    ],
    note: "OBS's browser often has no built-in voices, so announcements use StreamLounge's server voice when one is configured.",
  },
  streamlabs: {
    name: "Streamlabs Desktop",
    steps: [
      "In Sources, click + and choose Browser Source, then Add Source.",
      "Paste your Alerts overlay URL; set width 1920 and height 1080.",
      "Turn on “Control audio via Streamlabs Desktop” so the announcer appears in your mixer.",
      "In Advanced Audio Settings, choose “Monitor and Output” for the source.",
      "Add the QR and Ticker URLs as extra Browser Sources if you want them on screen.",
    ],
    note: "Works the same way as OBS: Streamlabs Desktop uses the same browser-source engine.",
  },
  streamyard: {
    name: "StreamYard",
    steps: [
      "Download your QR code (PNG) below.",
      "In the StreamYard studio, open Brand → Overlays and upload the PNG (custom overlays need a paid StreamYard plan).",
      "Toggle the overlay on while you're live so viewers can scan it.",
      "For live alerts and spoken announcements, run OBS with the Alerts URL and bring it into StreamYard as a camera via OBS Virtual Camera.",
    ],
    note: "StreamYard doesn't load live browser-source URLs, so live alerts can't run inside StreamYard directly. The QR overlay works as an uploaded image.",
  },
};

export default function StreamKitClient() {
  const { session, authError, retryAuth } = useStudioSession("/dashboard/stream-kit");
  const [username, setUsername] = useState<string | null>(null);
  const [publicPage, setPublicPage] = useState(false);
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [tool, setTool] = useState<Tool>("obs");
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  const notify = useCallback((text: string, tone: "success" | "error") => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const [{ data: profile }, key] = await Promise.all([
        supabase.from("creator_profiles").select("username, public_page_enabled").eq("id", session.userId).maybeSingle(),
        apiJson<{ overlay_url: string }>("/api/creator/overlay-key"),
      ]);
      if (!alive) return;
      setUsername(profile?.username ?? null);
      setPublicPage(Boolean(profile?.public_page_enabled));
      if (key.ok) setOverlayUrl(key.data.overlay_url);
    })();
    return () => {
      alive = false;
    };
  }, [session]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const payLink = username ? `${origin}/c/${username}` : "";
  const overlay = {
    alerts: overlayUrl ?? "",
    qr: overlayUrl ? `${overlayUrl}&view=qr` : "",
    ticker: overlayUrl ? `${overlayUrl}&view=ticker` : "",
  };

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify(`${label} copied.`, "success");
    } catch {
      notify("Couldn't copy. Select the text and copy it manually.", "error");
    }
  }

  async function downloadPng() {
    if (!username) return;
    try {
      const svg = await (await fetch(`/api/qr/${encodeURIComponent(username)}?size=1024`)).text();
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 1024;
      canvas.getContext("2d")?.drawImage(img, 0, 0, 1024, 1024);
      const link = document.createElement("a");
      link.download = `streamlounge-${username}-qr.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      notify("Couldn't create the PNG. Try the SVG download instead.", "error");
    }
  }

  async function rotateKey() {
    if (!window.confirm("Rotate your overlay key? Your current overlay URLs will stop working until you paste the new ones into your streaming software.")) return;
    const res = await apiJson<{ overlay_url: string }>("/api/creator/overlay-key", { method: "POST", body: "{}" });
    if (res.ok) {
      setOverlayUrl(res.data.overlay_url);
      notify("New overlay URLs are ready. Update your streaming software.", "success");
    } else notify(res.error, "error");
  }

  const mask = (url: string) => (revealed ? url : url.replace(/key=[^&]+/, "key=••••••••"));

  return (
    <StudioShell
      active="Stream Kit"
      session={session}
      authError={authError}
      onRetry={retryAuth}
      eyebrow="Creator studio"
      title="Your stream"
      accent="kit."
      subtitle="Your payment link, QR code and overlay URLs for OBS, Streamlabs and StreamYard."
      toast={toast}
    >
      {!username ? (
        <div className="st-glass p-8">
          <h2 className="st-h2 !text-lg">Pick a username first</h2>
          <p className="st-muted mt-2 text-sm">Your payment link and QR code use your username. Set one on the Creator Page.</p>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <Panel title="Payment link" subtitle="Put it in your YouTube description, Twitch panels, Kick profile and socials." delay={60}>
              {!publicPage && (
                <p className="mb-4 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                  Your creator page is private, so this link and QR code won&apos;t work for viewers until you make it public.
                </p>
              )}
              <div className="flex flex-col gap-3 sm:flex-row">
                <code className="st-field flex-1 overflow-x-auto whitespace-nowrap">{payLink}</code>
                <button type="button" className="st-btn-mint !py-3" onClick={() => copy(payLink, "Payment link")}>Copy link</button>
              </div>
            </Panel>

            <Panel
              title="Overlay URLs"
              subtitle="Each URL is a browser source. Keep them private: anyone with the alerts URL can read your alert queue."
              delay={120}
              right={<button type="button" className="text-xs text-[#5EEAD4]" onClick={() => setRevealed((r) => !r)}>{revealed ? "Hide keys" : "Show keys"}</button>}
            >
              {([
                ["alerts", "Alerts + announcer", "Add once. Shows superchats and reads them aloud."],
                ["ticker", "Superchat ticker", "Recent superchats in a corner. Read-only."],
                ["qr", "QR code overlay", "A scannable QR for your payment link. Read-only."],
              ] as const).map(([k, label, hint]) => (
                <div key={k} className="border-b border-white/5 py-4 last:border-0">
                  <p className="text-sm font-medium text-white">{label}</p>
                  <p className="st-muted text-xs">{hint}</p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <code className="st-field flex-1 overflow-x-auto whitespace-nowrap text-xs">{overlay[k] ? mask(overlay[k]) : "Loading…"}</code>
                    <button type="button" className="st-btn-ghost" disabled={!overlay[k]} onClick={() => copy(overlay[k], label)}>Copy</button>
                  </div>
                </div>
              ))}
              <button type="button" onClick={rotateKey} className="mt-4 text-xs text-red-300 hover:underline">
                Leaked a URL on stream? Rotate the key
              </button>
            </Panel>

            <Panel title="Set up your streaming software" delay={180}>
              <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Streaming software">
                {(Object.keys(GUIDES) as Tool[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tool === t}
                    onClick={() => setTool(t)}
                    className={`st-chip ${tool === t ? "st-chip-on" : ""} !px-4 !py-2 !text-xs`}
                  >
                    {GUIDES[t].name}
                  </button>
                ))}
              </div>
              <ol className="space-y-3">
                {GUIDES[tool].steps.map((step, i) => (
                  <li key={step} className="st-step">
                    <span className="text-xs font-semibold text-[#5EEAD4]">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-sm text-white/85">{step}</span>
                  </li>
                ))}
              </ol>
              <p className="st-muted mt-4 text-xs leading-5">{GUIDES[tool].note}</p>
            </Panel>
          </div>

          <div className="space-y-6">
          <Panel title="QR code" subtitle="Scans to your payment page." delay={240}>
            <div className="rounded-2xl bg-white p-4">
              {/* Same-origin SVG generated by /api/qr. */}
              <img src={`/api/qr/${encodeURIComponent(username)}?size=512`} alt={`QR code for ${payLink}`} className="mx-auto aspect-square w-full max-w-[300px]" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" className="st-btn-mint !px-3 !py-3 text-sm" onClick={downloadPng}>Download PNG</button>
              <a className="st-btn-ghost text-center" href={`/api/qr/${encodeURIComponent(username)}?size=1024&download=1`}>Download SVG</a>
            </div>
          </Panel>
            <ConnectionsPanel notify={notify} />
          </div>
        </div>
      )}
    </StudioShell>
  );
}
