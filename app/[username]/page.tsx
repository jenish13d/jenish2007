"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";

import Link from "next/link";
import { useParams } from "next/navigation";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

import LivePreview from "@/app/component/LivePreview";

type Profile = {
  id: string;
  creator_name: string | null;
  username: string | null;
  bio: string | null;
  profile_image_url: string | null;
  banner_image_url: string | null;
  youtube_connected: boolean;
  youtube_channel_name: string | null;
  youtube_handle: string | null;
  youtube_avatar_url: string | null;
  youtube_banner_url: string | null;
  youtube_subscribers: number;
  instagram_url: string | null;
  youtube_url: string | null;
  twitch_url: string | null;
  kick_url: string | null;
  discord_url: string | null;
  public_page_enabled: boolean;
};

type CreatorInteraction = {
  id: string;
  interaction_type: string;
  enabled: boolean;
  price: number;
  settings: Record<string, unknown>;
};

type InteractionItem = {
  id: string;
  title: string;
  mobile: string;
  price: number;
  description: string;
  active: boolean;
  settings: Record<string, unknown>;
};

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayPaymentResponse) => void | Promise<void>;
  modal?: {
    ondismiss?: () => void;
  };
  theme?: {
    color?: string;
  };
};

type RazorpayInstance = {
  open: () => void;
};

type RazorpayPaymentResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type SoundboardSound = {
  id: string;
  name: string;
  description: string | null;
  storage_path: string;
  image_path: string | null;
  enabled: boolean;
};

/* =========================================================
   BACKGROUND (unchanged)
========================================================= */

const PAGE_BG =
  "radial-gradient(ellipse at 13% 54%, rgba(132,111,197,0.68) 0%, rgba(84,67,187,0.42) 24%, rgba(84,67,187,0.16) 43%, transparent 62%), radial-gradient(ellipse at 54% 38%, rgba(49,63,120,0.42) 0%, transparent 47%), linear-gradient(115deg, #20264d 0%, #192b4e 43%, #102541 72%, #0A2137 100%)";

const LOADER_CSS = `
.ss-loader { position: relative; width: 92px; height: 92px; }
.ss-loader span { position: absolute; inset: 0; border-radius: 50%; border: 2px solid transparent; }
.ss-loader span:nth-child(1) { border-top-color: #6CCEB0; border-right-color: rgba(108,206,176,.25); animation: ss-orbit 1.15s cubic-bezier(.5,.1,.5,.9) infinite; filter: drop-shadow(0 0 8px rgba(108,206,176,.55)); }
.ss-loader span:nth-child(2) { inset: 12px; border-bottom-color: #A78BFA; border-left-color: rgba(167,139,250,.25); animation: ss-orbit 1.7s cubic-bezier(.5,.1,.5,.9) infinite reverse; filter: drop-shadow(0 0 8px rgba(167,139,250,.5)); }
.ss-loader span:nth-child(3) { inset: 24px; border-top-color: #4D8AFF; border-left-color: rgba(77,138,255,.25); animation: ss-orbit 2.3s cubic-bezier(.5,.1,.5,.9) infinite; filter: drop-shadow(0 0 8px rgba(77,138,255,.5)); }
.ss-loader b { position: absolute; left: 50%; top: 50%; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: #fff; box-shadow: 0 0 18px 4px rgba(108,206,176,.65); animation: ss-core 1.8s ease-in-out infinite; }
.ss-loader-label { margin-top: 28px; font-size: 12px; letter-spacing: .22em; text-transform: uppercase; color: #B8C7D6; background: linear-gradient(100deg, #7C8FA6 30%, #fff 50%, #7C8FA6 70%); background-size: 250% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: ss-label-shine 2.2s linear infinite; }
@keyframes ss-orbit { to { transform: rotate(360deg); } }
@keyframes ss-core { 0%,100% { transform: scale(.7); opacity: .7; } 50% { transform: scale(1.25); opacity: 1; } }
@keyframes ss-label-shine { from { background-position: 120% 0; } to { background-position: -120% 0; } }
@media (prefers-reduced-motion: reduce) { .ss-loader span, .ss-loader b, .ss-loader-label { animation: none !important; } }
`;

/* =========================================================
   ICONS
========================================================= */

function TextIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8" fill="none">
      <path d="M8 10.5C8 7.46 10.46 5 13.5 5h21C37.54 5 40 7.46 40 10.5v15C40 28.54 37.54 31 34.5 31H21l-9.5 9v-9.3A8 8 0 0 1 8 23V10.5Z" fill="currentColor" />
      <circle cx="17" cy="18" r="2" fill="#0A2137" />
      <circle cx="24" cy="18" r="2" fill="#0A2137" />
      <circle cx="31" cy="18" r="2" fill="#0A2137" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8" fill="none">
      <rect x="16" y="5" width="16" height="25" rx="8" fill="currentColor" />
      <path d="M10 22c0 9.39 6.27 16 14 16s14-6.61 14-16" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M24 38v6M17 44h14" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </svg>
  );
}

function SoundIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8" fill="none">
      <path d="M7 19h9l12-10v30L16 29H7V19Z" fill="currentColor" />
      <path d="M34 18c2.5 3.5 2.5 8.5 0 12" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M40 13c5.5 6.5 5.5 15.5 0 22" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8" fill="none">
      <rect x="6" y="7" width="36" height="34" rx="5" fill="currentColor" />
      <circle cx="17" cy="17" r="4" fill="#0A2137" />
      <path d="M10 35l9-9 7 6 5-5 7 8H10Z" fill="#0A2137" />
    </svg>
  );
}

function WheelIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8" fill="none">
      <circle cx="24" cy="24" r="18" fill="currentColor" />
      <path d="M24 6v36M6 24h36M11.3 11.3l25.4 25.4M36.7 11.3 11.3 36.7" stroke="#0A2137" strokeWidth="3" />
      <circle cx="24" cy="24" r="5" fill="#0A2137" />
    </svg>
  );
}

function TaskIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8" fill="none">
      <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="6" />
      <circle cx="24" cy="24" r="9" stroke="currentColor" strokeWidth="5" />
      <path d="M24 2v8M24 38v8M2 24h8M38 24h8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function InteractionIcon({ type }: { type: string }) {
  if (type === "text") return <TextIcon />;
  if (type === "audio") return <MicIcon />;
  if (type === "soundboard") return <SoundIcon />;
  if (type === "stickers") return <ImageIcon />;
  if (type === "spin_wheel") return <WheelIcon />;
  return <TaskIcon />;
}

function SmallSoundIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor" />
      <path d="M16 9c1.8 1.8 1.8 4.2 0 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M19 6.5c3 3 3 8 0 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function cleanUsername(value: string | string[] | undefined) {
  const v = Array.isArray(value) ? value[0] : value || "";
  return decodeURIComponent(v).replace(/^@/, "");
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value || 0);
}

function getInteractionDetails(
  type: string,
  price: number,
  enabled: boolean,
  settings: Record<string, unknown> = {}
): InteractionItem {
  const details: Record<string, { title: string; mobile: string; description: string }> = {
    text: { title: "Text Message", mobile: "Text", description: "Send a message with TTS and on-screen display." },
    audio: { title: "Audio Message", mobile: "Audio", description: "Record or upload audio and play it live on stream." },
    soundboard: { title: "Soundboard", mobile: "Soundboard", description: "Play funny or custom sounds on the creator's stream." },
    stickers: { title: "Stickers", mobile: "Stickers", description: "Send custom stickers and images on stream." },
    spin_wheel: { title: "Spin the Wheel", mobile: "Wheel", description: "Try your luck and trigger fun challenges." },
    tasks: { title: "Tasks", mobile: "Tasks", description: "Give the creator an in-game challenge." },
  };

  const item = details[type] || {
    title: type,
    mobile: type,
    description: "Support the creator with an interaction.",
  };

  return {
    id: type,
    title: item.title,
    mobile: item.mobile,
    price,
    description: item.description,
    active: enabled,
    settings,
  };
}

/* =========================================================
   PAGE
========================================================= */

function PublicSoundImage({ sound }: { sound: SoundboardSound }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadImage() {
      if (!sound.image_path) return;

      const { data, error } = await getSupabaseBrowserClient()
        .storage.from("soundboard-images")
        .createSignedUrl(sound.image_path, 3600);

      if (!cancelled && !error && data?.signedUrl) {
        setImageUrl(data.signedUrl);
      }
    }

    loadImage();

    return () => {
      cancelled = true;
    };
  }, [sound.id, sound.image_path]);

  if (!imageUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#102943] text-[7px] font-semibold uppercase tracking-wider text-[#61758A]">
        No Image
      </div>
    );
  }

  return <img src={imageUrl} alt={sound.name} className="h-full w-full object-cover" />;
}

/**
 * Maps a MediaRecorder MIME type to one the upload endpoint accepts.
 *
 * MediaRecorder reports codec parameters ("audio/webm;codecs=opus"), which the
 * server's allowlist does not include, so the parameters are stripped and the
 * result is checked against the allowlist.
 */
const ALLOWED_AUDIO_MIME = [
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-m4a",
] as const;

function allowedAudioMime(reported: string): string {
  const base = (reported || "").split(";")[0].trim().toLowerCase();
  return (ALLOWED_AUDIO_MIME as readonly string[]).includes(base)
    ? base
    : "audio/webm";
}

export default function CreatorPage() {
  const supabase = getSupabaseBrowserClient();
  const params = useParams();

  const username = cleanUsername(params?.username);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatorInteractions, setCreatorInteractions] = useState<CreatorInteraction[]>([]);
  const [interactionsLoading, setInteractionsLoading] = useState(true);
  const [selected, setSelected] = useState<InteractionItem | null>(null);
  const [soundboardSounds, setSoundboardSounds] = useState<SoundboardSound[]>([]);
  const [selectedSound, setSelectedSound] = useState<SoundboardSound | null>(null);
  const [soundboardAmount, setSoundboardAmount] = useState(0);
  const [amountInput, setAmountInput] = useState("");
  const [previewingSoundId, setPreviewingSoundId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  // The submission API has always accepted a sender name; the original UI
  // hardcoded "Anonymous", so viewers could not be credited on stream.
  const [senderName, setSenderName] = useState("");

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [stickerPrompt, setStickerPrompt] = useState("");
  const [generatedStickerUrl, setGeneratedStickerUrl] = useState<string | null>(null);
  const [generatingSticker, setGeneratingSticker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [wheelPhase, setWheelPhase] = useState<"ready" | "spinning" | "result">("ready");
  const [spinResult, setSpinResult] = useState<string | null>(null);
  const [wheelRotation, setWheelRotation] = useState(0);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
      if (wheelTimerRef.current) {
        clearTimeout(wheelTimerRef.current);
        wheelTimerRef.current = null;
      }
    };
  }, []);

  /* ---------- CARD TILT + SPOTLIGHT (animation only) ---------- */

  function handleCardMove(e: ReactMouseEvent<HTMLButtonElement>) {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    el.style.setProperty("--mx", `${x}px`);
    el.style.setProperty("--my", `${y}px`);
    el.style.setProperty("--rx", `${(y / r.height - 0.5) * -7}deg`);
    el.style.setProperty("--ry", `${(x / r.width - 0.5) * 9}deg`);
  }

  function handleCardLeave(e: ReactMouseEvent<HTMLButtonElement>) {
    const el = e.currentTarget;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }

  async function loadRazorpayScript() {
    if (typeof window === "undefined") return false;
    if (window.Razorpay) return true;

    return new Promise<boolean>((resolve) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  type VerifiedRazorpayPayment = RazorpayPaymentResponse & {
    payment_token?: string;
  };

  async function startRazorpayPayment(
    amount: number,
    descriptionOrType: string,
    onSuccessOrCreatorId: ((payment: VerifiedRazorpayPayment) => Promise<void>) | string,
    descriptionOrOnSuccess?: string | ((payment: VerifiedRazorpayPayment) => Promise<void>),
    actualOnSuccess?: (payment: VerifiedRazorpayPayment) => Promise<void>
  ) {
    try {
      let interactionType = String(selected?.id || "text");
      let creatorId = profile?.id || "";
      let description = "StreamLounge Interaction";
      let onSuccess: (payment: VerifiedRazorpayPayment) => Promise<void>;

      if (typeof onSuccessOrCreatorId === "function") {
        description = descriptionOrType;
        onSuccess = onSuccessOrCreatorId;
      } else {
        interactionType = descriptionOrType;
        creatorId = String(onSuccessOrCreatorId);
        description =
          typeof descriptionOrOnSuccess === "string"
            ? descriptionOrOnSuccess
            : "StreamLounge Interaction";
        onSuccess = (actualOnSuccess ||
          (typeof descriptionOrOnSuccess === "function"
            ? descriptionOrOnSuccess
            : async () => {})) as (payment: VerifiedRazorpayPayment) => Promise<void>;
      }

      const loaded = await loadRazorpayScript();

      if (!loaded) {
        setSending(false);
        setGeneratingSticker(false);
        alert("Unable to load Razorpay. Please check your internet connection.");
        return;
      }

      const orderResponse = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          // The server resolves the creator from the username and binds the
          // order to it. Sending a creator id would let the client nominate
          // which creator a payment is for.
          username,
          interaction_type: interactionType,
        }),
      });

      const orderData = await orderResponse.json();

      if (!orderResponse.ok || !orderData.success || !orderData.order_id) {
        setSending(false);
        setGeneratingSticker(false);
        alert(orderData.error || "Unable to create payment order.");
        return;
      }

      const razorpay = new window.Razorpay({
        key: orderData.razorpay_key_id,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "StreamLounge",
        description,
        order_id: orderData.order_id,

        theme: {
          color: "#4D8AFF",
        },

        handler: async (response: RazorpayPaymentResponse) => {
          try {
            const verifyResponse = await fetch("/api/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                // creator_id and interaction_type are deliberately not sent:
                // the server reads both from the order's bound notes, so the
                // client cannot influence what the payment is treated as.
              }),
            });

            const verifyData = await verifyResponse.json();

            if (!verifyResponse.ok || !verifyData.success) {
              setSending(false);
              setGeneratingSticker(false);
              alert(verifyData.error || "Payment verification failed.");
              return;
            }

            await onSuccess({
              ...response,
              payment_token: verifyData.payment_token,
            });
          } catch (error) {
            console.error("PAYMENT VERIFY ERROR:", error);
            setSending(false);
            setGeneratingSticker(false);
            alert("Payment verification failed. Please try again.");
          }
        },

        modal: {
          ondismiss: () => {
            setSending(false);
            setGeneratingSticker(false);
          },
        },
      });

      razorpay.open();
    } catch (error) {
      console.error("RAZORPAY ERROR:", error);
      setSending(false);
      setGeneratingSticker(false);
      alert("Unable to start payment. Please try again.");
    }
  }

  /* =======================================================
     LOAD CREATOR
  ======================================================== */

  useEffect(() => {
    async function loadProfile() {
      const { data, error } = await supabase
  .from("public_creator_profiles")
  .select("*")
  .eq("username", username)
  .eq("public_page_enabled", true)
  .maybeSingle();

      if (error) {
        console.error("PUBLIC CREATOR:", error);
      }

      setProfile(data as Profile | null);
      setLoading(false);

      if (data?.id) {
        await loadInteractions(data.id, data.username || username);
      } else {
        setInteractionsLoading(false);
      }
    }

    async function loadInteractions(creatorId: string, targetUsername?: string) {
      setInteractionsLoading(true);

      /* CREATOR INTERACTIONS (SECURE RPC) */

      const lookupUsername = targetUsername || username;

      const { data, error } = await supabase.rpc("get_public_interactions", {
        p_username: lookupUsername,
      });

      if (error) {
        console.error("PUBLIC CREATOR INTERACTIONS RPC ERROR:", error);
        setCreatorInteractions([]);
      } else {
        const rows = (data || []) as Array<{
          interaction_type: string;
          price: number;
          enabled: boolean;
          tasks: unknown;
          options: unknown;
        }>;

        const mapped: CreatorInteraction[] = rows.map((row) => ({
          id: row.interaction_type,
          interaction_type: row.interaction_type,
          enabled: Boolean(row.enabled),
          price: Number(row.price || 0),
          settings: {
            tasks: Array.isArray(row.tasks) ? row.tasks : [],
            options: Array.isArray(row.options) ? row.options : [],
          },
        }));

        setCreatorInteractions(mapped);
      }

      /* SOUNDBOARD */

      const { data: sounds, error: soundError } = await supabase
        .from("soundboard_sounds")
        .select("id, name, description, storage_path, image_path, enabled")
        .eq("creator_id", creatorId)
        .eq("enabled", true)
        .order("sort_order", { ascending: true });

      if (soundError) {
        console.error("PUBLIC SOUNDBOARD:", soundError);
        setSoundboardSounds([]);
      } else {
        setSoundboardSounds((sounds || []) as SoundboardSound[]);
      }

      setInteractionsLoading(false);
    }

    if (username) {
      loadProfile();
    }
  }, [username]);

  /* =======================================================
     COPY
  ======================================================== */

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {}
  }

  /* =======================================================
     OPEN INTERACTION
  ======================================================== */

  function openInteraction(item: InteractionItem) {
    if (!item.active || sending || generatingSticker) return;

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }

    if (wheelTimerRef.current) {
      clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = null;
    }
    setWheelPhase("ready");
    setSpinResult(null);
    setWheelRotation(0);
    setSending(false);
    setGeneratingSticker(false);

    setSelected(item);

    // Every interaction starts at the creator's configured minimum.
    // Viewer can enter any higher whole-rupee amount.
    setAmountInput(String(item.price));
    setSoundboardAmount(item.price);
    setSelectedSound(null);
    setPreviewingSoundId(null);
    setAudioFile(null);
    setAudioPreviewUrl(null);
    setSenderName("");
    setStickerPrompt("");
    setGeneratedStickerUrl(null);
  }

  /* =======================================================
     CLOSE MODAL
  ======================================================== */

  function closeModal() {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }

    if (wheelTimerRef.current) {
      clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = null;
    }
    setWheelPhase("ready");
    setSpinResult(null);
    setWheelRotation(0);

    setSelected(null);
    setSelectedSound(null);
    setSoundboardAmount(0);
    setAmountInput("");
    setPreviewingSoundId(null);
    setAudioFile(null);
    setAudioPreviewUrl(null);
    setStickerPrompt("");
    setGeneratedStickerUrl(null);
    setSending(false);
    setGeneratingSticker(false);
  }

  /* =======================================================
     PREVIEW SOUND
  ======================================================== */

  async function previewSound(sound: SoundboardSound) {
    try {
      // If currently previewing this sound, toggle pause
      if (previewingSoundId === sound.id) {
        if (previewAudioRef.current) {
          previewAudioRef.current.pause();
          previewAudioRef.current = null;
        }
        setPreviewingSoundId(null);
        return;
      }

      // Stop previous preview audio if any
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }

      if (!sound.storage_path) {
        alert("Audio file is not available for this sound.");
        setPreviewingSoundId(null);
        return;
      }

      setPreviewingSoundId(sound.id);

      let previewSrc: string | null = null;
      try {
        const { data, error } = await supabase.storage
          .from("soundboard-audio")
          .createSignedUrl(sound.storage_path, 300);

        if (!error && data?.signedUrl) {
          previewSrc = data.signedUrl;
        }
      } catch (error) {
        console.warn("[soundboard] preview signing failed:", error);
      }

      if (!previewSrc) {
        // No fallback: the proxy route this used to call took an arbitrary
        // path, required no authentication, and streamed whatever it resolved
        // out of a private bucket.
        setPreviewingSoundId(null);
        return;
      }

      const audio = new Audio(previewSrc);

      audio.onended = () => {
        setPreviewingSoundId((current) => (current === sound.id ? null : current));
        if (previewAudioRef.current === audio) {
          previewAudioRef.current = null;
        }
      };

      audio.onerror = () => {
        setPreviewingSoundId((current) => (current === sound.id ? null : current));
        if (previewAudioRef.current === audio) {
          previewAudioRef.current = null;
        }
        alert("Unable to play preview audio.");
      };

      previewAudioRef.current = audio;
      await audio.play();
    } catch (error) {
      console.error("AUDIO PREVIEW:", error);

      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
      setPreviewingSoundId(null);

      alert("Unable to preview this sound.");
    }
  }

  /* =======================================================
     SELECT SOUND
  ======================================================== */

  function selectSound(sound: SoundboardSound) {
    if (!selected) return;

    setSelectedSound(sound);
    setSoundboardAmount(selected.price);
    setAmountInput(String(selected.price));
  }

  /* =======================================================
     AMOUNT CHANGE
  ======================================================== */

  function handleAmountChange(value: string) {
    setAmountInput(value);

    if (value === "") {
      setSoundboardAmount(selected?.price || 0);
      return;
    }

    const numeric = Number(value);

    if (Number.isFinite(numeric)) {
      setSoundboardAmount(numeric);
    }
  }

  /* =======================================================
     VALIDATE AMOUNT
  ======================================================== */

  function validateAmount() {
    if (!selected) {
      return;
    }

    const minimum = selected.price;
    const numeric = Number(amountInput);

    if (!Number.isFinite(numeric) || numeric < minimum) {
      setAmountInput(String(minimum));
      setSoundboardAmount(minimum);
      return;
    }

    setSoundboardAmount(Math.floor(numeric));
    setAmountInput(String(Math.floor(numeric)));
  }

  function clearAudioPreview() {
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    setAudioPreviewUrl(null);
    setAudioFile(null);
  }

  function handleAudioFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("audio/")) { alert("Please select an audio file."); return; }
    if (file.size > 10 * 1024 * 1024) { alert("Audio file must be under 10MB."); return; }
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    setAudioFile(file);
    setAudioPreviewUrl(URL.createObjectURL(file));
  }

  async function startRecording() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) { alert("Audio recording is not supported in this browser."); return; }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const supportedMime = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = supportedMime ? new MediaRecorder(stream, { mimeType: supportedMime }) : new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data?.size) audioChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const extension = recorder.mimeType.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: recorder.mimeType || "audio/webm" });
        if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
        setAudioFile(file);
        setAudioPreviewUrl(URL.createObjectURL(file));
        stream.getTracks().forEach((track) => track.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((previous) => {
          const next = previous + 1;
          if (next >= 60) stopRecording();
          return next;
        });
      }, 1000);
    } catch (error) {
      console.error("RECORDING ERROR:", error);
      alert("Microphone permission is required to record audio.");
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    setIsRecording(false);
  }

  function removeAudio() {
    if (isRecording) stopRecording();
    clearAudioPreview();
  }

  async function sendAudioInteraction() {
    if (!profile || !selected || selected.id !== "audio") return;

    if (!audioFile) {
      alert("Please record or upload an audio message.");
      return;
    }

    const minimum = selected.price;
    const numericAmount = Number(amountInput);

    if (!Number.isFinite(numericAmount) || !Number.isInteger(numericAmount) || numericAmount < minimum) {
      setAmountInput(String(minimum));
      alert(`Minimum amount is ₹${minimum}.`);
      return;
    }

    const amount = Math.floor(numericAmount);
    setSending(true);

    try {
      // The recording is uploaded only after payment, and only through a
      // server-issued signed URL scoped to a single object path.
      //
      // Previously the browser uploaded straight into the bucket with the anon
      // key before payment, which meant anonymous visitors held write access to
      // interaction-audio and could fill it without ever paying. It also
      // required anon SELECT on the bucket, which let anyone list the top-level
      // folders — they are creator UUIDs.
      await startRazorpayPayment(
        amount,
        "audio",
        profile.id,
        "StreamLounge Voice Record",
        async (payment) => {
          try {
            const contentType = allowedAudioMime(audioFile.type);

            const ticketResponse = await fetch("/api/uploads/audio-ticket", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                payment_token: payment.payment_token,
                content_type: contentType,
                size_bytes: audioFile.size,
              }),
            });

            const ticket = await ticketResponse.json();

            if (!ticketResponse.ok || !ticket.success) {
              setSending(false);
              alert(ticket.error || "Unable to prepare the upload.");
              return;
            }

            const upload = await fetch(ticket.upload_url, {
              method: "PUT",
              headers: {
                "Content-Type": contentType,
                Authorization: `Bearer ${ticket.upload_token}`,
              },
              body: audioFile,
            });

            if (!upload.ok) {
              console.error("AUDIO UPLOAD ERROR:", upload.status);
              setSending(false);
              alert("Unable to upload your recording. Please try again.");
              return;
            }

            const response = await fetch("/api/interactions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                payment_token: payment.payment_token,
                sender_name: senderName.trim() || undefined,
                storage_path: ticket.storage_path,
              }),
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
              setSending(false);
              alert(result.error || result.details || result.hint || "Unable to submit audio.");
              return;
            }

            setSending(false);
            alert("Payment successful! Voice interaction submitted.");

            closeModal();
          } catch (err) {
            console.error("AUDIO SUBMIT ERROR:", err);
            setSending(false);
            alert("Error submitting voice interaction. Please contact support if your payment was deducted.");
          }
        }
      );
    } catch (error) {
      console.error("AUDIO ERROR:", error);
      setSending(false);
      alert("Unable to send audio. Please try again.");
    }
  }

  /* =======================================================
     SEND SOUNDBOARD
  ======================================================== */

  async function sendSoundboard() {
    if (!profile || !selected || !selectedSound) {
      return;
    }

    const minimum = selected.price;
    const numericAmount = Number(amountInput);

    if (!Number.isFinite(numericAmount) || !Number.isInteger(numericAmount) || numericAmount < minimum) {
      setAmountInput(String(minimum));
      setSoundboardAmount(minimum);
      alert(`Minimum amount is ₹${minimum}.`);
      return;
    }

    const amount = Math.floor(numericAmount);

    setSending(true);

    try {
      await startRazorpayPayment(
        amount,
        "soundboard",
        profile.id,
        `StreamLounge Soundboard - ${selectedSound.name}`,
        async (payment) => {
          try {
            const response = await fetch("/api/interactions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              // Creator, interaction type and amount all come from the signed
              // payment token on the server. Only the content is sent here.
              body: JSON.stringify({
                payment_token: payment.payment_token,
                sender_name: senderName.trim() || undefined,
                sound_id: selectedSound.id,
              }),
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
              setSending(false);
              alert(result.error || result.details || result.hint || "Unable to submit sound.");
              return;
            }

            setSending(false);
            alert("Payment successful! Soundboard interaction submitted.");

            closeModal();
          } catch (err) {
            console.error("SOUNDBOARD SUBMIT ERROR:", err);
            setSending(false);
            alert("Error submitting sound interaction. Please contact support if your payment was deducted.");
          }
        }
      );
    } catch (error) {
      console.error("SOUNDBOARD ERROR:", error);
      setSending(false);
      alert("Unable to send sound. Please try again.");
    }
  }

  /* =======================================================
     SEND SPIN WHEEL / TASK
  ======================================================== */

  async function sendConfiguredInteraction(result: string, type: "spin_wheel" | "tasks") {
    if (!profile || !selected || !result) return;

    const minimum = selected.price;
    const numericAmount = Number(amountInput);

    if (!Number.isFinite(numericAmount) || !Number.isInteger(numericAmount) || numericAmount < minimum) {
      setAmountInput(String(minimum));
      alert(`Minimum amount is ₹${minimum}.`);
      return;
    }

    const amount = Math.floor(numericAmount);
    setSending(true);

    try {
      await startRazorpayPayment(
        amount,
        type,
        profile.id,
        type === "spin_wheel" ? "StreamLounge Spin the Wheel" : "StreamLounge Task",
        async (payment) => {
          try {
            const response = await fetch("/api/interactions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                payment_token: payment.payment_token,
                sender_name: senderName.trim() || undefined,
                // The server checks this against the creator's configured
                // segments, so a viewer cannot submit an outcome the creator
                // never put on the wheel.
                ...(type === "spin_wheel" ? { result } : { task: result }),
              }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
              setSending(false);
              alert(data.error || data.details || "Unable to submit interaction.");
              return;
            }

            setSending(false);

            if (type === "spin_wheel") {
              const settings = (selected.settings || {}) as Record<string, unknown>;
              const raw = (settings.options ?? settings.segments ?? settings.items ?? settings.wheel_options ?? []) as unknown;
              const list = Array.isArray(raw) ? raw : [];
              const values = list
                .map((x) =>
                  typeof x === "string"
                    ? x.trim()
                    : x && typeof x === "object" && "label" in x
                    ? String((x as { label: unknown }).label).trim()
                    : ""
                )
                .filter(Boolean);
              const wheelOptions = values.length > 0 ? values : ["Dare", "Task", "Shoutout", "Gift Sub", "No Task", "Special"];
              const winningIndex = Math.max(0, wheelOptions.indexOf(result));
              const sliceAngle = 360 / wheelOptions.length;
              const landingRot = (360 - ((winningIndex * sliceAngle) % 360)) % 360;

              setWheelRotation((prevRot) => {
                const spins = 5;
                const nextRot = prevRot + 360 * spins;
                const currentModulo = nextRot % 360;
                const diff = (landingRot - currentModulo + 360) % 360;
                return nextRot + diff;
              });

              setWheelPhase("spinning");

              if (wheelTimerRef.current) {
                clearTimeout(wheelTimerRef.current);
              }

              wheelTimerRef.current = setTimeout(() => {
                setWheelPhase("result");
                setSpinResult(result);
              }, 3500);
            } else {
              alert(`Payment successful! Task sent: ${result}`);
              closeModal();
            }
          } catch (err) {
            console.error("CONFIGURED INTERACTION SUBMIT ERROR:", err);
            setSending(false);
            alert("Error submitting interaction. Please contact support if your payment was deducted.");
          }
        }
      );
    } catch (error) {
      console.error("CONFIGURED INTERACTION ERROR:", error);
      setSending(false);
      alert("Unable to send interaction. Please try again.");
    }
  }

  /* =======================================================
     AI STICKER
  ======================================================== */

  async function generateAISticker() {
    if (!profile) return;
    const prompt = stickerPrompt.trim();

    if (!prompt) {
      alert("Please enter an image prompt.");
      return;
    }

    const amount = Number(selected?.price || 50);
    setGeneratingSticker(true);

    await startRazorpayPayment(
      amount,
      "stickers",
      profile.id,
      "StreamLounge AI Image",
      async (payment) => {
        try {
          const response = await fetch("/api/stickers/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt,
              payment_token: payment.payment_token,
            }),
          });

          const data = await response.json();

          if (!response.ok || !data.success || !data.image_data) {
            alert(data.error || "Unable to generate AI image.");
            return;
          }

          setGeneratedStickerUrl(data.image_data);

          const interResponse = await fetch("/api/interactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              payment_token: payment.payment_token,
              sender_name: senderName.trim() || undefined,
              prompt,
            }),
          });

          const interData = await interResponse.json();

          if (!interResponse.ok || !interData.success) {
            alert(interData.error || "Unable to submit AI image interaction.");
            return;
          }

          alert("Payment successful! AI image generated.");
          closeModal();
        } catch (error) {
          console.error("AI STICKER ERROR:", error);
          alert("Payment successful, but image generation failed. Please try again.");
        } finally {
          setGeneratingSticker(false);
        }
      }
    );
  }

  /* =======================================================
     SEND TEXT
  ======================================================== */

  async function sendTextInteraction() {
    if (!profile || !selected) {
      return;
    }

    const textarea = document.querySelector(
      'textarea[data-text-interaction="true"]'
    ) as HTMLTextAreaElement | null;

    const message = textarea?.value.trim();

    if (!message) {
      alert("Please enter a message.");
      return;
    }

    const minimum = selected.price;
    const numericAmount = Number(amountInput);

    if (!Number.isFinite(numericAmount) || !Number.isInteger(numericAmount) || numericAmount < minimum) {
      setAmountInput(String(minimum));
      alert(`Minimum amount is ₹${minimum}.`);
      return;
    }

    const amount = Math.floor(numericAmount);

    setAmountInput(String(amount));
    setSending(true);

    try {
      await startRazorpayPayment(
        amount,
        selected.id,
        profile.id,
        "StreamLounge Text Interaction",
        async (payment) => {
          try {
            const response = await fetch("/api/interactions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                payment_token: payment.payment_token,
                sender_name: senderName.trim() || undefined,
                message,
              }),
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
              setSending(false);
              alert(result.error || result.details || result.hint || "Unable to submit interaction.");
              return;
            }

            setSending(false);
            alert("Payment successful! Text interaction submitted.");

            closeModal();
          } catch (err) {
            console.error("TEXT SUBMIT ERROR:", err);
            setSending(false);
            alert("Error submitting text interaction. Please contact support if your payment was deducted.");
          }
        }
      );
    } catch (error) {
      console.error("TEXT PAYMENT ERROR:", error);
      setSending(false);
      alert("Unable to send interaction. Please try again.");
    }
  }

  /* =======================================================
     LOADING
  ======================================================== */

  if (loading) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center"
        style={{ background: PAGE_BG }}
        aria-busy="true"
      >
        <style>{LOADER_CSS}</style>
        <div className="ss-loader" role="status" aria-label="Loading">
          <span />
          <span />
          <span />
          <b />
        </div>
        <p className="ss-loader-label">Loading</p>
      </div>
    );
  }

  /* =======================================================
     NOT FOUND
  ======================================================== */

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A2137] px-5 text-white">
        <div className="rounded-3xl border border-[#34536A] bg-[#102943] p-8 text-center">
          <h1 className="text-xl font-semibold">Creator not found</h1>

          <p className="mt-2 text-sm text-[#B8C7D6]">
            This creator page doesn&apos;t exist or isn&apos;t publicly available.
          </p>
        </div>
      </div>
    );
  }

  /* =======================================================
     CREATOR DATA
  ======================================================== */

  const name = profile.youtube_channel_name || profile.creator_name || "Creator";

  const avatar = profile.youtube_avatar_url || profile.profile_image_url;

  const banner = profile.youtube_banner_url || profile.banner_image_url;

  const handle = profile.youtube_handle || profile.username || username;

  const interactionOrder = ["text", "audio", "soundboard", "stickers", "spin_wheel", "tasks"];

  const interactions: InteractionItem[] = [...creatorInteractions]
    .sort(
      (a, b) =>
        interactionOrder.indexOf(a.interaction_type) -
        interactionOrder.indexOf(b.interaction_type)
    )
    .map((interaction) =>
      getInteractionDetails(
        interaction.interaction_type,
        Number(interaction.price || 0),
        Boolean(interaction.enabled),
        (interaction.settings || {}) as Record<string, unknown>
      )
    );

  const activeInteractionCount = interactions.filter((item) => item.active).length;

  /* =======================================================
     UI
  ======================================================== */

  return (
    <main
      className="streamlounge-page min-h-screen overflow-x-clip text-[#F8FAFC] selection:bg-[#A78BFA]/40"
      style={{
        fontFamily:
          'var(--font-geist-sans), Inter, Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        background: PAGE_BG,
      }}
    >
      <div aria-hidden="true" className="ambient-lights">
        <span className="ambient-orb ambient-orb-one" />
        <span className="ambient-orb ambient-orb-two" />
        <span className="ambient-orb ambient-orb-three" />
        <span className="ambient-orb ambient-orb-four" />
        <span className="ambient-grid" />
        <span className="ambient-noise" />
        <span className="ambient-beam ambient-beam-one" />
        <span className="ambient-beam ambient-beam-two" />
        <span className="ambient-ring ambient-ring-one" />
        <span className="ambient-ring ambient-ring-two" />
      </div>

      {/* =====================================================
          HEADER
      ====================================================== */}

      <header className="sticky top-0 z-40 border-b border-[#34536A]/60 bg-[#0A2137]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] max-w-[1500px] items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#4D8AFF] to-[#54A3BB] text-lg shadow-[0_0_25px_rgba(91,139,255,.45)]">
              ?
            </div>

            <span className="text-xl font-semibold">
              Stream
              <span className="text-[#6CCEB0]">Lounge</span>
            </span>
          </Link>

          <nav className="hidden gap-8 text-xs font-semibold text-[#8EA4B8] md:flex">
            <Link href="/">Home</Link>

            <Link href="/">Explore</Link>

            <Link href="/signup" className="text-[#6CCEB0]">
              For Creators
            </Link>

            <Link href="/">Pricing</Link>

            <Link href="/">FAQ</Link>
          </nav>

          <button
            onClick={copyLink}
            className="rounded-xl border border-white/10 bg-[#102943]/75 backdrop-blur-xl px-4 py-2.5 text-xs font-bold transition hover:border-[#4D8AFF] hover:shadow-[0_0_25px_rgba(91,139,255,.25)]"
          >
            ? {copied ? "Copied" : "Share"}
          </button>
        </div>
      </header>

      {/* =====================================================
          DESKTOP
      ====================================================== */}

      <div className="mx-auto hidden max-w-[1500px] grid-cols-[270px_minmax(0,1fr)_300px] gap-4 px-5 py-5 lg:grid">
        {/* LEFT PROFILE */}

        <aside className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#102943]/75 shadow-[0_18px_60px_rgba(2,12,27,0.22)] backdrop-blur-xl">
            <div className="relative h-[150px] overflow-hidden">
              {banner ? (
                <img src={banner} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-[#253E70] via-[#253E70] to-[#0A2137]" />
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-[#102943] to-transparent" />

              <span className="absolute left-4 top-4 rounded-md bg-[#4D8AFF] px-2.5 py-1 text-[9px] font-semibold">
                ? LIVE
              </span>
            </div>

            <div className="px-4 pb-5">
              <div className="-mt-10">
                <div className="relative h-[82px] w-[82px] overflow-hidden rounded-full border-4 border-[#102943] bg-[#173752] shadow-[0_0_30px_rgba(91,139,255,.35)]">
                  {avatar ? (
                    <img src={avatar} alt={name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#4D8AFF] to-[#54A3BB] text-3xl font-semibold">
                      {name[0]}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-1">
                <h1 className="text-xl font-semibold">{name}</h1>

                <span className="text-[#4D8AFF]">?</span>
              </div>

              <p className="text-[11px] text-[#8EA4B8]">@{handle.replace(/^@/, "")}</p>

              <p className="mt-4 text-xs leading-5 text-[#CBD5E1]">
                {profile.bio || "Gaming - Streaming - Community"}
              </p>

              <div className="my-5 grid grid-cols-3 border-y border-[#34536A] py-4 text-center">
                <div>
                  <b className="text-lg">{compactNumber(profile.youtube_subscribers)}</b>

                  <p className="text-[8px] text-[#8EA4B8]">Followers</p>
                </div>

                <div className="border-x border-[#34536A]">
                  <b className="text-lg">?0</b>

                  <p className="text-[8px] text-[#8EA4B8]">Support</p>
                </div>

                <div>
                  <b className="text-lg">0</b>

                  <p className="text-[8px] text-[#8EA4B8]">Interactions</p>
                </div>
              </div>

              <button className="w-full rounded-xl bg-gradient-to-r from-[#4D8AFF] to-[#54A3BB] py-3 text-xs font-semibold shadow-[0_0_30px_rgba(91,139,255,.35)]">
                + Follow
              </button>

              <div className="mt-3 grid grid-cols-5 gap-1.5">
                {["?", "?", "?", "??", "?"].map((icon, index) => (
                  <div
                    key={index}
                    className="flex h-9 items-center justify-center rounded-lg border border-[#34536A] bg-[#173752] text-xs"
                  >
                    {icon}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#34536A] bg-gradient-to-br from-[#1E3A8A] to-[#102943] p-4">
            <div className="flex items-center gap-2 text-[9px] font-semibold uppercase text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_#22c55e]" />
              LIVE NOW
            </div>

            <h3 className="mt-3 text-sm font-semibold">Playing VALORANT</h3>

            <p className="mt-1 text-[9px] text-[#CBD5E1]">Ranked Grinds - Come Chat!</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#102943]/75 shadow-[0_18px_60px_rgba(2,12,27,0.22)] backdrop-blur-xl p-5">
            <p className="text-sm font-semibold italic leading-6 text-[#6CCEB0]">
              &ldquo;Same game.
              <br />
              Different story.
              <br />
              Stronger together &#9825;&rdquo;
            </p>
          </div>
        </aside>

        {/* CENTER */}

        <section>
          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[.2em] text-[#4D8AFF]">
                Support {name}
              </p>

              <h2 className="mt-1 text-3xl font-semibold">Choose an interaction</h2>

              <p className="mt-1 text-xs text-[#8EA4B8]">Make the stream more fun.</p>
            </div>

            <span className="rounded-full border border-[#34536A] px-3 py-1.5 text-[8px] font-bold text-[#6CCEB0]">
              {interactionsLoading ? "LOADING" : `${activeInteractionCount} ACTIVE`}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {interactions.map((item) => (
              <button
                key={item.id}
                disabled={!item.active}
                onClick={() => openInteraction(item)}
                onMouseMove={handleCardMove}
                onMouseLeave={handleCardLeave}
                className={`group relative min-h-[205px] overflow-hidden rounded-2xl border p-5 text-left transition-all duration-300 ${
                  item.active
                    ? "border-[#4D8AFF]/55 bg-[#102943] shadow-[0_0_25px_rgba(91,139,255,.14)] hover:-translate-y-1 hover:border-[#6CCEB0] hover:shadow-[0_0_40px_rgba(91,139,255,.35)]"
                    : "border-[#34536A]/40 bg-[#0D1424] opacity-40"
                }`}
              >
                {item.active && (
                  <>
                    <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[#4D8AFF]/10 blur-[45px] transition group-hover:bg-[#4D8AFF]/25" />

                    <div className="absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-[#54A3BB]/10 blur-[45px]" />
                  </>
                )}

                <div className="relative flex items-start justify-between">
                  <div
                    className={`flex h-[52px] w-[52px] items-center justify-center rounded-xl bg-gradient-to-br from-[#4D8AFF] to-[#54A3BB] text-[#F8FAFC] shadow-[0_0_22px_rgba(91,139,255,.45)] ${
                      !item.active ? "grayscale opacity-60" : ""
                    }`}
                  >
                    <InteractionIcon type={item.id} />
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-1 text-[8px] font-semibold ${
                      item.active
                        ? "bg-emerald-400/10 text-emerald-400"
                        : "bg-[#173752] text-[#8EA4B8]"
                    }`}
                  >
                    {item.active ? "ACTIVE" : "INACTIVE"}
                  </span>
                </div>

                <h3 className="relative mt-5 text-base font-semibold">{item.title}</h3>

                <p className="relative mt-1 text-lg font-semibold text-[#FFFFFF]">
                  {String.fromCharCode(8377)}
                  {item.price}
                </p>

                <p className="relative mt-3 text-[10px] leading-5 text-[#8EA4B8]">
                  {item.description}
                </p>

                <div
                  className={`relative mt-6 text-[9px] font-semibold ${
                    item.active ? "text-[#6CCEB0]" : "text-[#8EA4B8]"
                  }`}
                >
                  {item.active ? "Choose interaction ?" : "?? Not enabled by creator"}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-4 overflow-hidden rounded-2xl border border-white/10 bg-[#102943]/75 shadow-[0_18px_60px_rgba(2,12,27,0.22)] backdrop-blur-xl">
            {[
              ["??", "Secure Payments"],
              ["?", "Instant On Stream"],
              ["?", "Support Creators"],
              ["?", "Safe & Moderated"],
            ].map(([icon, title], index) => (
              <div
                key={index}
                className={`p-4 ${index !== 3 ? "border-r border-[#34536A]" : ""}`}
              >
                <div className="text-sm">{icon}</div>

                <p className="mt-2 text-[8px] font-semibold">{title}</p>
              </div>
            ))}
          </div>
        </section>

        {/* RIGHT */}

        <aside className="space-y-4">
          <LivePreview />

          <div className="rounded-2xl border border-white/10 bg-[#102943]/75 shadow-[0_18px_60px_rgba(2,12,27,0.22)] backdrop-blur-xl p-5">
            <h3 className="text-base font-semibold">Support via QR</h3>

            <p className="mt-1 text-[10px] text-[#8EA4B8]">Scan & support instantly</p>

            <div className="mt-4 flex gap-4">
              <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-white text-4xl text-black">
                ?
              </div>

              <div>
                <p className="text-[10px] font-semibold">UPI / Cards / Wallets</p>

                <p className="mt-2 text-[9px] leading-5 text-[#8EA4B8]">
                  Small support.
                  <br />
                  Big happiness ?
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* =====================================================
          MOBILE
      ====================================================== */}

      <div className="mx-auto max-w-[520px] md:max-w-3xl px-3 py-3 md:px-6 md:py-6 lg:hidden">
        <section className="overflow-hidden rounded-3xl border border-[#34536A] bg-[#102943]">
          <div className="relative h-[190px] overflow-hidden">
            {banner ? (
              <img src={banner} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-[#253E70] via-[#253E70] to-[#0A2137]" />
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-[#102943] to-transparent" />

            <span className="absolute left-4 top-4 rounded-md bg-[#4D8AFF] px-2.5 py-1 text-[8px] font-semibold">
              ? LIVE
            </span>
          </div>

          <div className="px-4 pb-5">
            <div className="-mt-12 flex items-end justify-between">
              <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-[#102943] bg-[#173752] shadow-[0_0_30px_rgba(91,139,255,.35)]">
                {avatar ? (
                  <img src={avatar} alt={name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#4D8AFF] to-[#54A3BB] text-3xl font-semibold">
                    {name[0]}
                  </div>
                )}
              </div>

              <button
                onClick={copyLink}
                className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl border border-[#34536A] bg-[#173752]"
              >
                ?
              </button>
            </div>

            <div className="mt-3 flex items-center gap-1">
              <h1 className="text-2xl font-semibold">{name}</h1>

              <span className="text-[#4D8AFF]">?</span>
            </div>

            <p className="text-[10px] text-[#8EA4B8]">@{handle.replace(/^@/, "")}</p>

            <p className="mt-3 text-xs leading-5 text-[#CBD5E1]">
              {profile.bio || "Gaming - Streaming - Community"}
            </p>

            <div className="mt-5 grid grid-cols-3 border-y border-[#34536A] py-4 text-center">
              <div>
                <b className="text-lg">{compactNumber(profile.youtube_subscribers)}</b>

                <p className="text-[8px] text-[#8EA4B8]">Followers</p>
              </div>

              <div className="border-x border-[#34536A]">
                <b className="text-lg">?0</b>

                <p className="text-[8px] text-[#8EA4B8]">Support</p>
              </div>

              <div>
                <b className="text-lg">0</b>

                <p className="text-[8px] text-[#8EA4B8]">Interactions</p>
              </div>
            </div>

            <button className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#4D8AFF] to-[#54A3BB] py-3.5 text-xs font-semibold">
              + Follow
            </button>

            <div className="mt-3 grid grid-cols-5 gap-2">
              {["?", "?", "?", "??", "?"].map((icon, index) => (
                <div
                  key={index}
                  className="flex h-10 items-center justify-center rounded-xl border border-[#34536A] bg-[#173752]"
                >
                  {icon}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-6">
          <p className="text-[9px] font-semibold uppercase tracking-[.2em] text-[#4D8AFF]">
            Support {name}
          </p>

          <div className="mt-1 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Choose an interaction</h2>

            <span className="text-[8px] text-[#8EA4B8]">
              {interactionsLoading ? "Loading" : `${activeInteractionCount} active`}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3">
            {interactions
              .filter((item) => item.active)
              .map((item) => (
                <button
                  key={item.id}
                  onClick={() => openInteraction(item)}
                  onMouseMove={handleCardMove}
                  onMouseLeave={handleCardLeave}
                  className="group rounded-2xl border border-[#4D8AFF]/55 bg-[#102943] p-3 sm:p-4 text-left shadow-[0_0_25px_rgba(91,139,255,.14)] transition hover:border-[#6CCEB0] active:scale-[.98]"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-11 w-11 sm:h-[50px] sm:w-[50px] items-center justify-center rounded-xl bg-gradient-to-br from-[#4D8AFF] to-[#54A3BB] text-white shadow-[0_0_22px_rgba(91,139,255,.45)]">
                      <InteractionIcon type={item.id} />
                    </div>

                    <span className="text-lg text-[#6CCEB0]">?</span>
                  </div>

                  <h3 className="mt-3 sm:mt-4 text-xs sm:text-sm font-semibold truncate">
                    {item.mobile}
                  </h3>

                  <p className="mt-0.5 sm:mt-1 text-sm sm:text-base font-semibold text-[#FFFFFF]">
                    {String.fromCharCode(8377)}
                    {item.price}
                  </p>
                </button>
              ))}
          </div>
        </section>

        <section className="mt-4">
          <LivePreview />
        </section>

        <section className="mt-4 rounded-2xl border border-white/10 bg-[#102943]/75 shadow-[0_18px_60px_rgba(2,12,27,0.22)] backdrop-blur-xl p-5">
          <h3 className="text-base font-semibold">Support via QR</h3>

          <p className="mt-1 text-[10px] text-[#8EA4B8]">Scan & support instantly</p>

          <div className="mt-4 flex gap-4">
            <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-white text-4xl text-black">
              ?
            </div>

            <div>
              <p className="text-[10px] font-semibold">UPI / Cards / Wallets</p>

              <p className="mt-2 text-[9px] leading-5 text-[#8EA4B8]">
                Small support.
                <br />
                Big happiness ?
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* =====================================================
          INTERACTION MODAL
      ====================================================== */}

      {selected &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="interaction-backdrop fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-[#050817]/75 px-3 py-4 backdrop-blur-xl sm:px-5 sm:py-6"
            role="presentation"
            onKeyDown={(event) => {
              // Escape closes the dialog, unless a payment is in flight.
              if (event.key === "Escape" && !sending && !generatingSticker) {
                closeModal();
              }
            }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !sending && !generatingSticker) closeModal();
            }}
          >
            <div
              className="interaction-dialog relative my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-[28px] border border-[#A78BFA]/35 bg-[#111C37]/95 shadow-[0_30px_120px_rgba(3,7,24,.62),0_0_70px_rgba(84,67,187,.28)] backdrop-blur-2xl sm:max-h-[min(88dvh,820px)]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="interaction-dialog-title"
            >
              {/* HEADER */}

              <div className="shrink-0 border-b border-[#34536A] px-4 sm:px-5 py-3.5 sm:py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#4D8AFF] to-[#54A3BB] text-white shadow-[0_0_25px_rgba(91,139,255,.3)]">
                      <InteractionIcon type={selected.id} />
                    </div>

                    <div>
                      <h3 className="font-semibold" id="interaction-dialog-title">
                        {selected.id === "soundboard" ? "Send Soundboard" : `Send ${selected.title}`}
                      </h3>

                      <p className="text-[10px] text-[#8EA4B8]">To {name}</p>
                    </div>
                  </div>

                  <button
                    disabled={sending || generatingSticker}
                    onClick={closeModal}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-[#102943]/75 backdrop-blur-xl text-[#B8C7D6] transition hover:border-[#4D8AFF]/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    &#10005;
                  </button>
                </div>
              </div>

              {/* SENDER NAME — applies to every interaction type, so it sits
                  above the per-type panels rather than being repeated in each.
                  The submission API has always accepted a name; the previous UI
                  hardcoded "Anonymous", so viewers were never credited. */}

              <div className="shrink-0 border-b border-[#34536A] px-4 sm:px-5 py-3">
                <label
                  htmlFor="sender-name"
                  className="block text-[11px] font-semibold text-[#B8C7D6]"
                >
                  Your name <span className="font-normal text-[#8EA4B8]">(optional)</span>
                </label>
                <input
                  id="sender-name"
                  type="text"
                  value={senderName}
                  maxLength={50}
                  autoComplete="nickname"
                  placeholder="Anonymous"
                  disabled={sending || generatingSticker}
                  onChange={(event) => setSenderName(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[#34536A] bg-[#0A2137] px-3 py-2.5 text-sm text-white placeholder:text-[#64748B] focus:border-[#4D8AFF] focus:outline-none disabled:opacity-50"
                />
                <p className="mt-1 text-[10px] text-[#8EA4B8]">
                  Shown on {name}&apos;s stream with your alert. Leave blank to stay anonymous.
                </p>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0">
                {/* =================================================
                    SOUNDBOARD
                ================================================== */}

                {selected.id === "soundboard" ? (
                  <div className="p-5">
                    <div className="mb-4">
                      <p className="text-sm font-semibold">Choose a sound</p>

                      <p className="mt-1 text-[10px] text-[#8EA4B8]">
                        Preview a sound before sending it to {name}&apos;s stream.
                      </p>
                    </div>

                    {/* SOUND LIST */}

                    {soundboardSounds.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-[#34536A] bg-[#0A2137] px-5 py-10 text-center">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#102943] text-[#8EA4B8]">
                          <SmallSoundIcon />
                        </div>

                        <p className="text-sm font-bold">No sounds available</p>

                        <p className="mt-1 text-[10px] text-[#8EA4B8]">
                          This creator hasn&apos;t added any sounds yet.
                        </p>
                      </div>
                    ) : (
                      <div className="grid max-h-[310px] grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto pr-1">
                        {soundboardSounds.map((sound) => {
                          const isSelected = selectedSound?.id === sound.id;
                          const isPreviewing = previewingSoundId === sound.id;

                          return (
                            <div
                              key={sound.id}
                              onClick={() => selectSound(sound)}
                              className={`group relative flex items-center gap-2.5 rounded-xl border p-2 text-left cursor-pointer transition ${
                                isSelected
                                  ? "border-[#4D8AFF] bg-[#4D8AFF]/15 shadow-[0_0_15px_rgba(91,139,255,.2)] ring-1 ring-[#4D8AFF]"
                                  : "border-[#34536A] bg-[#102943] hover:border-[#4D8AFF]/50 hover:bg-[#131B2E]"
                              }`}
                            >
                              {/* SOUND THUMBNAIL WITH PLAY/PAUSE */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  previewSound(sound);
                                }}
                                className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border transition ${
                                  isPreviewing
                                    ? "border-[#4D8AFF] ring-2 ring-[#4D8AFF]/50"
                                    : "border-[#34536A] group-hover:border-[#4D8AFF]/40"
                                } bg-[#0A2137]`}
                                title={isPreviewing ? "Pause preview" : "Play preview"}
                              >
                                <PublicSoundImage sound={sound} />
                                <div
                                  className={`absolute inset-0 flex items-center justify-center transition backdrop-blur-[1px] ${
                                    isPreviewing
                                      ? "bg-[#4D8AFF]/80 text-white"
                                      : "bg-black/45 text-white/90 hover:bg-black/65 hover:text-white"
                                  }`}
                                >
                                  {isPreviewing ? (
                                    <span className="text-[10px] font-semibold tracking-tighter">❚❚</span>
                                  ) : (
                                    <span className="ml-0.5 text-[10px] font-semibold">▶</span>
                                  )}
                                </div>
                              </button>

                              {/* SOUND TITLE & DESCRIPTION */}
                              <div className="min-w-0 flex-1">
                                <p
                                  className={`truncate text-xs font-semibold transition ${
                                    isSelected ? "text-white" : "text-[#F8FAFC] group-hover:text-white"
                                  }`}
                                >
                                  {sound.name}
                                </p>
                                <p className="mt-0.5 truncate text-[8px] text-[#8EA4B8]">
                                  {sound.description || "Stream sound"}
                                </p>
                              </div>

                              {/* SELECTION CHECKMARK */}
                              <div className="shrink-0 pl-1">
                                <div
                                  className={`flex h-5 w-5 items-center justify-center rounded-full border transition ${
                                    isSelected
                                      ? "border-[#4D8AFF] bg-[#4D8AFF] text-white shadow-[0_0_8px_rgba(91,139,255,0.7)]"
                                      : "border-[#34536A] bg-[#0A2137] text-transparent group-hover:border-[#4D8AFF]/40"
                                  }`}
                                >
                                  <span className="text-[10px] font-semibold leading-none">✓</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* SELECTED SOUND */}

                    {selectedSound && (
                      <div className="mt-4 rounded-2xl border border-[#34536A] bg-[#0A2137] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div className="relative group/sel h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#102943]/75 backdrop-blur-xl">
                              <PublicSoundImage sound={selectedSound} />
                              <button
                                type="button"
                                onClick={() => previewSound(selectedSound)}
                                className="absolute inset-0 flex items-center justify-center bg-black/50 text-[#F8FAFC] transition hover:bg-black/65"
                                title={previewingSoundId === selectedSound.id ? "Pause Preview" : "Play Preview"}
                                aria-label={previewingSoundId === selectedSound.id ? "Pause Preview" : "Play Preview"}
                              >
                                <span className="text-xs">
                                  {previewingSoundId === selectedSound.id ? "❚❚" : "▶"}
                                </span>
                              </button>
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="text-[8px] font-bold uppercase tracking-[.15em] text-[#8EA4B8]">
                                Selected Sound
                              </p>
                              <p className="mt-1 truncate text-sm font-semibold text-[#F8FAFC]">
                                {selectedSound.name}
                              </p>
                              {selectedSound.description && (
                                <p className="truncate text-[10px] text-[#B8C7D6]">
                                  {selectedSound.description}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="ml-3 shrink-0 text-right">
                            <p className="text-[8px] text-[#8EA4B8]">Minimum</p>
                            <p className="text-base font-semibold text-[#FFFFFF]">
                              {String.fromCharCode(8377)}
                              {selected.price}
                            </p>
                          </div>
                        </div>

                        {/* AMOUNT */}

                        <div className="mt-4">
                          <label className="mb-2 block text-[9px] font-semibold uppercase tracking-[.15em] text-[#8EA4B8]">
                            Support Amount
                          </label>

                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#B8C7D6]">
                              {String.fromCharCode(8377)}
                            </span>

                            <input
                              type="number"
                              min={selected.price}
                              step="1"
                              value={amountInput}
                              onChange={(e) => handleAmountChange(e.target.value)}
                              onBlur={validateAmount}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  validateAmount();
                                }
                              }}
                              placeholder={String(selected.price)}
                              className="h-12 w-full rounded-xl border border-white/10 bg-[#102943]/75 backdrop-blur-xl pl-9 pr-4 text-sm font-semibold text-[#F8FAFC] outline-none transition placeholder:text-[#61758A] focus:border-[#4D8AFF] focus:ring-1 focus:ring-[#4D8AFF]/30"
                            />
                          </div>

                          <div className="mt-2 flex items-center justify-between">
                            <p className="text-[8px] text-[#8EA4B8]">
                              Minimum amount: {String.fromCharCode(8377)}
                              {selected.price}
                            </p>

                            <p className="text-[8px] text-[#6CCEB0]">Pay any amount above minimum</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* FOOTER */}

                    <div className="mt-5 flex items-end gap-4 border-t border-[#34536A] pt-4">
                      <div className="shrink-0">
                        <p className="text-[8px] text-[#8EA4B8]">Total</p>

                        <p className="text-2xl font-semibold text-[#FFFFFF]">
                          {String.fromCharCode(8377)}
                          {selectedSound ? soundboardAmount || selected.price : selected.price}
                        </p>
                      </div>

                      <button
                        disabled={!selectedSound || sending || soundboardAmount < selected.price}
                        onClick={sendSoundboard}
                        className="flex-1 rounded-xl bg-gradient-to-r from-[#4D8AFF] to-[#54A3BB] py-3.5 text-xs font-semibold shadow-[0_0_30px_rgba(91,139,255,.25)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {sending ? "Sending..." : "Pay & Send"}
                      </button>
                    </div>
                  </div>
                ) : selected.id === "audio" ? (
                  <div className="p-5">
                    <div className="mb-5">
                      <p className="text-sm font-semibold">Voice Record</p>
                      <p className="mt-1 text-[10px] text-[#8EA4B8]">
                        Record your voice or upload an audio file.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`rounded-2xl border p-4 text-left transition ${isRecording ? "border-red-500/60 bg-red-500/10" : "border-[#34536A] bg-[#102943] hover:border-[#4D8AFF]/60"}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isRecording ? "bg-red-500/20 text-red-400" : "bg-[#4D8AFF]/15 text-[#6CCEB0]"}`}>
                            <MicIcon />
                          </div>
                          <div>
                            <p className="text-xs font-semibold">{isRecording ? "Stop Recording" : "Record Voice"}</p>
                            <p className="mt-1 text-[8px] text-[#8EA4B8]">{isRecording ? `${recordingSeconds}s / 60s` : "Maximum 60 seconds"}</p>
                          </div>
                        </div>
                      </button>

                      <label className="cursor-pointer rounded-2xl border border-white/10 bg-[#102943]/75 shadow-[0_18px_60px_rgba(2,12,27,0.22)] backdrop-blur-xl p-4 text-left transition hover:border-[#4D8AFF]/60">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#54A3BB]/15 text-[#6CCEB0]">
                            <UploadIcon />
                          </div>
                          <div>
                            <p className="text-xs font-semibold">Upload Audio</p>
                            <p className="mt-1 text-[8px] text-[#8EA4B8]">MP3, WAV, WebM, MP4 · Max 10MB</p>
                          </div>
                        </div>
                        <input
                          type="file"
                          accept="audio/*"
                          className="hidden"
                          onChange={(e) => {
                            handleAudioFile(e.target.files?.[0] || null);
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>
                    </div>

                    {audioFile && (
                      <div className="mt-4 rounded-2xl border border-[#34536A] bg-[#0A2137] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[8px] font-semibold uppercase tracking-[.15em] text-[#8EA4B8]">Audio Ready</p>
                            <p className="mt-1 truncate text-xs font-semibold text-[#F8FAFC]">{audioFile.name}</p>
                            <p className="mt-1 text-[8px] text-[#8EA4B8]">{(audioFile.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                          <button type="button" onClick={removeAudio} className="rounded-lg border border-[#34536A] px-3 py-2 text-[9px] font-semibold text-[#B8C7D6] hover:border-red-500/50 hover:text-red-400">Remove</button>
                        </div>
                        {audioPreviewUrl && <audio controls src={audioPreviewUrl} className="mt-4 w-full" />}
                      </div>
                    )}

                    <div className="mt-4 rounded-2xl border border-[#34536A] bg-[#0A2137] p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[8px] font-semibold uppercase tracking-[.15em] text-[#8EA4B8]">Minimum Support</p>
                          <p className="mt-1 text-base font-semibold text-[#FFFFFF]">{String.fromCharCode(8377)}{selected.price}</p>
                        </div>
                        <span className="rounded-full bg-[#54A3BB]/10 px-2.5 py-1 text-[7px] font-semibold text-[#6CCEB0]">PAY MORE IF YOU WANT</span>
                      </div>

                      <div className="mt-4">
                        <label className="mb-2 block text-[9px] font-semibold uppercase tracking-[.15em] text-[#8EA4B8]">Your Amount</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#B8C7D6]">?</span>
                          <input
                            type="number"
                            min={selected.price}
                            step="1"
                            value={amountInput}
                            onChange={(e) => setAmountInput(e.target.value)}
                            onBlur={validateAmount}
                            onKeyDown={(e) => { if (e.key === "Enter") validateAmount(); }}
                            className="h-12 w-full rounded-xl border border-white/10 bg-[#102943]/75 backdrop-blur-xl pl-9 pr-4 text-sm font-semibold text-[#F8FAFC] outline-none focus:border-[#4D8AFF]"
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <p className="text-[8px] text-[#8EA4B8]">Minimum: {String.fromCharCode(8377)}{selected.price}</p>
                          <p className="text-[8px] text-[#6CCEB0]">Enter any higher amount</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex items-end gap-4 border-t border-[#34536A] pt-4">
                      <div className="shrink-0">
                        <p className="text-[8px] text-[#8EA4B8]">Total</p>
                        <p className="text-2xl font-semibold text-[#FFFFFF]">?{Number(amountInput) >= selected.price ? Math.floor(Number(amountInput)) : selected.price}</p>
                      </div>
                      <button
                        disabled={sending || !audioFile || !amountInput || !Number.isInteger(Number(amountInput)) || Number(amountInput) < selected.price}
                        onClick={sendAudioInteraction}
                        className="flex-1 rounded-xl bg-gradient-to-r from-[#4D8AFF] to-[#54A3BB] py-3.5 text-xs font-semibold shadow-[0_0_30px_rgba(91,139,255,.25)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {sending ? "Uploading..." : "Pay & Send"}
                      </button>
                    </div>
                  </div>
                ) : selected.id === "stickers" ? (
                  <div className="p-5">
                    <div className="mb-5">
                      <p className="text-sm font-semibold">AI Image</p>
                      <p className="mt-1 text-[10px] text-[#8EA4B8]">
                        Describe an image and AI will create it for your stream.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[#34536A] bg-[#0A2137] p-4">
                      <label className="mb-2 block text-[9px] font-semibold uppercase tracking-[.15em] text-[#8EA4B8]">
                        Your Prompt
                      </label>

                      <textarea
                        value={stickerPrompt}
                        onChange={(e) => setStickerPrompt(e.target.value)}
                        maxLength={300}
                        rows={4}
                        placeholder="Example: A funny gaming cat celebrating a victory"
                        className="w-full resize-none rounded-xl border border-white/10 bg-[#102943]/75 backdrop-blur-xl p-4 text-sm font-semibold text-[#F8FAFC] outline-none placeholder:text-[#61758A] focus:border-[#4D8AFF]"
                      />

                      <p className="mt-2 text-right text-[8px] text-[#8EA4B8]">
                        {stickerPrompt.length}/300
                      </p>
                    </div>

                    {generatedStickerUrl && (
                      <div className="mt-4 rounded-2xl border border-[#34536A] bg-[#0A2137] p-4">
                        <p className="mb-3 text-[8px] font-semibold uppercase tracking-[.15em] text-[#8EA4B8]">
                          Generated Image
                        </p>

                        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#102943]/75 backdrop-blur-xl">
                          <img
                            src={generatedStickerUrl}
                            alt="Generated AI sticker"
                            className="mx-auto max-h-[360px] w-full object-contain"
                          />
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={generatingSticker || !stickerPrompt.trim()}
                      onClick={generateAISticker}
                      className="mt-5 w-full rounded-xl bg-gradient-to-r from-[#4D8AFF] to-[#54A3BB] py-3.5 text-xs font-semibold shadow-[0_0_30px_rgba(91,139,255,.25)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {generatingSticker ? "Generating AI Image..." : "Generate AI Image"}
                    </button>
                  </div>
                ) : selected.id === "spin_wheel" ? (
                  (() => {
                    const settings = (selected.settings || {}) as Record<string, unknown>;
                    const raw = (settings.options ?? settings.segments ?? settings.items ?? settings.wheel_options ?? []) as unknown;
                    const list = Array.isArray(raw) ? raw : [];
                    const values = list
                      .map((x) =>
                        typeof x === "string"
                          ? x.trim()
                          : x && typeof x === "object" && "label" in x
                          ? String((x as { label: unknown }).label).trim()
                          : ""
                      )
                      .filter(Boolean);
                    const wheelOptions = values.length > 0 ? values : ["Dare", "Task", "Shoutout", "Gift Sub", "No Task", "Special"];
                    const sliceAngle = 360 / wheelOptions.length;
                    const sliceThemes = [
                      { fill: "#4D8AFF", border: "#7DA7FF" },
                      { fill: "#54A3BB", border: "#9D5CFF" },
                      { fill: "#2563EB", border: "#60A5FA" },
                      { fill: "#9333EA", border: "#C084FC" },
                      { fill: "#4F46E5", border: "#818CF8" },
                      { fill: "#6366F1", border: "#A5B4FC" },
                    ];

                    return (
                      <div className="p-5 max-h-[82vh] overflow-y-auto">
                        <div className="mb-4">
                          <p className="text-sm font-semibold">Spin the Wheel</p>
                          <p className="mt-1 text-[10px] text-[#8EA4B8]">
                            Spin to trigger a random creator challenge live on stream.
                          </p>
                        </div>

                        {/* WHEEL CARD */}
                        <div className="rounded-2xl border border-[#34536A] bg-[#0A2137] p-4 text-center">
                          <div className="relative mx-auto my-2 w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center">
                            {/* TOP POINTER */}
                            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none">
                              <div className="w-0 h-0 border-l-[9px] border-l-transparent border-r-[9px] border-r-transparent border-t-[17px] border-t-[#60A5FA] drop-shadow-[0_2px_8px_rgba(96,165,250,0.95)]" />
                              <div className="w-1.5 h-1.5 rounded-full bg-white -mt-1 shadow-[0_0_6px_#60A5FA]" />
                            </div>

                            {/* ROTATING SVG WHEEL */}
                            <div
                              style={{
                                transform: `rotate(${wheelRotation}deg)`,
                                transition:
                                  wheelPhase === "spinning"
                                    ? "transform 3.5s cubic-bezier(0.12, 0.8, 0.2, 1)"
                                    : "none",
                              }}
                              className="w-full h-full rounded-full shadow-[0_0_35px_rgba(91,139,255,0.22)]"
                            >
                              <svg viewBox="0 0 240 240" className="w-full h-full overflow-visible">
                                <defs>
                                  <filter id="hubGlow" x="-20%" y="-20%" width="140%" height="140%">
                                    <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#4D8AFF" floodOpacity="0.6" />
                                  </filter>
                                </defs>
                                {wheelOptions.map((_, i) => {
                                  const startAngle = i * sliceAngle - sliceAngle / 2 - 90;
                                  const endAngle = (i + 1) * sliceAngle - sliceAngle / 2 - 90;
                                  const midAngle = i * sliceAngle - 90;
                                  const startRad = (startAngle * Math.PI) / 180;
                                  const endRad = (endAngle * Math.PI) / 180;
                                  const x1 = 120 + 110 * Math.cos(startRad);
                                  const y1 = 120 + 110 * Math.sin(startRad);
                                  const x2 = 120 + 110 * Math.cos(endRad);
                                  const y2 = 120 + 110 * Math.sin(endRad);
                                  const largeArc = sliceAngle > 180 ? 1 : 0;
                                  const d = `M 120 120 L ${x1.toFixed(2)} ${y1.toFixed(2)} A 110 110 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
                                  const theme = sliceThemes[i % sliceThemes.length];
                                  const badgeRad = (midAngle * Math.PI) / 180;
                                  const bx = 120 + 76 * Math.cos(badgeRad);
                                  const by = 120 + 76 * Math.sin(badgeRad);

                                  return (
                                    <g key={i}>
                                      <path d={d} fill={theme.fill} stroke="#0A2137" strokeWidth="2.5" />
                                      <circle
                                        cx={bx.toFixed(2)}
                                        cy={by.toFixed(2)}
                                        r="13"
                                        fill="#0A2137"
                                        stroke={theme.border}
                                        strokeWidth="1.5"
                                      />
                                      <text
                                        x={bx.toFixed(2)}
                                        y={(by + 4.5).toFixed(2)}
                                        textAnchor="middle"
                                        fill="#F8FAFC"
                                        fontSize="11"
                                        fontWeight="900"
                                        fontFamily="sans-serif"
                                      >
                                        {i + 1}
                                      </text>
                                    </g>
                                  );
                                })}
                                {/* OUTER RIMS */}
                                <circle cx="120" cy="120" r="110" fill="none" stroke="rgba(91,139,255,0.45)" strokeWidth="5" />
                                <circle cx="120" cy="120" r="113" fill="none" stroke="#34536A" strokeWidth="1" />
                                {/* CENTER HUB */}
                                <circle cx="120" cy="120" r="32" fill="#0A2137" stroke="#4D8AFF" strokeWidth="3" filter="url(#hubGlow)" />
                                <circle cx="120" cy="120" r="24" fill="#0A2137" stroke="#34536A" strokeWidth="1" />
                                <text x="120" y="126" textAnchor="middle" fontSize="17">
                                  🎡
                                </text>
                              </svg>
                            </div>
                          </div>

                          {/* WHEEL STATUS */}
                          {wheelPhase === "ready" && (
                            <div className="mt-2 text-center">
                              <p className="text-xs font-semibold text-[#FFFFFF]">Ready to Spin?</p>
                              <p className="mt-0.5 text-[9px] text-[#8EA4B8]">
                                Hit &ldquo;Spin Now&rdquo; to launch checkout and spin for a challenge.
                              </p>
                            </div>
                          )}

                          {wheelPhase === "spinning" && (
                            <div className="mt-2 text-center animate-pulse">
                              <div className="inline-flex items-center gap-2 rounded-full border border-[#4D8AFF]/40 bg-[#4D8AFF]/15 px-3 py-1 text-xs font-semibold text-[#FFFFFF]">
                                <span className="h-2 w-2 rounded-full bg-[#4D8AFF] animate-ping" />
                                Spinning the Wheel...
                              </div>
                              <p className="mt-1 text-[9px] text-[#8EA4B8]">Selecting a creator challenge for the live stream</p>
                            </div>
                          )}
                        </div>

                        {/* RESULT CARD */}
                        {wheelPhase === "result" && spinResult && (
                          <div className="mt-4 rounded-2xl border border-[#4D8AFF]/50 bg-gradient-to-br from-[#0B132B] via-[#0F172A] to-[#1E1B4B] p-4 text-center shadow-[0_0_30px_rgba(91,139,255,0.25)]">
                            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#4D8AFF]/40 bg-[#4D8AFF]/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#93C5FD]">
                              <span>🎉</span> Challenge Selected!
                            </div>
                            <p className="mt-2 text-base font-semibold text-white tracking-wide">
                              {spinResult}
                            </p>
                            <p className="mt-1 text-[10px] text-[#B8C7D6]">
                              This challenge was submitted directly to the creator&apos;s live stream overlay.
                            </p>
                            <div className="mt-4 flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (wheelTimerRef.current) {
                                    clearTimeout(wheelTimerRef.current);
                                    wheelTimerRef.current = null;
                                  }
                                  setWheelPhase("ready");
                                  setSpinResult(null);
                                }}
                                className="flex-1 rounded-xl border border-white/10 bg-[#102943]/75 backdrop-blur-xl py-2.5 text-xs font-bold text-[#E2E8F0] hover:bg-[#173752] hover:border-[#4D8AFF]/50 transition"
                              >
                                Spin Again
                              </button>
                              <button
                                type="button"
                                onClick={closeModal}
                                className="flex-1 rounded-xl bg-gradient-to-r from-[#4D8AFF] to-[#54A3BB] py-2.5 text-xs font-semibold text-white shadow-[0_0_20px_rgba(91,139,255,0.3)] hover:opacity-90 transition"
                              >
                                Done
                              </button>
                            </div>
                          </div>
                        )}

                        {/* CONFIGURED CHALLENGES LIST */}
                        <div className="mt-4 rounded-2xl border border-[#34536A] bg-[#0A2137] p-3.5">
                          <div className="flex items-center justify-between mb-2.5 px-1">
                            <p className="text-[9px] font-semibold uppercase tracking-[.15em] text-[#B8C7D6]">
                              Available Challenges ({wheelOptions.length})
                            </p>
                            <span className="text-[9px] text-[#8EA4B8]">Configured on stream</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-0.5">
                            {wheelOptions.map((opt, idx) => {
                              const isWinner = wheelPhase === "result" && spinResult === opt;
                              const theme = sliceThemes[idx % sliceThemes.length];
                              return (
                                <div
                                  key={idx}
                                  className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                                    isWinner
                                      ? "border-[#4D8AFF] bg-[#4D8AFF]/20 shadow-[0_0_15px_rgba(91,139,255,0.35)] ring-1 ring-[#4D8AFF]"
                                      : "border-[#173752] bg-[#102943]/80 hover:border-[#34536A]"
                                  }`}
                                >
                                  <span
                                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold text-white shadow"
                                    style={{ backgroundColor: theme.fill }}
                                  >
                                    {idx + 1}
                                  </span>
                                  <span
                                    className={`text-xs font-bold leading-tight ${
                                      isWinner ? "text-white font-semibold" : "text-[#E2E8F0]"
                                    }`}
                                  >
                                    {opt}
                                  </span>
                                  {isWinner && (
                                    <span className="ml-auto text-xs text-[#60A5FA] font-semibold">★</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* AMOUNT & SPIN BUTTON (ONLY WHEN NOT IN RESULT PHASE) */}
                        {wheelPhase !== "result" && (
                          <>
                            <div className="mt-4 rounded-2xl border border-[#34536A] bg-[#0A2137] p-4">
                              <div className="flex items-center justify-between">
                                <p className="text-[8px] font-bold uppercase tracking-[.15em] text-[#8EA4B8]">Your Amount</p>
                                <p className="text-sm font-semibold text-[#FFFFFF]">
                                  {String.fromCharCode(8377)}
                                  {selected.price}
                                </p>
                              </div>
                              <input
                                type="number"
                                min={selected.price}
                                step="1"
                                disabled={sending || wheelPhase === "spinning"}
                                value={amountInput}
                                onChange={(e) => setAmountInput(e.target.value)}
                                className="mt-3 h-12 w-full rounded-xl border border-white/10 bg-[#102943]/75 backdrop-blur-xl px-4 text-sm font-semibold text-white outline-none focus:border-[#4D8AFF] disabled:opacity-50"
                              />
                            </div>

                            <button
                              disabled={sending || wheelPhase === "spinning"}
                              onClick={() => {
                                const pool = wheelOptions;
                                const result = pool[Math.floor(Math.random() * pool.length)];
                                sendConfiguredInteraction(result, "spin_wheel");
                              }}
                              className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#4D8AFF] to-[#54A3BB] py-3.5 text-xs font-semibold text-white shadow-[0_0_25px_rgba(91,139,255,0.25)] hover:opacity-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {sending
                                ? "Opening Payment..."
                                : wheelPhase === "spinning"
                                ? "Spinning the Wheel..."
                                : "Spin Now"}
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })()
                ) : selected.id === "tasks" ? (
                  <div className="p-5">
                    <div className="mb-5">
                      <p className="text-sm font-semibold">Give a Task</p>
                      <p className="mt-1 text-[10px] text-[#8EA4B8]">Choose one of the creator&apos;s saved tasks.</p>
                    </div>

                    {(() => {
                      const settings = (selected.settings && typeof selected.settings === "object" && Object.keys(selected.settings).length > 0
                        ? selected.settings
                        : creatorInteractions.find((x) => x.interaction_type === "tasks")?.settings || {}) as Record<string, unknown>;
                      const raw = (settings.tasks ?? settings.options ?? settings.taskList ?? settings.items ?? []) as unknown;
                      const list = Array.isArray(raw) ? raw : [];
                      const values = list
                        .map((x) =>
                          typeof x === "string"
                            ? x.trim()
                            : x && typeof x === "object" && "task" in x
                            ? String((x as { task: unknown }).task).trim()
                            : x && typeof x === "object" && "label" in x
                            ? String((x as { label: unknown }).label).trim()
                            : x && typeof x === "object" && "name" in x
                            ? String((x as { name: unknown }).name).trim()
                            : ""
                        )
                        .filter(Boolean);

                      if (values.length === 0) {
                        return (
                          <div className="rounded-xl border border-white/10 bg-[#102943]/75 backdrop-blur-xl px-4 py-3 text-xs text-[#B8C7D6]">
                            Creator has not added any tasks yet.
                          </div>
                        );
                      }

                      return (
                        <>
                          <select
                            data-task-selection="true"
                            defaultValue=""
                            className="h-12 w-full rounded-xl border border-white/10 bg-[#102943]/75 backdrop-blur-xl px-4 text-sm font-semibold text-white outline-none focus:border-[#4D8AFF]"
                          >
                            <option value="" disabled>Select a Task</option>
                            {values.map((task) => (
                              <option key={task} value={task}>
                                {task}
                              </option>
                            ))}
                          </select>

                          <div className="mt-4 rounded-2xl border border-[#34536A] bg-[#0A2137] p-4">
                            <p className="text-[8px] font-bold uppercase tracking-[.15em] text-[#8EA4B8]">Your Amount</p>
                            <input
                              type="number"
                              min={selected.price}
                              step="1"
                              value={amountInput}
                              onChange={(e) => setAmountInput(e.target.value)}
                              className="mt-3 h-12 w-full rounded-xl border border-white/10 bg-[#102943]/75 backdrop-blur-xl px-4 text-sm font-semibold text-white outline-none focus:border-[#4D8AFF]"
                            />
                          </div>

                          <button
                            disabled={sending}
                            onClick={() => {
                              const el = document.querySelector('[data-task-selection="true"]') as HTMLSelectElement | null;
                              const task = el?.value || "";
                              if (!task) {
                                alert("Please select a task.");
                                return;
                              }
                              sendConfiguredInteraction(task, "tasks");
                            }}
                            className="mt-5 w-full rounded-xl bg-gradient-to-r from-[#4D8AFF] to-[#54A3BB] py-3.5 text-xs font-semibold disabled:opacity-40"
                          >
                            {sending ? "Sending..." : "Send Task"}
                          </button>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  /* =================================================
                     TEXT INTERACTION
                  ================================================== */

                  <div className="p-5">
                    <div className="rounded-xl border border-[#34536A] bg-gradient-to-r from-[#4D8AFF] to-[#54A3BB] p-1 text-center">
                      <div className="rounded-lg bg-transparent py-2.5 text-[10px] font-semibold text-white">
                        Text Message
                      </div>
                    </div>

                    <textarea
                      data-text-interaction="true"
                      placeholder="Type your message..."
                      className="mt-4 h-28 w-full resize-none rounded-xl border border-[#34536A] bg-[#0A2137] p-4 text-sm outline-none placeholder:text-[#61758A] focus:border-[#4D8AFF]"
                    />

                    <div className="mt-5 rounded-2xl border border-[#34536A] bg-[#0A2137] p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[8px] font-bold uppercase tracking-[.15em] text-[#8EA4B8]">
                            Minimum Support
                          </p>

                          <p className="mt-1 text-sm font-semibold text-[#FFFFFF]">
                            {String.fromCharCode(8377)}
                            {selected.price}
                          </p>
                        </div>

                        <span className="rounded-full bg-[#4D8AFF]/10 px-3 py-1.5 text-[8px] font-semibold text-[#6CCEB0]">
                          PAY MORE IF YOU WANT
                        </span>
                      </div>

                      <div className="mt-4">
                        <label className="mb-2 block text-[9px] font-semibold uppercase tracking-[.15em] text-[#8EA4B8]">
                          Your Amount
                        </label>

                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#B8C7D6]">
                            ?
                          </span>

                          <input
                            type="number"
                            min={selected.price}
                            step="1"
                            value={amountInput}
                            onChange={(e) => setAmountInput(e.target.value)}
                            onBlur={() => {
                              const numeric = Number(amountInput);

                              if (
                                !Number.isFinite(numeric) ||
                                !Number.isInteger(numeric) ||
                                numeric < selected.price
                              ) {
                                setAmountInput(String(selected.price));
                              } else {
                                setAmountInput(String(Math.floor(numeric)));
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const numeric = Number(amountInput);

                                if (
                                  !Number.isFinite(numeric) ||
                                  !Number.isInteger(numeric) ||
                                  numeric < selected.price
                                ) {
                                  setAmountInput(String(selected.price));
                                }
                              }
                            }}
                            placeholder={String(selected.price)}
                            className="h-12 w-full rounded-xl border border-white/10 bg-[#102943]/75 backdrop-blur-xl pl-9 pr-4 text-sm font-semibold text-[#F8FAFC] outline-none transition placeholder:text-[#61758A] focus:border-[#4D8AFF] focus:ring-1 focus:ring-[#4D8AFF]/30"
                          />
                        </div>

                        <div className="mt-2 flex items-center justify-between">
                          <p className="text-[8px] text-[#8EA4B8]">
                            Minimum: {String.fromCharCode(8377)}
                            {selected.price}
                          </p>

                          <p className="text-[8px] text-[#6CCEB0]">Enter any higher amount</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex items-end gap-4 border-t border-[#34536A] pt-4">
                      <div>
                        <p className="text-[9px] text-[#8EA4B8]">Total</p>

                        <p className="text-2xl font-semibold text-[#FFFFFF]">
                          ?{Number(amountInput) >= selected.price ? Number(amountInput) : selected.price}
                        </p>
                      </div>

                      <button
                        disabled={
                          sending ||
                          !amountInput ||
                          !Number.isInteger(Number(amountInput)) ||
                          Number(amountInput) < selected.price
                        }
                        onClick={sendTextInteraction}
                        className="flex-1 rounded-xl bg-gradient-to-r from-[#4D8AFF] to-[#54A3BB] py-3.5 text-xs font-semibold shadow-[0_0_30px_rgba(91,139,255,.25)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {sending ? "Sending..." : "Pay & Send"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      <style jsx global>{`
        @property --ss-angle { syntax: "<angle>"; initial-value: 0deg; inherits: false; }

        /* ---------- BASE (unchanged) ---------- */
        .streamlounge-page { position: relative; isolation: isolate; background-attachment: fixed; font-family: var(--font-geist-sans), Inter, Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important; letter-spacing: -0.035em; font-weight: 400; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
        .streamlounge-page, .streamlounge-page * { font-family: inherit; }
        .streamlounge-page h1, .streamlounge-page h2, .streamlounge-page h3, .streamlounge-page p, .streamlounge-page button, .streamlounge-page input, .streamlounge-page textarea, .streamlounge-page label, .streamlounge-page a, .interaction-dialog { font-family: var(--font-geist-sans), Inter, Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important; }
        .streamlounge-page > *:not(.ambient-lights):not(header) { position: relative; z-index: 1; }
        .streamlounge-page h1, .streamlounge-page h2 { text-wrap: balance; }
        .streamlounge-page img { transition: transform .65s cubic-bezier(.2,.8,.2,1), filter .4s ease; }
        .streamlounge-page img:hover { filter: saturate(1.12); }
        .streamlounge-page a { transition: color .25s ease, opacity .25s ease; }
        .streamlounge-page [role="button"], .streamlounge-page button, .streamlounge-page [class*="cursor-pointer"] { -webkit-tap-highlight-color: transparent; }
        .streamlounge-page button:focus-visible, .streamlounge-page [role="button"]:focus-visible { outline: 2px solid rgba(167,139,250,.85); outline-offset: 3px; }
        .streamlounge-page input:focus, .streamlounge-page textarea:focus, .streamlounge-page select:focus { outline: none; border-color: rgba(108,206,176,.7) !important; box-shadow: 0 0 0 3px rgba(108,206,176,.1), 0 0 24px rgba(84,67,187,.12); }
        .streamlounge-page .animate-spin { filter: drop-shadow(0 0 10px rgba(108,206,176,.24)); }
        .streamlounge-page [class*="bg-gradient-to-r"], .interaction-dialog [class*="bg-gradient-to-r"] { background-image: linear-gradient(110deg, #6CCEB0 0%, #4D8AFF 34%, #5443BB 72%, #6CCEB0 100%); background-size: 240% 100%; animation: gradient-flow 16s ease-in-out infinite; }

        /* ---------- BACKGROUND (unchanged) ---------- */
        .ambient-lights { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 0; contain: paint; }
        .ambient-orb { position: absolute; display: block; border-radius: 9999px; filter: blur(78px); opacity: .48; will-change: transform; }
        .ambient-orb-one { width: 36rem; height: 36rem; top: 12rem; left: -15rem; background: #8B79D6; opacity: .32; animation: orb-drift-one 30s ease-in-out infinite alternate; }
        .ambient-orb-two { width: 31rem; height: 31rem; top: 38rem; right: -13rem; background: #162A50; opacity: .56; animation: orb-drift-two 34s ease-in-out infinite alternate; }
        .ambient-orb-three { width: 25rem; height: 25rem; top: 80rem; left: 38%; background: #7665C7; opacity: .14; animation: orb-drift-three 38s ease-in-out infinite alternate; }
        .ambient-orb-four { width: 18rem; height: 18rem; top: 16rem; right: 14%; background: #4D8AFF; opacity: .07; animation: orb-drift-two 36s ease-in-out infinite alternate-reverse; }
        .ambient-grid { position: absolute; inset: 0; opacity: .045; background-image: linear-gradient(rgba(199,210,254,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(199,210,254,.18) 1px, transparent 1px); background-size: 62px 62px; mask-image: linear-gradient(to bottom, black, transparent 82%); animation: grid-breathe 12s ease-in-out infinite alternate; }
        .ambient-noise { position: absolute; inset: 0; opacity: .045; background-image: radial-gradient(rgba(255,255,255,.7) .55px, transparent .7px); background-size: 5px 5px; mask-image: linear-gradient(135deg, black, transparent 70%); }
        .ambient-beam { position: absolute; display: block; width: 1px; height: 60rem; top: -10rem; opacity: .2; transform: rotate(32deg); transform-origin: top; background: linear-gradient(to bottom, transparent, #6CCEB0, rgba(108,206,176,.12), transparent); filter: blur(1px); }
        .ambient-beam-one { left: 22%; opacity: .07; background: linear-gradient(to bottom, transparent, #A78BFA, rgba(167,139,250,.08), transparent); animation: beam-sway 28s ease-in-out infinite alternate; }
        .ambient-beam-two { right: 20%; height: 48rem; opacity: .06; background: linear-gradient(to bottom, transparent, #4D8AFF, transparent); animation: beam-sway 24s ease-in-out infinite alternate-reverse; }
        .ambient-ring { position: absolute; display: block; border: 1px solid rgba(199,210,254,.12); border-radius: 50%; width: 34rem; height: 34rem; right: -14rem; top: 14rem; box-shadow: 0 0 70px rgba(84,67,187,.08), inset 0 0 70px rgba(77,138,255,.04); animation: ring-float 34s linear infinite; }
        .ambient-ring-two { width: 24rem; height: 24rem; right: -9rem; top: 19rem; border-color: rgba(108,206,176,.12); animation-duration: 27s; animation-direction: reverse; }
        @keyframes orb-drift-one { from { transform: translate3d(0,0,0) scale(1); } to { transform: translate3d(95px,70px,0) scale(1.12); } }
        @keyframes orb-drift-two { from { transform: translate3d(0,0,0) scale(1); } to { transform: translate3d(-75px,-65px,0) scale(1.1); } }
        @keyframes orb-drift-three { from { transform: translate3d(-25px,0,0) scale(.95); } to { transform: translate3d(55px,-85px,0) scale(1.12); } }
        @keyframes gradient-flow { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
        @keyframes grid-breathe { from { opacity: .07; transform: translateY(0); } to { opacity: .15; transform: translateY(12px); } }
        @keyframes beam-sway { from { transform: rotate(28deg) translateX(-20px); opacity: .08; } to { transform: rotate(38deg) translateX(35px); opacity: .23; } }
        @keyframes ring-float { from { transform: rotate(0deg) translateY(0); } 50% { transform: rotate(180deg) translateY(18px); } to { transform: rotate(360deg) translateY(0); } }

        /* =====================================================
           NEW ANIMATIONS
        ===================================================== */

        /* 1. Page entrance: header drops, panels rise out of a blur, cards cascade in 3D */
        @keyframes ss-drop { from { opacity: 0; transform: translate3d(0,-28px,0); filter: blur(6px); } to { opacity: 1; transform: none; filter: none; } }
        @keyframes ss-rise { from { opacity: 0; transform: translate3d(0,30px,0) scale(.985); filter: blur(9px); } to { opacity: 1; transform: none; filter: none; } }
        @keyframes ss-card-in { from { opacity: 0; transform: perspective(900px) translate3d(0,40px,0) rotateX(14deg) scale(.95); filter: blur(10px); } to { opacity: 1; transform: perspective(900px) none; filter: none; } }
        .streamlounge-page header { background: rgba(10,25,48,.76) !important; border-color: rgba(199,210,254,.17) !important; box-shadow: 0 8px 38px rgba(3,8,24,.22); backdrop-filter: blur(22px); animation: ss-drop .85s cubic-bezier(.16,1,.3,1) backwards; }
        .streamlounge-page aside > * { animation: ss-rise 1s cubic-bezier(.16,1,.3,1) backwards; }
        .streamlounge-page aside > *:nth-child(1) { animation-delay: .15s; }
        .streamlounge-page aside > *:nth-child(2) { animation-delay: .27s; }
        .streamlounge-page aside > *:nth-child(3) { animation-delay: .39s; }
        .streamlounge-page section > div.mb-5 { animation: ss-rise 1s cubic-bezier(.16,1,.3,1) .1s backwards; }
        .streamlounge-page section > div.mt-4.grid { animation: ss-rise 1s cubic-bezier(.16,1,.3,1) .75s backwards; }
        .streamlounge-page section.rounded-3xl, .streamlounge-page section.mt-6, .streamlounge-page section.mt-4 { animation: ss-rise 1s cubic-bezier(.16,1,.3,1) backwards; }
        .streamlounge-page section.mt-6 { animation-delay: .2s; }
        .streamlounge-page section.mt-4 { animation-delay: .3s; }

        /* 2. Interaction cards: cascade, 3D tilt that follows the cursor, light spotlight, orbiting border */
        .streamlounge-page button.group.rounded-2xl { --rx: 0deg; --ry: 0deg; --mx: 50%; --my: 50%; background: rgba(22,42,77,.88) !important; border-color: rgba(129,151,213,.35) !important; box-shadow: 0 12px 32px rgba(4,12,35,.12); transition: transform .7s cubic-bezier(.16,1,.3,1), background-color .5s ease, border-color .5s ease, box-shadow .5s ease !important; animation: ss-card-in 1s cubic-bezier(.16,1,.3,1) backwards; will-change: transform; }
        .streamlounge-page button.group.rounded-2xl:nth-child(1) { animation-delay: .35s; }
        .streamlounge-page button.group.rounded-2xl:nth-child(2) { animation-delay: .43s; }
        .streamlounge-page button.group.rounded-2xl:nth-child(3) { animation-delay: .51s; }
        .streamlounge-page button.group.rounded-2xl:nth-child(4) { animation-delay: .59s; }
        .streamlounge-page button.group.rounded-2xl:nth-child(5) { animation-delay: .67s; }
        .streamlounge-page button.group.rounded-2xl:nth-child(6) { animation-delay: .75s; }
        .streamlounge-page button.group.rounded-2xl:hover:not(:disabled) { transform: perspective(900px) rotateX(var(--rx)) rotateY(var(--ry)) translateY(-6px); background: rgba(37,48,91,.94) !important; border-color: rgba(167,139,250,.55) !important; box-shadow: 0 24px 60px rgba(5,10,35,.34), 0 0 34px rgba(132,111,197,.2); transition: transform .16s ease-out, background-color .5s ease, border-color .5s ease, box-shadow .5s ease !important; }
        .streamlounge-page button.group.rounded-2xl:active:not(:disabled) { transform: perspective(900px) translateY(-2px) scale(.985); }
        .streamlounge-page button.group.rounded-2xl::before { content: ""; position: absolute; inset: 0; border-radius: inherit; background: radial-gradient(380px circle at var(--mx) var(--my), rgba(108,206,176,.18), rgba(167,139,250,.1) 38%, transparent 66%); opacity: 0; transition: opacity .45s ease; pointer-events: none; }
        .streamlounge-page button.group.rounded-2xl:hover:not(:disabled)::before { opacity: 1; }
        .streamlounge-page button.group.rounded-2xl::after { content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1.5px; background: conic-gradient(from var(--ss-angle), transparent 0 58%, #6CCEB0 76%, #A78BFA 88%, transparent 100%); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); mask-composite: exclude; opacity: 0; transition: opacity .5s ease; pointer-events: none; animation: ss-spin 3.6s linear infinite; }
        .streamlounge-page button.group.rounded-2xl:hover:not(:disabled)::after { opacity: 1; }
        @keyframes ss-spin { to { --ss-angle: 360deg; } }

        /* 3. Icon tiles float on their own rhythm and spring when the card is hovered */
        .streamlounge-page button.group [class*="bg-gradient-to-br"] { animation: ss-float 5.5s ease-in-out infinite; }
        .streamlounge-page button.group:nth-child(2n) [class*="bg-gradient-to-br"] { animation-delay: -1.8s; }
        .streamlounge-page button.group:nth-child(3n) [class*="bg-gradient-to-br"] { animation-delay: -3.4s; }
        .streamlounge-page button.group:hover:not(:disabled) [class*="bg-gradient-to-br"] { animation: ss-spring .8s cubic-bezier(.34,1.56,.64,1); }
        @keyframes ss-float { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-5px) rotate(-2deg); } }
        @keyframes ss-spring { 0% { transform: scale(1) rotate(0deg); } 35% { transform: scale(1.2) rotate(-9deg); } 65% { transform: scale(.94) rotate(5deg); } 100% { transform: scale(1) rotate(0deg); } }

        /* 4. "ACTIVE" chips pulse, the CTA arrow nudges forward */
        .streamlounge-page button.group span[class*="text-emerald-400"]::before { content: ""; display: inline-block; width: 5px; height: 5px; margin-right: 6px; border-radius: 50%; background: #6CCEB0; vertical-align: middle; box-shadow: 0 0 0 0 rgba(108,206,176,.6); animation: ss-blip 1.9s ease-out infinite; }
        @keyframes ss-blip { 0% { box-shadow: 0 0 0 0 rgba(108,206,176,.65); } 80%,100% { box-shadow: 0 0 0 7px rgba(108,206,176,0); } }
        .streamlounge-page button.group.rounded-2xl > div:last-child { transition: transform .55s cubic-bezier(.34,1.56,.64,1), letter-spacing .4s ease; }
        .streamlounge-page button.group.rounded-2xl:hover:not(:disabled) > div:last-child { transform: translateX(8px); }

        /* 5. Headline: a soft light sweeps across it now and then */
        .streamlounge-page h2 { background: linear-gradient(100deg, #fff 0%, #fff 40%, #cfc6fa 47%, #6CCEB0 51%, #fff 58%, #fff 100%); background-size: 260% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: ss-shine 8s ease-in-out infinite; }
        @keyframes ss-shine { 0%,50% { background-position: 125% 0; } 100% { background-position: -125% 0; } }

        /* 6. Gradient buttons get a light sheen on hover; avatar breathes a ring */
        .streamlounge-page button[class*="bg-gradient-to-r"], .interaction-dialog button[class*="bg-gradient-to-r"] { position: relative; overflow: hidden; }
        .streamlounge-page button[class*="bg-gradient-to-r"]::after, .interaction-dialog button[class*="bg-gradient-to-r"]::after { content: ""; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 32%, rgba(255,255,255,.38) 50%, transparent 68%); transform: translateX(-130%); pointer-events: none; }
        .streamlounge-page button[class*="bg-gradient-to-r"]:hover:not(:disabled)::after, .interaction-dialog button[class*="bg-gradient-to-r"]:hover:not(:disabled)::after { animation: ss-sheen .85s ease; }
        @keyframes ss-sheen { to { transform: translateX(130%); } }
        .streamlounge-page [class*="rounded-full"][class*="border-4"] { animation: ss-ring 3.4s ease-out infinite; }
        @keyframes ss-ring { 0% { box-shadow: 0 0 0 0 rgba(108,206,176,.42), 0 0 30px rgba(91,139,255,.35); } 70%,100% { box-shadow: 0 0 0 18px rgba(108,206,176,0), 0 0 30px rgba(91,139,255,.35); } }

        /* 7. Side panels glide up on hover; nav links draw an underline */
        .streamlounge-page aside > div, .streamlounge-page section.rounded-2xl { transition: transform .5s cubic-bezier(.2,.8,.2,1), border-color .4s ease, box-shadow .4s ease; }
        .streamlounge-page aside > div:hover, .streamlounge-page section.rounded-2xl:hover { transform: translateY(-4px); border-color: rgba(108,206,176,.36); box-shadow: 0 20px 58px rgba(5,10,35,.22), 0 0 24px rgba(84,67,187,.12); }
        .streamlounge-page button { transition: transform .5s cubic-bezier(.2,.8,.2,1), box-shadow .5s ease, filter .5s ease, border-color .5s ease, background-color .5s ease; }
        .streamlounge-page button:hover:not(:disabled):not(.group) { filter: brightness(1.09); }
        .streamlounge-page button:active:not(:disabled):not(.group) { transform: scale(.985); }
        .streamlounge-page nav a { position: relative; }
        .streamlounge-page nav a::after { content: ''; position: absolute; left: 0; right: 100%; bottom: -7px; height: 1px; background: linear-gradient(90deg, #6CCEB0, #4D8AFF); transition: right .35s cubic-bezier(.2,.8,.2,1); }
        .streamlounge-page nav a:hover::after { right: 0; }
        .streamlounge-page nav a:hover { color: #C7D2FE; }

        /* 8. Modal: springs up from below, then its content cascades in */
        .interaction-backdrop { animation: viewer-backdrop-in .5s cubic-bezier(.16,1,.3,1) both; overscroll-behavior: contain; }
        .interaction-dialog { transform-origin: 50% 100%; backface-visibility: hidden; will-change: opacity, transform, filter; animation: viewer-dialog-in .9s cubic-bezier(.22,1.15,.36,1) both; }
        .interaction-dialog > div { scrollbar-width: thin; scrollbar-color: rgba(167,139,250,.42) transparent; }
        .interaction-dialog > .flex-1 { overscroll-behavior: contain; scroll-behavior: smooth; }
        .interaction-dialog > .flex-1 > div > * { animation: ss-pop .65s cubic-bezier(.16,1,.3,1) backwards; }
        .interaction-dialog > .flex-1 > div > *:nth-child(1) { animation-delay: .14s; }
        .interaction-dialog > .flex-1 > div > *:nth-child(2) { animation-delay: .2s; }
        .interaction-dialog > .flex-1 > div > *:nth-child(3) { animation-delay: .26s; }
        .interaction-dialog > .flex-1 > div > *:nth-child(4) { animation-delay: .32s; }
        .interaction-dialog > .flex-1 > div > *:nth-child(5) { animation-delay: .38s; }
        .interaction-dialog > .flex-1 > div > *:nth-child(6) { animation-delay: .44s; }
        .interaction-dialog > .flex-1 > div > *:nth-child(7) { animation-delay: .5s; }
        .interaction-dialog button, .interaction-dialog input, .interaction-dialog textarea, .interaction-dialog select { -webkit-tap-highlight-color: transparent; transition: background-color .3s ease, border-color .3s ease, box-shadow .35s ease, color .25s ease, transform .35s cubic-bezier(.2,.8,.2,1), opacity .25s ease; }
        .interaction-dialog button:hover:not(:disabled) { transform: translateY(-2px); }
        .interaction-dialog button:active:not(:disabled) { transform: scale(.975); }
        .interaction-dialog .animate-spin { animation-timing-function: cubic-bezier(.12,.75,.18,1) !important; }
        @keyframes viewer-backdrop-in { from { opacity: 0; backdrop-filter: blur(0); } to { opacity: 1; backdrop-filter: blur(16px); } }
        @keyframes viewer-dialog-in { 0% { opacity: 0; transform: translate3d(0,56px,0) scale(.93); filter: blur(10px); } 55% { opacity: 1; filter: blur(0); } 100% { opacity: 1; transform: translate3d(0,0,0) scale(1); filter: blur(0); } }
        @keyframes ss-pop { from { opacity: 0; transform: translate3d(0,18px,0) scale(.97); } to { opacity: 1; transform: none; } }

        @media (prefers-reduced-motion: reduce) {
          .interaction-backdrop, .interaction-dialog, .interaction-dialog > .flex-1 > div > *, .ambient-orb, .ambient-grid, .ambient-beam, .ambient-ring, .streamlounge-page header, .streamlounge-page aside > *, .streamlounge-page section, .streamlounge-page section > div, .streamlounge-page button.group, .streamlounge-page button.group *, .streamlounge-page h2, .streamlounge-page [class*="bg-gradient-to-r"], .streamlounge-page [class*="border-4"] { animation: none !important; }
          .streamlounge-page *, .streamlounge-page *::before, .streamlounge-page *::after { transition-duration: .01ms !important; scroll-behavior: auto !important; }
        }
      `}</style>

      {/* =====================================================
          FOOTER
      ====================================================== */}

      <footer className="border-t border-[#34536A]/50 py-6 text-center">
        <p className="text-[9px] text-[#61758A]">? Powered by StreamLounge</p>
      </footer>
    </main>
  );
}
