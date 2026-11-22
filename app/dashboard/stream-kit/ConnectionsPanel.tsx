"use client";

import { useEffect, useState } from "react";

import { Panel, apiJson } from "@/app/component/studio/StudioShell";

type Conn = { platform: string; connected: boolean; account_login: string | null; display_name: string | null; avatar_url: string | null };
type Resp = { connections: Conn[]; available: Record<"twitch" | "kick", boolean> };

const PLATFORMS = [
  { id: "twitch", name: "Twitch", start: "/api/auth/twitch/start", note: "Verifies your channel and shows it on your page. No chat or posting access." },
  { id: "kick", name: "Kick", start: "/api/auth/kick/start", note: "Verifies your channel and shows it on your page. Read-only access." },
] as const;

const REASONS: Record<string, string> = {
  declined: "You cancelled on the platform's consent screen.",
  invalid_state: "That sign-in link expired. Try connecting again.",
  not_configured: "This connection isn't switched on yet on StreamLounge.",
  already_linked: "That account is already connected to another StreamLounge creator.",
  exchange_failed: "The platform didn't accept the sign-in. Try again.",
  account_lookup_failed: "Couldn't read your channel details. Try again.",
};

export default function ConnectionsPanel({ notify }: { notify: (text: string, tone: "success" | "error") => void }) {
  const [data, setData] = useState<Resp | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiJson<Resp>("/api/creator/connections").then((res) => {
      if (alive && res.ok) setData(res.data);
    });
    const q = new URLSearchParams(window.location.search);
    const platform = q.get("connect");
    if (platform) {
      const status = q.get("status");
      const name = PLATFORMS.find((p) => p.id === platform)?.name ?? platform;
      if (status === "connected") notify(`${name} connected.`, "success");
      else notify(REASONS[q.get("reason") ?? ""] ?? `Couldn't connect ${name}.`, "error");
      window.history.replaceState(null, "", window.location.pathname);
    }
    return () => {
      alive = false;
    };
  }, [notify]);

  async function disconnect(platform: string, name: string) {
    if (!window.confirm(`Disconnect ${name}? StreamLounge will delete its access token.`)) return;
    setBusy(platform);
    const res = await apiJson<{ disconnected: string }>("/api/creator/connections", {
      method: "DELETE",
      body: JSON.stringify({ platform }),
    });
    setBusy(null);
    if (!res.ok) return notify(res.error, "error");
    notify(`${name} disconnected.`, "success");
    const fresh = await apiJson<Resp>("/api/creator/connections");
    if (fresh.ok) setData(fresh.data);
  }

  return (
    <Panel title="Platform connections" subtitle="Prove you own your channels. Tokens are encrypted and never shown in the browser." delay={300}>
      <ul className="space-y-4">
        {PLATFORMS.map((p) => {
          const conn = data?.connections.find((c) => c.platform === p.id && c.connected);
          const available = data?.available[p.id] ?? false;
          return (
            <li key={p.id} className="border-b border-white/5 pb-4 last:border-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{p.name}</p>
                  <p className="st-muted truncate text-xs">
                    {conn ? `Connected${conn.account_login ? ` as ${conn.account_login}` : conn.display_name ? ` as ${conn.display_name}` : ""}` : available ? "Not connected" : "Coming soon"}
                  </p>
                </div>
                {conn ? (
                  <button type="button" className="st-btn-ghost !text-xs" disabled={busy === p.id} onClick={() => disconnect(p.id, p.name)}>
                    Disconnect
                  </button>
                ) : (
                  <a
                    href={available ? p.start : undefined}
                    aria-disabled={!available}
                    className={`st-btn-mint !px-4 !py-2 !text-xs ${available ? "" : "pointer-events-none opacity-40"}`}
                  >
                    Connect
                  </a>
                )}
              </div>
              <p className="st-muted mt-1 text-[11px] leading-4">{p.note}</p>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
