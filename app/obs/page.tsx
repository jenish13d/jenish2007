"use client";

import { useEffect, useRef, useState, Suspense } from "react";
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
  amount: number;
  metadata?: Record<string, unknown>;
};

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

        if (data?.event) {
          await playEvent(data.event);
        }
      } catch (error) {
        console.error("OBS POLL ERROR:", error);
      }
    };

    const interval = setInterval(checkEvent, 1000);
    checkEvent();

    return () => {
      stopped = true;
      clearInterval(interval);

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
        alignItems: "center",
        justifyContent: "center",
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

              {event.amount > 0 && (
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
      <OBSOverlayInner />
    </Suspense>
  );
}
