"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";

import { Icon, LogoMark } from "@/app/component/ui/icons";
import { ACCENTS, resolvePageStyle, type PageStyleResolved } from "@/lib/creator/page-style";
import { exactIlikePattern } from "@/lib/db/like";
import { computeFeeBreakdown, formatBps } from "@/lib/payments/fees";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Public creator page and superchat checkout.
 *
 * Trust boundaries: the browser only chooses *what* to send (type, amount,
 * message, alias). The server binds the order to the creator, enforces price
 * floors, verifies the payment with Razorpay, applies the fee and decides the
 * payment source. Nothing here is used to compute money.
 */

type Profile = {
  id: string;
  creator_name: string | null;
  username: string;
  bio: string | null;
  profile_image_url: string | null;
  banner_image_url: string | null;
  instagram_url: string | null;
  youtube_url: string | null;
  twitch_url: string | null;
  kick_url: string | null;
  discord_url: string | null;
};
type Interaction = { type: string; price: number; options: string[]; tasks: string[] };
type Sound = { id: string; name: string };

type RazorpayResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void };
  }
}

const TYPES: Record<string, { label: string; blurb: string; icon: Parameters<typeof Icon>[0]["name"] }> = {
  text: { label: "Superchat", blurb: "A message shown on stream and read aloud.", icon: "chat" },
  audio: { label: "Voice note", blurb: "Record a short clip that plays on stream.", icon: "mic" },
  soundboard: { label: "Soundboard", blurb: "Trigger one of the creator's sounds.", icon: "wave" },
  stickers: { label: "AI sticker", blurb: "Describe a sticker to show on stream.", icon: "palette" },
  spin_wheel: { label: "Spin the wheel", blurb: "A random outcome the creator plays out.", icon: "refresh" },
  tasks: { label: "Task", blurb: "Pick a challenge for the creator.", icon: "trophy" },
};
const ORDER = ["text", "audio", "soundboard", "stickers", "spin_wheel", "tasks"];
const AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-m4a"];
const MAX_AUDIO = 5 * 1024 * 1024;

type Phase =
  | { kind: "idle" }
  | { kind: "paying" }
  | { kind: "submitting"; token: string }
  | { kind: "failed_after_payment"; token: string; message: string }
  | { kind: "done"; detail?: string };

function loadCheckout(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve(Boolean(window.Razorpay));
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok && data.success !== false, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Network error. Check your connection and try again." } };
  }
}

export default function CreatorPage({ username }: { username: string }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [limit, setLimit] = useState(200);
  const [style, setStyle] = useState<PageStyleResolved>(resolvePageStyle(null));
  const [externalUrl, setExternalUrl] = useState<string | null>(null);
  const [feeBps, setFeeBps] = useState(800);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: p, error } = await supabase
          .from("public_creator_profiles")
          .select("id, creator_name, username, bio, profile_image_url, banner_image_url, instagram_url, youtube_url, twitch_url, kick_url, discord_url")
          .ilike("username", exactIlikePattern(username))
          .maybeSingle();
        if (!alive) return;
        if (error) throw error;
        if (!p) return setState("missing");
        setProfile(p as Profile);
        const [ints, settings, extras, platform, snd] = await Promise.all([
          supabase.rpc("get_public_interactions", { p_username: p.username }),
          supabase.rpc("get_public_creator_settings", { p_username: p.username }),
          supabase.rpc("get_public_page_extras", { p_username: p.username }),
          supabase.from("platform_settings").select("platform_fee_bps").maybeSingle(),
          supabase.from("soundboard_sounds").select("id, name").eq("creator_id", p.id).eq("enabled", true).order("sort_order", { ascending: true }),
        ]);
        if (!alive) return;
        const rows = (Array.isArray(ints.data) ? ints.data : []) as { interaction_type: string; price: number; enabled: boolean; options: unknown; tasks: unknown }[];
        setInteractions(
          rows
            .filter((r) => r.enabled && TYPES[r.interaction_type])
            .map((r) => ({
              type: r.interaction_type,
              price: Math.max(1, Math.ceil(Number(r.price) || 1)),
              options: Array.isArray(r.options) ? (r.options as string[]) : [],
              tasks: Array.isArray(r.tasks) ? (r.tasks as string[]) : [],
            }))
            .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type)),
        );
        const lim = Array.isArray(settings.data) ? (settings.data[0] as { message_max_length?: number } | undefined)?.message_max_length : undefined;
        if (lim) setLimit(lim);
        if (!extras.error && extras.data && typeof extras.data === "object") {
          const x = extras.data as { external_payment_url?: string | null; page_style?: unknown };
          setStyle(resolvePageStyle(x.page_style));
          setExternalUrl(typeof x.external_payment_url === "string" && /^https:\/\/(rzp\.io|razorpay\.me|pages\.razorpay\.com)\//.test(x.external_payment_url) ? x.external_payment_url : null);
        }
        if (platform.data?.platform_fee_bps != null) setFeeBps(Number(platform.data.platform_fee_bps));
        setSounds((snd.data ?? []) as Sound[]);
        setState("ready");
      } catch {
        if (alive) setState("error");
      }
    })();
    return () => { alive = false; };
  }, [supabase, username]);

  const accent = ACCENTS[style.accent];
  const vars = { "--sl-accent": accent.hex, "--sl-accent-2": accent.hex, "--sl-accent-ink": accent.ink, "--sl-accent-soft": `${accent.hex}1f` } as CSSProperties;

  if (state === "loading") {
    return (
      <div className="sl flex min-h-screen items-center justify-center" data-theme="dark">
        <div className="w-full max-w-md space-y-3 px-5"><div className="sl-skel h-24" /><div className="sl-skel h-8 w-1/2" /><div className="sl-skel h-56" /></div>
      </div>
    );
  }
  if (state !== "ready" || !profile) {
    return (
      <div className="sl flex min-h-screen flex-col items-center justify-center gap-4 px-5 text-center" data-theme="dark">
        <LogoMark size={28} />
        <h1 className="sl-h2">{state === "missing" ? "This page isn't available" : "We couldn't load this page"}</h1>
        <p className="sl-body sl-muted max-w-sm">
          {state === "missing" ? "The creator may have changed their username or paused their page." : "Check your connection and try again."}
        </p>
        <div className="flex gap-2">
          {state === "error" && <button type="button" className="sl-btn sl-btn-primary" onClick={() => window.location.reload()}>Try again</button>}
          <Link href="/" className="sl-btn">StreamLounge home</Link>
        </div>
      </div>
    );
  }

  const name = profile.creator_name || profile.username;
  const socials = (
    [["YouTube", profile.youtube_url], ["Twitch", profile.twitch_url], ["Kick", profile.kick_url], ["Instagram", profile.instagram_url], ["Discord", profile.discord_url]] as [string, string | null][]
  ).filter(([, u]) => u && /^https:\/\//.test(u)) as [string, string][];
  const centered = style.layout === "centered";
  const compact = style.layout === "compact";

  return (
    <div className="sl" data-theme={style.theme} style={vars}>
      <div className={`mx-auto ${compact ? "max-w-[560px]" : "max-w-[1180px]"} px-4 pb-16 pt-4 md:px-8`}>
        <div className="flex h-12 items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 opacity-80 transition hover:opacity-100" aria-label="StreamLounge">
            <LogoMark size={18} /><span className="sl-wordmark !text-[10.5px]">STREAMLOUNGE</span>
          </Link>
          <Link href="/me" className="sl-btn sl-btn-quiet sl-btn-sm">Supporter account</Link>
        </div>

        <header className="relative mt-3 overflow-hidden rounded-[16px] border" style={{ borderColor: "var(--sl-line)" }}>
          <div className={compact ? "h-28" : "h-40 md:h-56"} style={{ background: profile.banner_image_url && /^https:\/\//.test(profile.banner_image_url) ? `center/cover no-repeat url("${profile.banner_image_url.replace(/["\\]/g, "")}")` : "radial-gradient(120% 140% at 85% 0%, var(--sl-surface-3), var(--sl-bg-1) 60%)" }} />
        </header>

        <div className={`grid gap-8 ${compact ? "" : "lg:grid-cols-[minmax(0,1fr)_440px]"}`}>
          <section className={`relative -mt-12 px-1 md:px-4 ${centered ? "text-center" : ""}`}>
            <div className={`h-24 w-24 overflow-hidden rounded-full border-4 ${centered ? "mx-auto" : ""}`} style={{ borderColor: "var(--sl-bg)", background: "var(--sl-surface-3)" }}>
              {profile.profile_image_url && /^https:\/\//.test(profile.profile_image_url) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.profile_image_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="grid h-full w-full place-items-center text-[28px] font-medium">{name.slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <h1 className="mt-5 text-[30px] font-medium leading-tight tracking-[-0.035em] md:text-[38px]">{name}</h1>
            <p className={`sl-muted mt-1 text-[13.5px] ${style.font === "mono" ? "sl-mono" : ""}`}>@{profile.username}</p>
            {profile.bio && <p className={`sl-body mt-4 max-w-xl whitespace-pre-line ${centered ? "mx-auto" : ""}`}>{profile.bio}</p>}
            {socials.length > 0 && (
              <ul className={`mt-5 flex flex-wrap gap-2 ${centered ? "justify-center" : ""}`}>
                {socials.map(([label, url]) => (
                  <li key={label}><a className="sl-btn sl-btn-sm" href={url} target="_blank" rel="noopener noreferrer nofollow">{label} <Icon name="external" size={12} /></a></li>
                ))}
              </ul>
            )}

            {!compact && style.show_qr && (
              <div className={`mt-10 hidden items-center gap-5 lg:flex ${centered ? "justify-center" : ""}`}>
                <div className="rounded-[10px] bg-white p-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/qr/${encodeURIComponent(profile.username)}`} alt={`QR code for ${name}'s StreamLounge page`} width={104} height={104} />
                </div>
                <p className="sl-muted max-w-[220px] text-left text-[13px] leading-5">Scan with your phone to pay with UPI or any Razorpay method.</p>
              </div>
            )}
          </section>

          <div className={compact ? "" : "lg:pt-6"}>
            {interactions.length === 0 ? (
              <div className="sl-card p-6 text-center"><p className="sl-body sl-muted">{name} isn&apos;t accepting superchats right now.</p></div>
            ) : (
              <Checkout
                username={profile.username}
                creatorName={name}
                interactions={interactions}
                sounds={sounds}
                limit={limit}
                style={style}
                accentHex={accent.hex}
                feeBps={feeBps}
              />
            )}
            {externalUrl && (
              <div className="sl-card mt-4 p-5">
                <p className="text-[13.5px] font-medium">Prefer to pay {name} directly?</p>
                <p className="sl-muted mt-1 text-[12.5px] leading-5">
                  Use their own Razorpay link. StreamLounge takes no commission on it. It won&apos;t trigger an on-stream alert.
                </p>
                <a className="sl-btn sl-btn-sm mt-3" href={externalUrl} target="_blank" rel="noopener noreferrer nofollow">Open Razorpay link <Icon name="external" size={12} /></a>
              </div>
            )}
          </div>
        </div>

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t pt-6 text-[12px]" style={{ borderColor: "var(--sl-line)", color: "var(--sl-faint)" }}>
          <span>StreamLounge · Powered by Lumvik Solutions</span>
          <span className="flex gap-4">
            <Link href="/legal/fees" className="hover:underline">Fees</Link>
            <Link href="/legal/privacy" className="hover:underline">Privacy</Link>
            <Link href="/legal/terms" className="hover:underline">Terms</Link>
          </span>
        </footer>
      </div>
    </div>
  );
}

/* ====================================================================== */

function Checkout({
  username, creatorName, interactions, sounds, limit, style, accentHex, feeBps,
}: {
  username: string;
  creatorName: string;
  interactions: Interaction[];
  sounds: Sound[];
  limit: number;
  style: PageStyleResolved;
  accentHex: string;
  feeBps: number;
}) {
  const [type, setType] = useState(interactions[0].type);
  const current = interactions.find((i) => i.type === type) ?? interactions[0];
  const quick = useMemo(() => {
    const above = style.amounts.filter((a) => a >= current.price);
    return [...new Set([current.price, ...above])].slice(0, 5);
  }, [style.amounts, current.price]);
  const [amount, setAmount] = useState<string>(String(quick[1] ?? quick[0]));
  const [alias, setAlias] = useState("");
  const [message, setMessage] = useState("");
  const [soundId, setSoundId] = useState<string>("");
  const [task, setTask] = useState<string>("");
  const [audio, setAudio] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const submitted = useRef(new Set<string>());

  // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the amount when the interaction changes
  useEffect(() => { setAmount(String(quick[1] ?? quick[0])); setError(null); }, [type, quick]);

  const rupees = Math.floor(Number(amount) || 0);
  const msgLimit = type === "stickers" ? Math.min(300, limit) : Math.min(500, limit);
  const breakdown = rupees > 0 ? computeFeeBreakdown({ source: "STREAMLOUNGE_QR", grossPaise: rupees * 100, qrFeeBps: feeBps }) : null;
  const busy = phase.kind === "paying" || phase.kind === "submitting";

  function validate(): string | null {
    if (!Number.isFinite(rupees) || rupees < current.price) return `The minimum for ${TYPES[type].label.toLowerCase()} is ₹${current.price}.`;
    if (rupees > 500000) return "That amount is above the maximum.";
    if ((type === "text" || type === "stickers") && !message.trim()) return type === "text" ? "Write a message." : "Describe the sticker.";
    if (type === "soundboard" && !soundId) return "Pick a sound.";
    if (type === "tasks" && !task) return "Pick a task.";
    if (type === "audio" && !audio) return "Record or choose a voice note.";
    if (type === "spin_wheel" && current.options.length === 0) return "This wheel has no segments yet.";
    return null;
  }

  const submit = useCallback(async (token: string) => {
    if (submitted.current.has(token)) return;
    setPhase({ kind: "submitting", token });
    const sender = alias.trim() || undefined;
    let body: Record<string, unknown> = { payment_token: token, sender_name: sender };
    let detail: string | undefined;

    if (type === "text") body.message = message.trim();
    if (type === "soundboard") body.sound_id = soundId;
    if (type === "tasks") { body.task = task; detail = `Task: ${task}`; }
    if (type === "spin_wheel") {
      const pool = current.options;
      const result = pool[Math.floor(Math.random() * pool.length)];
      body.result = result;
      detail = `The wheel landed on: ${result}`;
    }
    if (type === "audio" && audio) {
      const ct = AUDIO_TYPES.includes((audio.type || "").split(";")[0]) ? audio.type.split(";")[0] : "audio/webm";
      const ticket = await postJson("/api/uploads/audio-ticket", { payment_token: token, content_type: ct, size_bytes: audio.size });
      if (!ticket.ok) return setPhase({ kind: "failed_after_payment", token, message: String(ticket.data.error || "We couldn't prepare the upload.") });
      try {
        const up = await fetch(String(ticket.data.upload_url), { method: "PUT", headers: { "Content-Type": ct, Authorization: `Bearer ${String(ticket.data.upload_token)}` }, body: audio });
        if (!up.ok) throw new Error("upload");
      } catch {
        return setPhase({ kind: "failed_after_payment", token, message: "Your payment went through but the voice note didn't upload." });
      }
      body = { ...body, storage_path: ticket.data.storage_path };
    }
    if (type === "stickers") {
      const gen = await postJson("/api/stickers/generate", { payment_token: token, prompt: message.trim() });
      if (!gen.ok) return setPhase({ kind: "failed_after_payment", token, message: String(gen.data.error || "The sticker couldn't be generated.") });
      body.prompt = message.trim();
    }

    const res = await postJson("/api/interactions", body);
    if (res.ok || (res.status === 409 && res.data.already_submitted)) {
      submitted.current.add(token);
      setPhase({ kind: "done", detail });
      return;
    }
    setPhase({ kind: "failed_after_payment", token, message: String(res.data.error || "We couldn't deliver it to the stream.") });
  }, [alias, audio, current.options, message, soundId, task, type]);

  async function pay() {
    const problem = validate();
    if (problem) return setError(problem);
    setError(null);
    setPhase({ kind: "paying" });

    if (!(await loadCheckout())) {
      setPhase({ kind: "idle" });
      return setError("The payment window couldn't load. Check your connection and try again.");
    }
    const order = await postJson("/api/payments/create-order", { username, interaction_type: type, amount: rupees });
    if (!order.ok) {
      setPhase({ kind: "idle" });
      return setError(String(order.data.error || "We couldn't start the payment."));
    }

    const rzp = new window.Razorpay!({
      key: order.data.razorpay_key_id,
      amount: order.data.amount,
      currency: order.data.currency,
      order_id: order.data.order_id,
      name: "StreamLounge",
      description: `${TYPES[type].label} for ${creatorName}`,
      theme: { color: accentHex },
      handler: async (r: RazorpayResponse) => {
        const verify = await postJson("/api/payments/verify", r);
        if (!verify.ok || typeof verify.data.payment_token !== "string") {
          setPhase({ kind: "idle" });
          setError(String(verify.data.error || "We couldn't confirm the payment. If you were charged, it will be matched automatically."));
          return;
        }
        await submit(verify.data.payment_token);
      },
      modal: { ondismiss: () => setPhase((p) => (p.kind === "paying" ? { kind: "idle" } : p)) },
    });
    rzp.on("payment.failed", () => {
      setPhase({ kind: "idle" });
      setError("The payment didn't go through. You haven't been charged for this attempt.");
    });
    rzp.open();
  }

  if (phase.kind === "done") {
    return (
      <div className="sl-card p-7 text-center sl-in">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-full" style={{ background: "var(--sl-accent)", color: "var(--sl-accent-ink)" }}><Icon name="check" size={20} /></span>
        <h2 className="sl-h2 mt-5">Sent to the stream</h2>
        <p className="sl-body sl-muted mt-2">Your {TYPES[type].label.toLowerCase()} is in {creatorName}&apos;s queue and will appear on stream shortly.</p>
        {phase.detail && <p className="sl-well mt-4 p-3 text-[13.5px]">{phase.detail}</p>}
        <button type="button" className="sl-btn mt-6" onClick={() => { setPhase({ kind: "idle" }); setMessage(""); setAudio(null); }}>Send another</button>
      </div>
    );
  }

  const solid = style.button === "solid";

  return (
    <div className="sl-card overflow-hidden">
      {interactions.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b p-2" style={{ borderColor: "var(--sl-line)" }} role="tablist" aria-label="What to send">
          {interactions.map((i) => (
            <button key={i.type} type="button" role="tab" aria-selected={type === i.type} disabled={busy}
              onClick={() => setType(i.type)}
              className="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-[13px] transition"
              style={type === i.type ? { background: "var(--sl-surface-3)", color: "var(--sl-fg)" } : { color: "var(--sl-muted)" }}>
              <Icon name={TYPES[i.type].icon} size={15} /> {TYPES[i.type].label}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-5 p-5 md:p-6">
        <div>
          <p className="text-[15px] font-medium">{TYPES[type].label}</p>
          <p className="sl-muted text-[12.5px]">{TYPES[type].blurb} From ₹{current.price}.</p>
        </div>

        <Field label="Amount">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {quick.map((q) => (
              <button key={q} type="button" disabled={busy} onClick={() => setAmount(String(q))} aria-pressed={rupees === q}
                className="sl-btn sl-btn-sm sl-num" style={rupees === q ? { borderColor: "var(--sl-accent)", color: "var(--sl-accent)" } : undefined}>₹{q.toLocaleString("en-IN")}</button>
            ))}
          </div>
          <div className="sl-input-group">
            <span className="sl-addon">₹</span>
            <input className="sl-input sl-num" inputMode="numeric" aria-label="Amount in rupees" value={amount} disabled={busy} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, "").slice(0, 6))} />
          </div>
        </Field>

        {(type === "text" || type === "stickers") && (
          <Field label={type === "text" ? "Message" : "Sticker idea"} hint={`${[...message].length}/${msgLimit}`}>
            <textarea className="sl-textarea" rows={3} disabled={busy} value={message} placeholder={type === "text" ? `Say something to ${creatorName}` : "A cat in sunglasses, pixel art"}
              onChange={(e) => setMessage([...e.target.value].slice(0, msgLimit).join(""))} />
          </Field>
        )}

        {type === "soundboard" && (
          <Field label="Sound">
            {sounds.length === 0 ? <p className="sl-muted text-[13px]">No sounds available yet.</p> : (
              <div className="flex flex-wrap gap-1.5">
                {sounds.map((s) => (
                  <button key={s.id} type="button" disabled={busy} aria-pressed={soundId === s.id} onClick={() => setSoundId(s.id)}
                    className="sl-btn sl-btn-sm" style={soundId === s.id ? { borderColor: "var(--sl-accent)", color: "var(--sl-accent)" } : undefined}>{s.name}</button>
                ))}
              </div>
            )}
          </Field>
        )}

        {type === "tasks" && (
          <Field label="Task">
            <div className="space-y-1.5">
              {current.tasks.map((t) => (
                <button key={t} type="button" disabled={busy} aria-pressed={task === t} onClick={() => setTask(t)}
                  className="sl-well block w-full p-3 text-left text-[13.5px]" style={task === t ? { borderColor: "var(--sl-accent)" } : undefined}>{t}</button>
              ))}
            </div>
          </Field>
        )}

        {type === "spin_wheel" && current.options.length > 0 && (
          <Field label="Possible outcomes" hint="The wheel picks one at random after payment.">
            <div className="flex flex-wrap gap-1.5">{current.options.map((o) => <span key={o} className="sl-badge">{o}</span>)}</div>
          </Field>
        )}

        {type === "audio" && <VoiceInput value={audio} onChange={setAudio} disabled={busy} onError={setError} />}

        <Field label="Your name on stream" hint="Leave blank to appear as Anonymous.">
          <input className="sl-input" maxLength={40} disabled={busy} value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Anonymous" autoComplete="nickname" />
        </Field>

        {error && <p role="alert" className="rounded-md p-3 text-[13px]" style={{ background: "var(--sl-danger-soft)", color: "var(--sl-danger)" }}>{error}</p>}

        {phase.kind === "failed_after_payment" ? (
          <div className="sl-well space-y-3 p-4">
            <p className="text-[13.5px]"><strong>Your payment was received.</strong> {phase.message}</p>
            <button type="button" className="sl-btn sl-btn-primary w-full" onClick={() => void submit(phase.token)}>Try delivering again</button>
            <p className="sl-faint text-[12px]">Retrying uses the same payment. You will not be charged again.</p>
          </div>
        ) : (
          <button type="button" onClick={pay} disabled={busy}
            className="sl-btn sl-btn-lg w-full"
            style={solid ? { background: "var(--sl-accent)", borderColor: "var(--sl-accent)", color: "var(--sl-accent-ink)" } : { borderColor: "var(--sl-accent)", color: "var(--sl-accent)" }}>
            {phase.kind === "paying" ? "Opening secure checkout…" : phase.kind === "submitting" ? "Sending to the stream…" : `Pay ₹${rupees ? rupees.toLocaleString("en-IN") : "—"}`}
          </button>
        )}

        {breakdown && (
          <dl className="space-y-1.5 border-t pt-4 text-[12.5px]" style={{ borderColor: "var(--sl-line)" }}>
            <Row k="You pay" v={`₹${(breakdown.grossPaise / 100).toLocaleString("en-IN")}`} />
            <Row k={`${creatorName} receives`} v={`₹${(breakdown.creatorGrossSharePaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`} />
            <Row k={`StreamLounge platform fee (${formatBps(breakdown.platformFeeBps)})`} v={`₹${(breakdown.platformFeePaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`} />
            <p className="sl-faint flex items-center gap-1.5 pt-1"><Icon name="lock" size={12} /> Paid securely through Razorpay. Gateway charges are separate from the StreamLounge platform fee.</p>
          </dl>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3"><span className="sl-label">{label}</span>{hint && <span className="sl-faint text-[11.5px]">{hint}</span>}</div>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4"><dt className="sl-muted">{k}</dt><dd className="sl-num">{v}</dd></div>;
}

function VoiceInput({ value, onChange, disabled, onError }: { value: Blob | null; onChange: (b: Blob | null) => void; disabled: boolean; onError: (e: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);
  const url = useMemo(() => (value ? URL.createObjectURL(value) : null), [value]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); rec.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: BlobPart[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: r.mimeType || "audio/webm" });
        if (blob.size > MAX_AUDIO) onError("That recording is too long. Keep it under a minute.");
        else onChange(blob);
      };
      rec.current = r;
      r.start();
      setSeconds(0);
      setRecording(true);
      let elapsed = 0;
      timer.current = window.setInterval(() => {
        elapsed += 1;
        setSeconds(elapsed);
        if (elapsed >= 60) stop();
      }, 1000);
    } catch {
      onError("Microphone access was blocked. You can upload a file instead.");
    }
  }
  function stop() {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    if (rec.current?.state === "recording") rec.current.stop();
    setRecording(false);
  }

  return (
    <Field label="Voice note" hint="Up to 60 seconds">
      <div className="sl-well flex flex-wrap items-center gap-3 p-3">
        {recording ? (
          <button type="button" className="sl-btn sl-btn-danger" onClick={stop}><span className="sl-dot" /> Stop · {seconds}s</button>
        ) : (
          <button type="button" className="sl-btn" disabled={disabled} onClick={start}><Icon name="mic" size={14} /> {value ? "Record again" : "Record"}</button>
        )}
        <label className="sl-btn sl-btn-quiet cursor-pointer">
          Upload file
          <input type="file" accept={AUDIO_TYPES.join(",")} className="sr-only" disabled={disabled || recording}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > MAX_AUDIO) return onError("Voice notes must be under 5 MB.");
              onChange(f);
            }} />
        </label>
        {url && !recording && <audio controls src={url} className="h-9 max-w-full" />}
      </div>
    </Field>
  );
}
