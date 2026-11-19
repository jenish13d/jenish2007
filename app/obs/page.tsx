"use client";

import { useEffect, useRef, useState, Suspense, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import {
  DEFAULT_OVERLAY_THEME,
  isValidOverlayTheme,
  OVERLAY_THEME_CONFIGS,
  OverlayThemeId,
  resolveOverlayTheme,
} from "@/lib/overlay/themes";

type OverlayEvent = {
  id: string;
  token?: string;
  interaction_type: string;
  sender_name: string;
  message: string;
  /** null when the creator hides amounts. */
  amount: number | null;
  metadata?: Record<string, unknown>;
  announce?: boolean;
  announcement?: string;
};

type OverlayPrefs = {
  alert_duration_ms: number;
  alert_position: string;
  sound_alerts_enabled: boolean;
  animated_alerts_enabled: boolean;
  announcer_muted: boolean;
  announcer_voice: string;
  announcer_rate: number;
  announcer_volume: number;
};

// Flex alignment for each configurable alert position.
const POSITION_STYLE: Record<string, { alignItems: string; justifyContent: string }> = {
  "top-left": { alignItems: "flex-start", justifyContent: "flex-start" },
  "top-center": { alignItems: "flex-start", justifyContent: "center" },
  "top-right": { alignItems: "flex-start", justifyContent: "flex-end" },
  center: { alignItems: "center", justifyContent: "center" },
  "bottom-left": { alignItems: "flex-end", justifyContent: "flex-start" },
  "bottom-center": { alignItems: "flex-end", justifyContent: "center" },
  "bottom-right": { alignItems: "flex-end", justifyContent: "flex-end" },
};

/** A short two-note chime made with Web Audio, so no audio file is needed. */
function playChime(volume: number) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1318.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      const start = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18 * volume, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.5);
    });
    window.setTimeout(() => ctx.close(), 1200);
  } catch {
    /* Audio unavailable: the visual alert still shows. */
  }
}

/**
 * Extracts a log-safe message from an unknown caught value.
 *
 * Signed media URLs carry a query string with the signature in it, so anything
 * after "?" is stripped before the message reaches a log an operator might
 * paste somewhere.
 */
/** Narrows an unknown metadata value to a non-empty string, or undefined. */
function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function errorMessage(error: unknown, fallback = "Playback error"): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  return raw.split("?")[0] || fallback;
}

function OBSOverlayInner() {
  const searchParams = useSearchParams();

  // The overlay key is a per-creator secret, rotatable from the dashboard. It
  // replaces the public username this page previously used: polling claims the
  // next queued event, so a public identifier let anyone drain a creator's paid
  // alerts.
  const overlayKey = searchParams.get("key") ?? "";

  // Theme override for previewing: /obs?key=…&theme=crimson
  const urlThemeParam = searchParams.get("theme");
  const validatedUrlTheme = isValidOverlayTheme(urlThemeParam)
    ? urlThemeParam
    : null;

  const [creatorTheme, setCreatorTheme] =
    useState<OverlayThemeId>(DEFAULT_OVERLAY_THEME);
  const [event, setEvent] = useState<OverlayEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [result, setResult] = useState("");
  const [keyRejected, setKeyRejected] = useState(false);

  const [prefs, setPrefs] = useState<OverlayPrefs | null>(null);
  const prefsRef = useRef<OverlayPrefs | null>(null);
  const announcerAudioRef = useRef<HTMLAudioElement | null>(null);
  const spokenRef = useRef<Set<string>>(new Set());

  const busyRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const activeTheme: OverlayThemeId =
    validatedUrlTheme || creatorTheme || DEFAULT_OVERLAY_THEME;
  const themeConfig = OVERLAY_THEME_CONFIGS[activeTheme];

  useEffect(() => {
    if (!overlayKey) return;

    let stopped = false;

    const checkEvent = async () => {
      if (stopped || busyRef.current) return;

      try {
        const response = await fetch(
          `/api/overlay/event?key=${encodeURIComponent(overlayKey)}`,
          { cache: "no-store" },
        );

        const data = await response.json();

        if (response.status === 401) {
          // The key was rotated or is wrong. Stop polling rather than hammering
          // the endpoint once a second forever, and say so on the canvas so the
          // creator sees it in the OBS preview.
          stopped = true;
          clearInterval(interval);
          setKeyRejected(true);
          return;
        }

        // Update creator's saved theme from the server response if not overridden by URL
        if (data?.theme && !validatedUrlTheme) {
          setCreatorTheme(resolveOverlayTheme(data.theme));
        }

        if (data?.preferences) {
          prefsRef.current = data.preferences;
          setPrefs(data.preferences);
        }

        if (data?.event) {
          await playEvent(data.event);
        }
      } catch (error) {
        console.error("OBS POLL ERROR:", error);
      }
    };

    const interval = setInterval(checkEvent, 1000);
    checkEvent();

    // While an alert is playing the main poll pauses; a light read-only poll
    // still picks up an emergency mute and silences the announcer at once.
    const peek = setInterval(async () => {
      if (stopped || !busyRef.current) return;
      try {
        const r = await fetch(`/api/overlay/event?key=${encodeURIComponent(overlayKey)}&peek=1`, { cache: "no-store" });
        const d = await r.json();
        if (d?.preferences) {
          prefsRef.current = d.preferences;
          setPrefs(d.preferences);
          if (d.preferences.announcer_muted) stopAnnouncer();
        }
      } catch {
        /* ignore */
      }
    }, 2000);

    return () => {
      stopped = true;
      clearInterval(interval);
      clearInterval(peek);
      stopAnnouncer();

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [overlayKey, validatedUrlTheme]);

  async function finishEvent(
    id: string,
    token?: string,
    status: "completed" | "failed" = "completed",
    error?: string
  ) {
    try {
      await fetch("/api/overlay/event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, token, status, error }),
      });
    } catch (error) {
      console.error("FINISH EVENT ERROR:", error);
    }
  }

  async function playEvent(incoming: OverlayEvent) {
    if (busyRef.current) return;

    busyRef.current = true;

    setEvent(incoming);
    setResult(incoming.message || "");
    setVisible(true);

    const type = String(incoming.interaction_type || "").toLowerCase();
    const metadata = incoming.metadata || {};

    // Standard 5-second visual duration for alerts
    let duration = 5000;
    let playbackStatus: "completed" | "failed" = "completed";
    let playbackError: string | undefined = undefined;

    const handleMediaError = (err: Error) => {
      playbackStatus = "failed";
      playbackError = err.message;
    };

    try {
      if (type === "audio") {
        const url = asString(metadata.audio_url);

        if (url) {
          await playAudio(url, handleMediaError);
          duration = 8000;
        } else {
          playbackStatus = "failed";
          playbackError = "Missing audio url";
          duration = 5000;
        }
      }

      if (type === "soundboard") {
        // The event endpoint resolves the sound server-side, scoped to the
        // creator, and hands back a signed URL. There is no client-side
        // fallback: the proxy route this previously fell back to accepted an
        // arbitrary path, was unauthenticated, and could read any object in the
        // private bucket.
        const directUrl = asString(metadata.sound_url) ?? null;
        const proxyUrl = null;

        let played = false;
        if (directUrl) {
          try {
            await playAudio(directUrl, (err) => {
              console.warn(
                "[OBS Audio] Direct playback error:",
                err?.message?.split("?")[0] || "error"
              );
            });
            played = true;
          } catch {
            console.warn(
              "[OBS Audio] Direct sound URL failed, attempting proxy fallback"
            );
          }
        }

        if (!played && proxyUrl) {
          try {
            await playAudio(proxyUrl, handleMediaError);
            played = true;
          } catch (err: unknown) {
            handleMediaError(
              err instanceof Error ? err : new Error(errorMessage(err)),
            );
          }
        }

        if (played) {
          duration = 8000;
        } else {
          playbackStatus = "failed";
          playbackError = playbackError || "Soundboard audio playback failed";
          duration = 5000;
        }
      }

      if (type === "text") {
        duration = 5000;
      }

      if (type === "stickers") {
        duration = 5000;
      }

      if (type === "spin_wheel") {
        setResult(
          String(
            metadata.result ||
              incoming.message ||
              "Wheel Result"
          )
        );
        duration = 5000;
      }

      if (type === "tasks") {
        setResult(
          String(
            metadata.result ||
              incoming.message ||
              "Task"
          )
        );
        duration = 5000;
      }
    } catch (error: unknown) {
      const sanitized = errorMessage(error);
      console.warn("[OBS Audio] Event play error:", sanitized);
      playbackStatus = "failed";
      playbackError = sanitized;
    }

    const current = prefsRef.current;
    if (current) duration = Math.max(duration, current.alert_duration_ms);
    if (current?.sound_alerts_enabled && type !== "audio" && type !== "soundboard") {
      playChime(current.announcer_volume ?? 1);
    }
    if (incoming.announce && incoming.announcement && !spokenRef.current.has(incoming.id)) {
      spokenRef.current.add(incoming.id);
      if (spokenRef.current.size > 200) spokenRef.current.clear();
      const spokenMs = await announce(incoming);
      duration = Math.max(duration, Math.min(spokenMs + 1200, 30000));
    }

    timerRef.current = setTimeout(async () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }

      setVisible(false);

      await finishEvent(
        incoming.id,
        incoming.token,
        playbackStatus,
        playbackError
      );

      setTimeout(() => {
        setEvent(null);
        setResult("");
        busyRef.current = false;
      }, 300);
    }, duration);
  }

  function stopAnnouncer() {
    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    if (announcerAudioRef.current) {
      announcerAudioRef.current.pause();
      announcerAudioRef.current = null;
    }
  }

  /**
   * Speaks the server-built announcement. Uses the browser's speech engine
   * when it has voices; otherwise (typical in OBS/Streamlabs) falls back to
   * the server voice. Resolves with roughly how long it will speak, so the
   * alert stays up until the announcement ends. Never blocks for long.
   */
  async function announce(incoming: OverlayEvent): Promise<number> {
    const current = prefsRef.current;
    if (!incoming.announcement || current?.announcer_muted) return 0;
    const text = incoming.announcement;
    const estimate = Math.round((text.split(/\s+/).length / 2.6) * 1000 / (current?.announcer_rate || 1));

    const synth = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
    const voices = synth?.getVoices() ?? [];
    if (synth && voices.length > 0) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = current?.announcer_rate ?? 1;
      utterance.volume = current?.announcer_volume ?? 1;
      const voice = voices.find((v) => v.name === current?.announcer_voice);
      if (voice) utterance.voice = voice;
      synth.cancel();
      synth.speak(utterance);
      return estimate;
    }

    if (!incoming.token) return 0;
    try {
      const response = await fetch(
        `/api/overlay/announce?id=${encodeURIComponent(incoming.id)}&token=${encodeURIComponent(incoming.token)}`,
        { cache: "no-store" },
      );
      if (!response.ok || response.status === 204) return 0;
      const blob = await response.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audio.volume = current?.announcer_volume ?? 1;
      announcerAudioRef.current = audio;
      await audio.play();
      return Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration * 1000 : estimate;
    } catch {
      // No voice available at all: the on-screen alert is the fallback.
      return 0;
    }
  }

  async function playAudio(url: string, onError?: (err: Error) => void) {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }

      const safeUrl = url.split("?")[0];

      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Audio HTTP ${response.status} from ${safeUrl}`);
      }

      const blob = await response.blob();

      if (!blob.size) {
        throw new Error(`Audio file is empty from ${safeUrl}`);
      }

      const blobUrl = URL.createObjectURL(blob);
      const audio = document.createElement("audio");

      audio.preload = "auto";
      audio.volume = 1;
      audio.muted = false;
      audio.src = blobUrl;

      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(blobUrl);
      };

      audio.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        const errMsg = audio.error ? `Code ${audio.error.code}` : "unknown error";
        console.warn(`[OBS Audio] Element error: ${errMsg}`);
        if (onError) {
          onError(new Error(`Media element error: ${errMsg}`));
        }
      };

      try {
        await audio.play();
      } catch (playErr: unknown) {
        console.warn("[OBS Audio] play() notice:", errorMessage(playErr, "playback prevented"));
        if (onError) {
          onError(playErr instanceof Error ? playErr : new Error(String(playErr)));
        }
        throw playErr;
      }
    } catch (error: unknown) {
      const sanitized = errorMessage(error);
      console.warn("[OBS Audio Error]:", sanitized);
      if (onError) {
        onError(error instanceof Error ? error : new Error(sanitized));
      }
      throw error;
    }
  }

  // A missing or rejected key is reported on the canvas. In an OBS browser
  // source there is no address bar and no console in view, so a silently blank
  // overlay is indistinguishable from "no alerts yet" — which is exactly the
  // confusion a creator hits after rotating their key and forgetting to update
  // OBS.
  if (!overlayKey || keyRejected) {
    return (
      <main
        style={{
          width: "100vw",
          height: "100vh",
          background: "transparent",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div
          style={{
            padding: "20px 28px",
            borderRadius: "16px",
            border: "2px solid #b91c1c",
            background: "rgba(10, 14, 31, 0.92)",
            color: "#fecaca",
            maxWidth: "36rem",
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          <p style={{ margin: 0, fontWeight: 700, fontSize: "18px" }}>
            {overlayKey
              ? "This overlay URL is no longer valid"
              : "This overlay URL is missing its key"}
          </p>
          <p style={{ margin: "8px 0 0", fontSize: "14px", color: "#fca5a5" }}>
            Open StreamLounge, go to OBS Setup, and copy the current browser
            source URL into OBS.
          </p>
        </div>
      </main>
    );
  }

  if (!visible || !event) {
    return (
      <main
        style={{
          width: "100vw",
          height: "100vh",
          background: "transparent",
          overflow: "hidden",
        }}
      />
    );
  }

  const type = String(event.interaction_type || "").toLowerCase();
  const metadata = event.metadata || {};

  const isWheel = type === "spin_wheel";
  const isTask = type === "tasks";
  const isAudio = type === "audio";
  const isSoundboard = type === "soundboard";
  const isSticker = type === "stickers";

  // AI sticker image resolution.
  //
  // Several key names are accepted because submissions created by earlier
  // versions of the app used different ones; `sticker_url` is what the rebuilt
  // submission endpoint writes.
  const stickerImageUrl =
    asString(metadata.sticker_url) ??
    asString(metadata.image_url) ??
    asString(metadata.imageData) ??
    asString(metadata.image) ??
    null;

  const interactionLabel =
    isWheel
      ? "WHEEL"
      : isTask
      ? "TASK"
      : isAudio
      ? "VOICE"
      : isSoundboard
      ? "SOUND"
      : isSticker
      ? "AI STICKER"
      : "SUPPORT";

  const messageText = isWheel || isTask ? result : event.message || "New Interaction";
  const msgLength = messageText.length;
  const messageFontSize = msgLength > 100 ? "13px" : msgLength > 50 ? "15px" : "18px";

  return (
    <main
      style={{
        width: "100vw",
        height: "100vh",
        background: "transparent",
        overflow: "hidden",
        display: "flex",
        ...(POSITION_STYLE[prefs?.alert_position ?? "center"] ?? POSITION_STYLE.center),
        padding: "24px",
        boxSizing: "border-box",
        pointerEvents: "none",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Alert Container: strict 720 x 304 aspect ratio preserving metallic artwork */}
      <div
        id="streamlounge-alert-frame"
        style={{
          position: "relative",
          width: "720px",
          height: "304px",
          maxWidth: "95vw",
          aspectRatio: "720 / 304",
          animation: "alertPopIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        }}
      >
        {/* Layer 1: Selected Predefined Frame Artwork */}
        <img
          src={themeConfig.frameAsset}
          alt={`${themeConfig.name} Alert Frame`}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />

        {/* Layer 2: Inner Content Rectangle (Nested perfectly inside the transparent frame cutout) */}
        <div
          style={{
            position: "absolute",
            top: "26%",
            bottom: "24%",
            left: "19.5%",
            right: "19.5%",
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            gap: "14px",
            overflow: "hidden",
            boxSizing: "border-box",
            padding: "4px 8px",
          }}
        >
          {/* Left Visual Focal Zone (88x88px) */}
          <div
            style={{
              width: "88px",
              height: "88px",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            {isWheel ? (
              <div
                style={{
                  width: "84px",
                  height: "84px",
                  borderRadius: "50%",
                  border: `3px solid ${themeConfig.accent}`,
                  boxShadow: `0 0 20px ${themeConfig.glow}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: `conic-gradient(${themeConfig.accent}, #A855F7, #EC4899, ${themeConfig.accent})`,
                  animation: "wheelSpin 1.4s cubic-bezier(0.15, 0.9, 0.3, 1)",
                }}
              >
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    background: "#0A0E1F",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "24px",
                  }}
                >
                  🎡
                </div>
              </div>
            ) : isTask ? (
              <div
                style={{
                  width: "80px",
                  height: "80px",
                  borderRadius: "20px",
                  border: `1px solid ${themeConfig.badgeBorder}`,
                  background: themeConfig.badgeBg,
                  boxShadow: `0 0 16px ${themeConfig.glow}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "40px",
                  animation: "targetPop 0.5s ease-out",
                }}
              >
                🎯
              </div>
            ) : isAudio ? (
              <div
                style={{
                  width: "80px",
                  height: "80px",
                  borderRadius: "20px",
                  border: `1px solid ${themeConfig.badgeBorder}`,
                  background: themeConfig.badgeBg,
                  boxShadow: `0 0 16px ${themeConfig.glow}`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                <span style={{ fontSize: "28px", animation: "pulse 1s infinite" }}>
                  🎙️
                </span>
                {/* 4 Dancing Equalizer Bars */}
                <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "14px" }}>
                  <div className="eq-bar eq-bar-1" style={{ backgroundColor: themeConfig.accent }} />
                  <div className="eq-bar eq-bar-2" style={{ backgroundColor: themeConfig.accent }} />
                  <div className="eq-bar eq-bar-3" style={{ backgroundColor: themeConfig.accent }} />
                  <div className="eq-bar eq-bar-4" style={{ backgroundColor: themeConfig.accent }} />
                </div>
              </div>
            ) : isSoundboard ? (
              <div
                style={{
                  width: "80px",
                  height: "80px",
                  borderRadius: "20px",
                  border: `1px solid ${themeConfig.badgeBorder}`,
                  background: themeConfig.badgeBg,
                  boxShadow: `0 0 16px ${themeConfig.glow}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "36px",
                  animation: "pulse 1.2s infinite",
                }}
              >
                🔊
              </div>
            ) : isSticker && stickerImageUrl ? (
              <img
                src={stickerImageUrl}
                alt="AI Sticker"
                style={{
                  width: "84px",
                  height: "84px",
                  objectFit: "contain",
                  borderRadius: "14px",
                  filter: `drop-shadow(0 0 12px ${themeConfig.glow})`,
                  animation: "targetPop 0.4s ease-out",
                }}
              />
            ) : (
              <div
                style={{
                  width: "80px",
                  height: "80px",
                  borderRadius: "20px",
                  border: `1px solid ${themeConfig.badgeBorder}`,
                  background: themeConfig.badgeBg,
                  boxShadow: `0 0 16px ${themeConfig.glow}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "36px",
                  color: themeConfig.textAccent,
                  animation: "pulse 2s infinite ease-in-out",
                }}
              >
                ✦
              </div>
            )}
          </div>

          {/* Right Content Zone */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: "4px",
            }}
          >
            {/* Header Line: Sender Name • Amount Pill • Interaction Tag */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexWrap: "nowrap",
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 800,
                  color: themeConfig.textAccent,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "180px",
                }}
              >
                {event.sender_name || "Anonymous"}
              </span>

              {event.amount != null && event.amount > 0 && (
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 800,
                    color: "#FFFFFF",
                    background: "rgba(255, 255, 255, 0.1)",
                    border: `1px solid ${themeConfig.badgeBorder}`,
                    borderRadius: "9999px",
                    padding: "2px 7px",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  ₹{event.amount}
                </span>
              )}

              <span
                style={{
                  fontSize: "9px",
                  fontWeight: 800,
                  color: themeConfig.accent,
                  border: `1px solid ${themeConfig.badgeBorder}`,
                  background: "rgba(0, 0, 0, 0.4)",
                  borderRadius: "4px",
                  padding: "2px 6px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  whiteSpace: "nowrap",
                  marginLeft: "auto",
                  flexShrink: 0,
                }}
              >
                {interactionLabel}
              </span>
            </div>

            {/* Main Content / Message / Outcome */}
            <div
              style={{
                fontSize: messageFontSize,
                fontWeight: 800,
                color: "#F8FAFC",
                lineHeight: 1.25,
                wordBreak: "break-word",
                overflowWrap: "break-word",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                textOverflow: "ellipsis",
                textShadow: isWheel ? `0 0 10px ${themeConfig.glow}` : "none",
              }}
            >
              {messageText}
            </div>

            {/* Contextual Subtitle */}
            <div
              style={{
                fontSize: "10px",
                fontWeight: 700,
                color: "#94A3B8",
                textTransform: "uppercase",
                letterSpacing: "0.4px",
                marginTop: "1px",
              }}
            >
              {isWheel
                ? "Wheel Reward Triggered"
                : isTask
                ? "Challenge Assigned to Creator"
                : isAudio
                ? "Live Voice Message"
                : isSoundboard
                ? "Sound Effect Live"
                : isSticker
                ? "AI Generated Sticker"
                : "Supporter Alert"}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes alertPopIn {
          0% {
            opacity: 0;
            transform: scale(0.68) translateY(24px);
          }
          65% {
            opacity: 1;
            transform: scale(1.02) translateY(-2px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @keyframes wheelSpin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(720deg);
          }
        }

        @keyframes targetPop {
          0% {
            transform: scale(0.6);
            opacity: 0;
          }
          70% {
            transform: scale(1.12);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes pulse {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.08);
          }
        }

        .eq-bar {
          width: 3px;
          border-radius: 2px;
          animation: eqBounce 0.8s infinite ease-in-out;
        }
        .eq-bar-1 {
          height: 6px;
          animation-delay: 0s;
        }
        .eq-bar-2 {
          height: 12px;
          animation-delay: 0.2s;
        }
        .eq-bar-3 {
          height: 9px;
          animation-delay: 0.4s;
        }
        .eq-bar-4 {
          height: 14px;
          animation-delay: 0.15s;
        }

        @keyframes eqBounce {
          0%, 100% {
            transform: scaleY(0.4);
          }
          50% {
            transform: scaleY(1.1);
          }
        }
      `}</style>
    </main>
  );
}

/**
 * One browser source URL per view:
 *   /obs?key=…               alerts + announcer (claims alerts; add once)
 *   /obs?key=…&view=qr       stream-ready QR code for the creator's link
 *   /obs?key=…&view=ticker   recent superchats (read-only)
 * The extra views never claim alerts, so adding them cannot steal an alert
 * from the main overlay.
 */
function OverlayRouter() {
  const params = useSearchParams();
  const view = params.get("view");
  if (view === "qr" || view === "ticker") return <AuxOverlay view={view} overlayKey={params.get("key") ?? ""} />;
  return <OBSOverlayInner />;
}

function AuxOverlay({ view, overlayKey }: { view: "qr" | "ticker"; overlayKey: string }) {
  const [username, setUsername] = useState<string | null>(null);
  const [items, setItems] = useState<{ id: string; sender_name: string; amount: number | null; message: string }[]>([]);
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    if (!overlayKey) return;
    let stopped = false;
    const load = async () => {
      try {
        const endpoint = view === "qr"
          ? `/api/overlay/event?key=${encodeURIComponent(overlayKey)}&peek=1`
          : `/api/overlay/recent?key=${encodeURIComponent(overlayKey)}`;
        const r = await fetch(endpoint, { cache: "no-store" });
        if (r.status === 401) { setRejected(true); stopped = true; return; }
        const d = await r.json();
        if (stopped) return;
        if (view === "qr") setUsername(d?.creator?.username ?? null);
        else setItems(Array.isArray(d?.items) ? d.items.slice(0, 5) : []);
      } catch {
        /* keep last state */
      }
    };
    load();
    const t = setInterval(load, view === "qr" ? 60_000 : 8_000);
    return () => { stopped = true; clearInterval(t); };
  }, [view, overlayKey]);

  const shell: CSSProperties = {
    width: "100vw", height: "100vh", background: "transparent", overflow: "hidden", display: "flex",
    alignItems: "center", justifyContent: "center", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  };
  if (!overlayKey || rejected) {
    return <main style={shell}><p style={{ color: "#fecaca", background: "rgba(10,14,31,.92)", padding: 16, borderRadius: 12 }}>This overlay URL is not valid. Copy a fresh one from StreamLounge.</p></main>;
  }
  if (view === "qr") {
    if (!username) return <main style={shell} />;
    return (
      <main style={shell}>
        <div style={{ background: "rgba(10,33,55,.88)", border: "1px solid rgba(94,234,212,.35)", borderRadius: 24, padding: 18, textAlign: "center", color: "#fff", boxShadow: "0 20px 60px rgba(0,0,0,.35)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/qr/${encodeURIComponent(username)}?size=360`} alt="" width={240} height={240} style={{ borderRadius: 12, display: "block" }} />
          <p style={{ margin: "12px 0 0", fontSize: 15, fontWeight: 600 }}><span style={{ color: "#6CCEB0" }}>ϟ</span> Stream<span style={{ color: "#C7B8F0" }}>Lounge</span></p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "rgba(255,255,255,.7)" }}>Scan to send a superchat</p>
        </div>
      </main>
    );
  }
  return (
    <main style={{ ...shell, alignItems: "flex-end", justifyContent: "flex-start", padding: 20, boxSizing: "border-box" }}>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}>
        {items.map((item) => (
          <li key={item.id} style={{ background: "rgba(10,33,55,.85)", border: "1px solid rgba(167,139,250,.3)", borderRadius: 14, padding: "8px 14px", color: "#fff", fontSize: 14 }}>
            <strong style={{ color: "#6CCEB0" }}>{item.sender_name}</strong>
            {item.amount != null && <span style={{ color: "#C7B8F0" }}> · ₹{item.amount}</span>}
            {item.message && <div style={{ color: "rgba(255,255,255,.8)", fontSize: 13, marginTop: 2, overflowWrap: "anywhere" }}>{item.message}</div>}
          </li>
        ))}
      </ul>
    </main>
  );
}

export default function OBSOverlayPage() {
  return (
    <Suspense
      fallback={
        <main
          style={{
            width: "100vw",
            height: "100vh",
            background: "transparent",
            overflow: "hidden",
          }}
        />
      }
    >
      <OverlayRouter />
    </Suspense>
  );
}
