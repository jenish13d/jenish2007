"use client";

import { useEffect, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import DashboardSidebar from "@/app/component/DashboardSidebar";
import StreamLoader from "@/app/component/StreamLoader";

type Profile = {
  creator_name: string;
  username: string;
  bio: string;

  profile_image_url: string;
  banner_image_url: string;

  youtube_connected: boolean;
  youtube_channel_id: string;
  youtube_channel_name: string;
  youtube_handle: string;
  youtube_avatar_url: string;
  youtube_banner_url: string;
  youtube_subscribers: number;

  instagram_url: string;
  youtube_url: string;
  twitch_url: string;
  kick_url: string;
  discord_url: string;
};

const emptyProfile: Profile = {
  creator_name: "",
  username: "",
  bio: "",

  profile_image_url: "",
  banner_image_url: "",

  youtube_connected: false,
  youtube_channel_id: "",
  youtube_channel_name: "",
  youtube_handle: "",
  youtube_avatar_url: "",
  youtube_banner_url: "",
  youtube_subscribers: 0,

  instagram_url: "",
  youtube_url: "",
  twitch_url: "",
  kick_url: "",
  discord_url: "",
};

type SocialField = "youtube_url" | "instagram_url" | "twitch_url" | "kick_url" | "discord_url";

const SOCIALS: { field: SocialField; label: string; icon: string; placeholder: string }[] = [
  { field: "youtube_url", label: "YouTube", icon: "youtube", placeholder: "youtube.com/@..." },
  { field: "instagram_url", label: "Instagram", icon: "instagram", placeholder: "instagram.com/..." },
  { field: "twitch_url", label: "Twitch", icon: "twitch", placeholder: "twitch.tv/..." },
  { field: "kick_url", label: "Kick", icon: "kick", placeholder: "kick.com/..." },
  { field: "discord_url", label: "Discord", icon: "discord", placeholder: "discord.gg/..." },
];

const PANEL_TABS = [
  { id: "profile", label: "Profile" },
  { id: "visuals", label: "Visuals" },
  { id: "socials", label: "Socials" },
];

/* Preview only. AI Stickers stay hidden from the UI. */
const PREVIEW_INTERACTIONS = [
  { icon: "text", title: "Text", subtitle: "Send a message", color: "#5EEAD4" },
  { icon: "mic", title: "Audio", subtitle: "Send your voice", color: "#7C5CFF" },
  { icon: "sound", title: "Soundboard", subtitle: "Play a sound", color: "#A78BFA" },
  { icon: "bolt", title: "Tasks", subtitle: "Challenge creator", color: "#5EEAD4" },
];

const PARTICLES = [
  { left: "8%", top: "22%", size: 3, delay: "0s", duration: "7s" },
  { left: "22%", top: "68%", size: 2, delay: "1.4s", duration: "9s" },
  { left: "38%", top: "14%", size: 2, delay: "3s", duration: "8s" },
  { left: "55%", top: "82%", size: 3, delay: "0.8s", duration: "10s" },
  { left: "70%", top: "30%", size: 2, delay: "2.4s", duration: "7.5s" },
  { left: "84%", top: "62%", size: 3, delay: "4s", duration: "9s" },
  { left: "93%", top: "16%", size: 2, delay: "1s", duration: "8.5s" },
];

export default function CreatorPageClient() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activePanel, setActivePanel] = useState("profile");
  const [mobileTab, setMobileTab] = useState<"customize" | "preview">("customize");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");

  // Add gentle inertial easing to traditional mouse-wheel scrolling.
  // Trackpads, touch scrolling, inputs, and reduced-motion users keep native behavior.
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".creator-studio");
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const motion = new Map<HTMLElement, { target: number; frame: number }>();

    const onWheel = (event: WheelEvent) => {
      if (event.deltaMode !== WheelEvent.DOM_DELTA_LINE || event.ctrlKey) return;
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>(".creator-studio .overflow-y-auto")
        : null;
      if (!target || target.scrollHeight <= target.clientHeight + 1) return;

      const max = target.scrollHeight - target.clientHeight;
      const existing = motion.get(target);
      const currentTarget = existing ? existing.target : target.scrollTop;
      const nextTarget = Math.max(0, Math.min(max, currentTarget + event.deltaY * 18));
      if (nextTarget === currentTarget && (target.scrollTop <= 0 || target.scrollTop >= max)) return;

      event.preventDefault();
      if (existing) cancelAnimationFrame(existing.frame);
      const state = { target: nextTarget, frame: 0 };
      const tick = () => {
        const distance = state.target - target.scrollTop;
        if (Math.abs(distance) < 0.7) {
          target.scrollTop = state.target;
          motion.delete(target);
          return;
        }
        target.scrollTop += distance * 0.19;
        state.frame = requestAnimationFrame(tick);
      };
      motion.set(target, state);
      state.frame = requestAnimationFrame(tick);
    };

    root.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      root.removeEventListener("wheel", onWheel);
      motion.forEach(({ frame }) => cancelAnimationFrame(frame));
      motion.clear();
    };
  }, []);

  async function copyLink() {
    if (!profile.username) return;
    const url = `${window.location.origin}/${profile.username}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const [youtubeMessage, setYoutubeMessage] = useState("");
  const [youtubeError, setYoutubeError] = useState(false);

  const [avatarFailed, setAvatarFailed] = useState(false);
  const [bannerFailed, setBannerFailed] = useState(false);

  useEffect(() => {
    loadProfile();
    readYoutubeStatus();
  }, []);

  function readYoutubeStatus() {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("youtube");
    const reason = params.get("reason");

    if (status === "connected") {
      setYoutubeMessage(
        "YouTube connected successfully. Your channel details are now synced."
      );
      setYoutubeError(false);
    }

    if (status === "cancelled") {
      setYoutubeMessage("YouTube connection was cancelled.");
      setYoutubeError(true);
    }

    if (status === "error") {
      setYoutubeError(true);

      const messages: Record<string, string> = {
        missing_code: "YouTube authorization code was missing.",
        invalid_state: "YouTube security verification failed.",
        no_channel: "No YouTube channel was found on this Google account.",
        profile_update: "YouTube connected, but profile data could not be saved.",
        missing_credentials:
          "YouTube integration is not configured on server (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing).",
        server: "Something went wrong while connecting YouTube.",
      };

      setYoutubeMessage(
        messages[reason || ""] || "YouTube connection failed."
      );
    }

    if (status) {
      window.history.replaceState({}, "", "/creator");
    }
  }

  async function loadProfile() {
    const { data: auth } = await supabase.auth.getUser();

    if (!auth.user) {
      router.push("/login");
      return;
    }

    setUserEmail(auth.user.email || "");

    const { data, error } = await supabase
      .from("creator_profiles")
      .select(
        `
        creator_name,
        username,
        bio,
        profile_image_url,
        banner_image_url,

        youtube_connected,
        youtube_channel_id,
        youtube_channel_name,
        youtube_handle,
        youtube_avatar_url,
        youtube_banner_url,
        youtube_subscribers,

        instagram_url,
        youtube_url,
        twitch_url,
        kick_url,
        discord_url
        `
      )
      .eq("id", auth.user.id)
      .maybeSingle();

    if (error) {
      console.error("Creator profile load error:", error);
    }

    if (data) {
      setProfile({
        creator_name: data.creator_name || "",
        username: data.username || "",
        bio: data.bio || "",

        profile_image_url: data.profile_image_url || "",
        banner_image_url: data.banner_image_url || "",

        youtube_connected: Boolean(data.youtube_connected),
        youtube_channel_id: data.youtube_channel_id || "",
        youtube_channel_name: data.youtube_channel_name || "",
        youtube_handle: data.youtube_handle || "",
        youtube_avatar_url: data.youtube_avatar_url || "",
        youtube_banner_url: data.youtube_banner_url || "",
        youtube_subscribers: Number(data.youtube_subscribers || 0),

        instagram_url: data.instagram_url || "",
        youtube_url: data.youtube_url || "",
        twitch_url: data.twitch_url || "",
        kick_url: data.kick_url || "",
        discord_url: data.discord_url || "",
      });
    }

    setLoading(false);
  }

  function update(field: keyof Profile, value: string | boolean | number) {
    setProfile((current) => ({
      ...current,
      [field]: value,
    }));

    setSaved(false);
  }

  async function saveProfile() {
    setSaving(true);
    setSaved(false);
    setSaveError(null);

    const { data: auth } = await supabase.auth.getUser();

    if (!auth.user) {
      router.push("/login");
      return;
    }

    const username = profile.username
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_]/g, "");

    if (!profile.creator_name.trim()) {
      setSaveError("Display name cannot be empty.");
      setSaving(false);
      return;
    }

    if (username.length < 3) {
      setSaveError("Username must be at least 3 characters (letters, numbers, underscores).");
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("creator_profiles")
      .update({
        creator_name: profile.creator_name.trim(),
        username,
        bio: profile.bio.trim(),

        profile_image_url: profile.profile_image_url.trim(),
        banner_image_url: profile.banner_image_url.trim(),

        instagram_url: profile.instagram_url.trim(),
        youtube_url: profile.youtube_url.trim(),
        twitch_url: profile.twitch_url.trim(),
        kick_url: profile.kick_url.trim(),
        discord_url: profile.discord_url.trim(),
      })
      .eq("id", auth.user.id);

    if (error) {
      console.error("Profile save error:", error);
      if (error.code === "23505" || error.message?.toLowerCase().includes("unique")) {
        setSaveError(`The username "@${username}" is already taken by another creator.`);
      } else {
        setSaveError(error.message || "Failed to save profile changes.");
      }
      setSaving(false);
      return;
    }

    setProfile((current) => ({
      ...current,
      username,
    }));

    setSaved(true);

    setTimeout(() => {
      setSaved(false);
    }, 3000);

    setSaving(false);
  }

  function connectYouTube() {
    window.location.href = "/api/auth/youtube/start";
  }

  function formatSubscribers(value: number) {
    if (!value) return "0";

    return new Intl.NumberFormat("en-IN", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }

  const effectiveAvatar =
    profile.youtube_avatar_url || profile.profile_image_url;

  const effectiveBanner =
    profile.youtube_banner_url || profile.banner_image_url;

  const displayName =
    profile.youtube_channel_name ||
    profile.creator_name ||
    "Creator";

  const displayHandle =
    profile.youtube_handle ||
    profile.username ||
    "username";

  // A live, useful setup meter for the Creator Studio panel.
  const essentials = [
    { label: "Name", done: Boolean(profile.creator_name.trim()), tab: "profile" },
    { label: "Username", done: Boolean(profile.username.trim()), tab: "profile" },
    { label: "Bio", done: Boolean(profile.bio.trim()), tab: "profile" },
    { label: "Photo", done: Boolean(profile.profile_image_url.trim() || profile.youtube_avatar_url.trim()), tab: "visuals" },
    { label: "Banner", done: Boolean(profile.banner_image_url.trim() || profile.youtube_banner_url.trim()), tab: "visuals" },
    { label: "Socials", done: Boolean(profile.youtube_url.trim() || profile.instagram_url.trim() || profile.twitch_url.trim() || profile.kick_url.trim() || profile.discord_url.trim()), tab: "socials" },
  ];
  const completionChecks = essentials.map((e) => e.done);
  const profileCompletion = Math.round(
    (completionChecks.filter(Boolean).length / completionChecks.length) * 100
  );

  const doneCount = completionChecks.filter(Boolean).length;
  const nextUp = essentials.find((e) => !e.done);
  const isMobilePreview = previewDevice === "mobile";
  const panelIndex = Math.max(0, PANEL_TABS.findIndex((t) => t.id === activePanel));

  function handleCardMove(e: ReactMouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  }

  if (loading) {
    return (
      <StreamLoader
        size="sm"
        messages={["Opening Creator Studio…", "Loading your page…", "Almost there…"]}
      />
    );
  }

  return (
    <main className="creator-studio relative min-h-screen overflow-hidden bg-[#070B1F] text-[#F8FAFC] antialiased">
      {/* ATMOSPHERE */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_18%_32%,rgba(124,92,255,0.20),transparent_55%),radial-gradient(ellipse_at_88%_78%,rgba(94,234,212,0.09),transparent_50%)]" />
        <div className="cs-aurora" />
        <div className="cs-orb-a absolute -top-[320px] -left-[250px] h-[760px] w-[760px] rounded-full bg-[#7C5CFF]/20 blur-[170px]" />
        <div className="cs-orb-b absolute top-[16%] -right-[300px] h-[720px] w-[720px] rounded-full bg-[#5EEAD4]/[0.11] blur-[180px]" />
        <div className="cs-orb-c absolute -bottom-[350px] left-[22%] h-[620px] w-[820px] rounded-full bg-[#4F46E5]/20 blur-[180px]" />
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="cs-particle absolute rounded-full bg-[#A78BFA]"
            style={{ left: p.left, top: p.top, width: p.size, height: p.size, animationDelay: p.delay, animationDuration: p.duration }}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#070B1F]/70" />
      </div>

      {/* SHARED DASHBOARD SIDEBAR */}
      <DashboardSidebar
        activeItem="Creator Page"
        creatorName={profile.creator_name || profile.username || "Creator"}
        email={userEmail}
        onSignOut={async () => {
          await supabase.auth.signOut();
          router.push("/login");
        }}
      />

      {/* TOP BAR */}
      <header className="fixed left-0 right-0 top-0 z-30 h-[78px] border-b border-white/[0.06] bg-[#070B1F]/55 backdrop-blur-xl lg:left-[250px]">
        <div className="flex h-full items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <p className="text-[11px] text-[#64748B]">Creator Studio</p>
            <p className="truncate text-lg font-semibold tracking-[-0.03em]">Page Builder</p>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={copyLink}
              disabled={!profile.username}
              className="hidden items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.04] px-4 py-2.5 text-xs font-medium text-[#CBD5E1] hover:border-[#5EEAD4]/40 hover:text-white disabled:opacity-40 sm:flex"
            >
              <Ico name={copied ? "check" : "link"} size={15} />
              {copied ? "Link copied" : "Copy page link"}
            </button>

            <button
              type="button"
              onClick={saveProfile}
              disabled={saving}
              className="cs-save rounded-full bg-[#5EEAD4] px-5 py-2.5 text-sm font-semibold text-[#04201C] shadow-[0_8px_30px_rgba(94,234,212,0.22)] hover:bg-[#7DF0DF] disabled:opacity-60"
            >
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
            </button>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <div className="relative z-10 flex min-h-screen flex-col pt-[78px] lg:ml-[250px] xl:flex-row">
        {/* Mobile switcher */}
        <div className="sticky top-[78px] z-20 flex w-full items-center justify-center border-b border-white/[0.06] bg-[#070B1F]/80 px-4 py-2.5 backdrop-blur-xl xl:hidden">
          <div className="relative flex w-full max-w-sm rounded-full border border-white/[0.08] bg-white/[0.04] p-1">
            <span
              aria-hidden="true"
              className="cs-glider absolute bottom-1 top-1 rounded-full border border-[#5EEAD4]/25 bg-gradient-to-r from-[#5EEAD4]/[0.16] to-[#7C5CFF]/[0.14]"
              style={{ width: "calc((100% - 8px) / 2)", left: `calc(4px + ${mobileTab === "preview" ? 1 : 0} * ((100% - 8px) / 2))` }}
            />
            {(["customize", "preview"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setMobileTab(t)}
                className={`relative z-10 flex flex-1 items-center justify-center gap-2 py-2 text-xs font-semibold ${mobileTab === t ? "text-white" : "text-[#8A97B5]"}`}
              >
                <Ico name={t === "customize" ? "pencil" : "eye"} size={15} />
                {t === "customize" ? "Customize" : "Preview"}
              </button>
            ))}
          </div>
        </div>

        {/* CENTER: LIVE PREVIEW */}
        <section
          className={`w-full px-4 py-7 sm:px-7 lg:px-10 xl:mr-[380px] ${mobileTab === "preview" ? "block" : "hidden xl:block"}`}
        >
          <div className={`mx-auto transition-[max-width] duration-500 ease-[cubic-bezier(.22,1,.36,1)] ${isMobilePreview ? "max-w-[400px]" : "max-w-[900px]"}`}>
            <div className="cs-rise mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#5EEAD4]">Live preview</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-[-0.04em] sm:text-[28px]">
                  This is how viewers <span className="cs-gradtext bg-gradient-to-r from-[#A78BFA] via-[#5EEAD4] to-[#A78BFA] bg-clip-text text-transparent">see you</span>
                </h1>
              </div>

              {/* device toggle */}
              <div className="relative hidden shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] p-1 sm:flex">
                <span
                  aria-hidden="true"
                  className="cs-glider absolute bottom-1 top-1 w-[38px] rounded-full border border-[#5EEAD4]/25 bg-[#5EEAD4]/[0.12]"
                  style={{ left: isMobilePreview ? 42 : 4 }}
                />
                {(["desktop", "mobile"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setPreviewDevice(d)}
                    aria-label={`${d} preview`}
                    title={`${d[0].toUpperCase()}${d.slice(1)} preview`}
                    className={`relative z-10 flex h-8 w-[38px] items-center justify-center ${previewDevice === d ? "text-[#5EEAD4]" : "text-[#64748B] hover:text-white"}`}
                  >
                    <Ico name={d === "desktop" ? "monitor" : "phone"} size={17} />
                  </button>
                ))}
              </div>
            </div>

            {youtubeMessage && (
              <div
                className={`mb-4 flex items-center justify-between rounded-2xl border px-4 py-3 text-sm font-medium backdrop-blur-md ${
                  youtubeError
                    ? "border-rose-400/25 bg-rose-500/10 text-rose-200"
                    : "border-[#5EEAD4]/25 bg-[#5EEAD4]/10 text-[#9FF3E6]"
                }`}
              >
                <span>{youtubeError ? "!" : "✓"} {youtubeMessage}</span>
                <button type="button" onClick={() => setYoutubeMessage("")} className="px-1 text-base opacity-60 hover:opacity-100" aria-label="Dismiss">×</button>
              </div>
            )}

            {/* CREATOR PAGE CARD */}
            <div
              onMouseMove={handleCardMove}
              className="cs-card cs-rise-2 group relative overflow-hidden rounded-[32px] border border-white/[0.09] bg-white/[0.035] shadow-[0_30px_100px_rgba(3,6,20,0.45)] backdrop-blur-lg"
            >
              {/* cursor spotlight */}
              <div className="cs-spot pointer-events-none absolute inset-0 z-[1] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

              {/* banner */}
              <div
                className="relative h-[210px] bg-gradient-to-br from-[#101A4A] via-[#2A2278] to-[#3B1B6E] bg-cover bg-center sm:h-[260px]"
                style={effectiveBanner && !bannerFailed ? { backgroundImage: `url(${effectiveBanner})` } : undefined}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(167,139,250,0.34),transparent_34%)]" />
                <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-[#0B1030]" />
                <div className="cs-banner-orb absolute bottom-0 left-[18%] h-32 w-32 rounded-full bg-[#5EEAD4]/25 blur-3xl" />
                <div className="cs-banner-orb cs-banner-orb-2 absolute right-[14%] top-[18%] h-40 w-40 rounded-full bg-[#7C5CFF]/30 blur-3xl" />
                <div className="cs-sheen pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,rgba(255,255,255,.16)_48%,transparent_52%)] opacity-[0.12]" />

                <div className="absolute left-5 right-5 top-5 flex justify-between">
                  <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[10px] font-semibold tracking-[0.22em] backdrop-blur-md">STREAMLOUNGE</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-[10px] text-[#D9E2F3] backdrop-blur-md">Creator page</span>
                </div>
              </div>

              <div className="relative z-[2] px-5 pb-8 sm:px-8">
                <div className={`relative -mt-[68px] flex ${isMobilePreview ? "flex-col" : "flex-col sm:flex-row sm:items-end sm:justify-between"}`}>
                  <div className="flex items-end gap-4">
                    <div className="relative h-[112px] w-[112px] shrink-0">
                      <span className="cs-ring absolute -inset-[3px] rounded-[30px] bg-[conic-gradient(from_0deg,#5EEAD4,#7C5CFF,#A78BFA,#5EEAD4)]" />
                      {effectiveAvatar && !avatarFailed ? (
                        <img
                          src={effectiveAvatar}
                          alt={displayName}
                          onError={() => setAvatarFailed(true)}
                          className="absolute inset-0 h-full w-full rounded-[28px] border-[4px] border-[#0B1030] bg-[#101A4A] object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center rounded-[28px] border-[4px] border-[#0B1030] bg-gradient-to-br from-[#5EEAD4] to-[#7C5CFF] text-4xl font-semibold text-[#04201C]">
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 pb-2">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-2xl font-semibold tracking-[-0.045em] sm:text-[32px]">{displayName}</h2>
                        {profile.youtube_connected && (
                          <span className="text-[#5EEAD4]" title="YouTube verified"><Ico name="verified" size={20} filled /></span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-[#8A97B5]">@{displayHandle}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="cs-shine relative mt-5 inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-[#5EEAD4] px-7 py-3 text-sm font-semibold text-[#04201C] shadow-[0_10px_34px_rgba(94,234,212,0.28)] hover:bg-[#7DF0DF] sm:mt-0"
                  >
                    <Ico name="bolt" size={16} filled />
                    Support creator
                  </button>
                </div>

                <p className="mt-6 max-w-2xl text-sm leading-7 text-[#A5B1CB] sm:text-base">
                  {profile.bio || "Your creator bio will appear here. Tell viewers what you stream and what makes your community special."}
                </p>

                {/* stats */}
                <div className={`mt-6 grid gap-3 ${isMobilePreview ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
                  <ViewerStat value={formatSubscribers(profile.youtube_subscribers)} label="Subscribers" />
                  <ViewerStat value="₹0" label="Support" />
                  <ViewerStat value="0" label="Interactions" />
                  <ViewerStat value="LIVE" label="Status" live />
                </div>

                {profile.youtube_connected && (
                  <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-[#CBD5E1]">
                    <span className="text-[#FB7185]"><Ico name="youtube" size={15} /></span>
                    YouTube connected
                    <span className="h-1.5 w-1.5 rounded-full bg-[#5EEAD4] shadow-[0_0_8px_#5EEAD4]" />
                  </div>
                )}

                {/* socials */}
                <div className="mt-6 flex flex-wrap gap-2">
                  {SOCIALS.filter((s) => Boolean(profile[s.field])).map((s) => (
                    <SocialLink key={s.field} icon={s.icon} label={s.label} />
                  ))}
                  {SOCIALS.every((s) => !profile[s.field]) && (
                    <button
                      type="button"
                      onClick={() => setActivePanel("socials")}
                      className="rounded-full border border-dashed border-white/[0.14] px-4 py-2 text-xs text-[#8A97B5] hover:border-[#5EEAD4]/40 hover:text-[#5EEAD4]"
                    >
                      + Add your social links
                    </button>
                  )}
                </div>

                {/* interactions */}
                <div className="mt-9">
                  <div className="mb-4 flex items-end justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#A78BFA]">Interactions</p>
                      <h3 className="mt-1 text-xl font-semibold tracking-[-0.035em]">Make something happen</h3>
                    </div>
                    <span className="rounded-full border border-[#5EEAD4]/20 bg-[#5EEAD4]/[0.08] px-3 py-1 text-[11px] font-medium text-[#5EEAD4]">
                      {PREVIEW_INTERACTIONS.length} available
                    </span>
                  </div>

                  <div className={`grid gap-3 ${isMobilePreview ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4"}`}>
                    {PREVIEW_INTERACTIONS.map((item, i) => (
                      <ViewerInteraction key={item.title} {...item} index={i} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT: CUSTOMIZE PANEL */}
        <aside
          className={`mx-auto w-full max-w-2xl flex-col border-white/[0.07] bg-[#070B1F]/60 backdrop-blur-2xl xl:fixed xl:bottom-0 xl:right-0 xl:top-[78px] xl:mx-0 xl:w-[380px] xl:max-w-none xl:border-l ${
            mobileTab === "customize" ? "flex" : "hidden xl:flex"
          }`}
        >
          {/* header */}
          <div className="relative overflow-hidden border-b border-white/[0.07] px-5 pb-4 pt-5">
            <div aria-hidden="true" className="cs-header-glow" />
            <div className="relative z-[1] flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#A78BFA]/25 bg-[#A78BFA]/[0.09] px-2.5 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#5EEAD4] shadow-[0_0_9px_rgba(94,234,212,.8)]" />
                  <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#C4B5FD]">Creator studio</p>
                </div>
                <h2 className="mt-3 text-[24px] font-semibold leading-tight tracking-[-0.045em]">
                  Your creator <span className="cs-gradtext bg-gradient-to-r from-[#A78BFA] via-[#5EEAD4] to-[#A78BFA] bg-clip-text text-transparent">page.</span>
                </h2>
                <p className="mt-1.5 text-[11px] leading-5 text-[#8A97B5]">Make your corner of the internet yours.</p>
              </div>

              <div
                className="cs-ring-meter shrink-0"
                style={{ background: `conic-gradient(#5EEAD4 ${profileCompletion * 3.6}deg, rgba(167,139,250,.18) 0deg)` }}
                aria-label={`Profile ${profileCompletion}% complete`}
              >
                <div className="cs-ring-inner">
                  <span className="text-[15px] font-semibold tabular-nums">{profileCompletion}%</span>
                  <span className="text-[7px] uppercase tracking-[0.14em] text-[#64748B]">ready</span>
                </div>
              </div>
            </div>

            {/* checklist */}
            <div className="relative z-[1] mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="cs-mini-avatar shrink-0">
                  {effectiveAvatar && !avatarFailed ? (
                    <img src={effectiveAvatar} alt="" onError={() => setAvatarFailed(true)} className="h-full w-full object-cover" />
                  ) : (
                    <span>{displayName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold">{displayName}</p>
                  <p className="truncate text-[10px] text-[#8A97B5]">@{displayHandle}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#5EEAD4]/20 bg-[#5EEAD4]/[0.08] px-2 py-1 text-[9px] font-semibold text-[#5EEAD4]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5EEAD4]" />
                  Live
                </span>
              </div>

              <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                <div className="cs-bar h-full rounded-full" style={{ width: `${profileCompletion}%` }} />
              </div>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {essentials.map((e) => (
                  <button
                    key={e.label}
                    type="button"
                    onClick={() => !e.done && setActivePanel(e.tab)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-[9px] font-medium ${
                      e.done
                        ? "cursor-default border-[#5EEAD4]/20 bg-[#5EEAD4]/[0.07] text-[#7DF0DF]"
                        : "border-white/[0.1] text-[#8A97B5] hover:border-[#A78BFA]/50 hover:text-white"
                    }`}
                  >
                    {e.done ? <Ico name="check" size={9} /> : <span className="h-1 w-1 rounded-full bg-[#64748B]" />}
                    {e.label}
                  </button>
                ))}
              </div>

              <p className="mt-2.5 text-[10px] text-[#8A97B5]">
                {nextUp ? (
                  <>
                    Next up: <span className="font-semibold text-[#C4B5FD]">{nextUp.label}</span> · {doneCount} of {essentials.length} done
                  </>
                ) : (
                  "Your page is looking sharp ✨"
                )}
              </p>
            </div>
          </div>

          {/* tabs */}
          <div className="border-b border-white/[0.06] p-3">
            <div className="relative grid grid-cols-3 gap-1 rounded-full border border-white/[0.07] bg-white/[0.03] p-1">
              <span
                aria-hidden="true"
                className="cs-glider absolute bottom-1 top-1 rounded-full border border-[#5EEAD4]/25 bg-gradient-to-r from-[#5EEAD4]/[0.16] to-[#7C5CFF]/[0.14]"
                style={{ width: "calc((100% - 16px) / 3)", left: `calc(4px + ${panelIndex} * ((100% - 16px) / 3 + 4px))` }}
              />
              {PANEL_TABS.map((t) => (
                <PanelTab key={t.id} label={t.label} active={activePanel === t.id} onClick={() => setActivePanel(t.id)} />
              ))}
            </div>
          </div>

          {saveError && (
            <div className="mx-5 mt-4 flex items-center justify-between gap-3 rounded-2xl border border-rose-400/25 bg-rose-500/10 p-3.5 text-xs text-rose-200">
              <span><b className="text-rose-300">Notice:</b> {saveError}</span>
              <button type="button" onClick={() => setSaveError(null)} className="px-1 text-sm font-semibold text-rose-300 hover:text-white" aria-label="Dismiss error">✕</button>
            </div>
          )}

          {/* panels */}
          <div className="min-h-0 flex-1 overflow-y-auto p-5 pb-8">
            {activePanel === "profile" && (
              <div key="profile" className="cs-panel space-y-5">
                <PanelInput label="Display name" value={profile.creator_name} placeholder="Creator name" onChange={(v) => update("creator_name", v)} />

                <div>
                  <label className="text-xs font-semibold text-[#CBD5E1]">Username</label>
                  <div className="mt-2 flex">
                    <span className="flex items-center rounded-l-2xl border border-r-0 border-white/10 bg-white/[0.05] px-3.5 text-sm text-[#8A97B5]">@</span>
                    <input
                      value={profile.username}
                      onChange={(e) => update("username", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                      placeholder="yourusername"
                      className="w-full rounded-r-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm outline-none placeholder:text-[#64748B] focus:border-[#5EEAD4]/60"
                    />
                  </div>
                </div>

                <PanelTextarea label="Bio" value={profile.bio} placeholder="Tell viewers about yourself..." onChange={(v) => update("bio", v)} />

                {profile.youtube_connected && (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
                    <div className="flex items-center gap-3">
                      {profile.youtube_avatar_url && !avatarFailed ? (
                        <img src={profile.youtube_avatar_url} alt="" onError={() => setAvatarFailed(true)} className="h-11 w-11 rounded-2xl object-cover" />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5EEAD4] to-[#7C5CFF] font-semibold text-[#04201C]">
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{profile.youtube_channel_name || displayName}</p>
                        <p className="mt-0.5 text-[10px] text-[#8A97B5]">{formatSubscribers(profile.youtube_subscribers)} subscribers</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-[10px] text-[#5EEAD4]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#5EEAD4]" />
                      YouTube account connected
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#64748B]">Public URL</p>
                  <button
                    type="button"
                    onClick={() => { if (profile.username) router.push(`/${profile.username}`); }}
                    className="mt-2 w-full break-all text-left text-sm font-semibold hover:text-[#5EEAD4]"
                  >
                    streamlounge.com/@{profile.username || "yourusername"}
                  </button>
                  <button
                    type="button"
                    onClick={copyLink}
                    className="mt-3 w-full rounded-full border border-white/10 bg-white/[0.05] py-2.5 text-xs font-semibold hover:border-[#5EEAD4]/40 hover:text-[#5EEAD4]"
                  >
                    {copied ? "✓ Copied" : "Copy link"}
                  </button>
                </div>
              </div>
            )}

            {activePanel === "visuals" && (
              <div key="visuals" className="cs-panel space-y-5">
                <PanelInput label="Profile image URL" value={profile.profile_image_url} placeholder="https://..." onChange={(v) => update("profile_image_url", v)} />
                <PanelInput label="Banner image URL" value={profile.banner_image_url} placeholder="https://..." onChange={(v) => update("banner_image_url", v)} />

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-500/10 text-rose-300">
                      <Ico name="youtube" size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">YouTube Sync</p>
                      <p className="mt-0.5 text-[11px] text-[#8A97B5]">Import your YouTube identity automatically.</p>
                    </div>
                  </div>

                  {profile.youtube_connected ? (
                    <div className="mt-4">
                      <div className="rounded-full border border-[#5EEAD4]/20 bg-[#5EEAD4]/10 px-3.5 py-2.5 text-xs font-semibold text-[#9FF3E6]">✓ YouTube connected</div>
                      <button type="button" onClick={connectYouTube} className="mt-3 w-full rounded-full border border-white/10 bg-white/[0.05] py-3 text-xs font-semibold hover:border-[#5EEAD4]/40 hover:text-[#5EEAD4]">
                        Reconnect YouTube
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={connectYouTube} className="mt-4 w-full rounded-full border border-white/10 bg-white/[0.05] py-3 text-xs font-semibold hover:border-[#5EEAD4]/40 hover:text-[#5EEAD4]">
                      Connect YouTube →
                    </button>
                  )}
                </div>

                <div className="overflow-hidden rounded-2xl border border-white/[0.08]">
                  <div
                    className="h-28 bg-gradient-to-br from-[#101A4A] via-[#2A2278] to-[#3B1B6E] bg-cover bg-center"
                    style={effectiveBanner && !bannerFailed ? { backgroundImage: `url(${effectiveBanner})` } : undefined}
                  />
                  <div className="flex items-center gap-3 bg-white/[0.035] p-3">
                    {effectiveAvatar && !avatarFailed ? (
                      <img src={effectiveAvatar} alt="" onError={() => setAvatarFailed(true)} className="h-11 w-11 rounded-2xl object-cover" />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5EEAD4] to-[#7C5CFF] font-semibold text-[#04201C]">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold">{displayName}</p>
                      <p className="text-[10px] text-[#8A97B5]">Live visual preview</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#5EEAD4]/15 bg-[#5EEAD4]/[0.05] p-4">
                  <p className="text-xs font-semibold text-[#C4B5FD]">YouTube identity</p>
                  <p className="mt-1 text-[11px] leading-5 text-[#8A97B5]">
                    When YouTube is connected, StreamLounge uses your YouTube channel name, avatar, banner and subscriber count automatically.
                  </p>
                </div>
              </div>
            )}

            {activePanel === "socials" && (
              <div key="socials" className="cs-panel space-y-4">
                {SOCIALS.map((s) => (
                  <PanelInput
                    key={s.field}
                    label={s.label}
                    icon={s.icon}
                    value={profile[s.field]}
                    placeholder={s.placeholder}
                    onChange={(v) => update(s.field, v)}
                  />
                ))}

                {profile.youtube_connected && (
                  <div className="rounded-2xl border border-rose-400/15 bg-rose-500/[0.05] p-4">
                    <p className="text-xs font-semibold text-rose-200">YouTube connected</p>
                    <p className="mt-1 text-[11px] leading-5 text-[#8A97B5]">Your YouTube channel information is already synced with StreamLounge.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="z-20 border-t border-white/[0.07] bg-[#070B1F]/85 p-4 pr-20 backdrop-blur-xl xl:pr-4">
            <button
              type="button"
              onClick={saveProfile}
              disabled={saving}
              className="w-full rounded-full bg-gradient-to-r from-[#5EEAD4] to-[#A78BFA] py-3.5 text-sm font-semibold text-[#04201C] shadow-[0_10px_34px_rgba(94,234,212,0.18)] hover:brightness-110 disabled:opacity-60"
            >
              {saving ? "Saving…" : saved ? "✓ Changes saved" : "Save changes"}
            </button>
          </div>
        </aside>
      </div>

      <style jsx global>{`
        .creator-studio {
          font-family: var(--font-geist-sans), Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
          letter-spacing: -0.012em;
        }

        @keyframes csDriftA { 0%,100% { transform: translate3d(0,0,0) scale(1); } 33% { transform: translate3d(200px,100px,0) scale(1.15); } 66% { transform: translate3d(70px,220px,0) scale(.95); } }
        @keyframes csDriftB { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(-220px,130px,0) scale(1.12); } }
        @keyframes csDriftC { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(180px,-130px,0) scale(1.1); } }
        @keyframes csSpin { to { transform: rotate(360deg); } }
        @keyframes csRise { from { opacity: 0; transform: translateY(22px) scale(.985); } to { opacity: 1; transform: none; } }
        @keyframes csPanel { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes csGrad { 0% { background-position: 0% 50%; } 100% { background-position: 100% 50%; } }
        @keyframes csParticle { 0%,100% { transform: translateY(0); opacity: .15; } 50% { transform: translateY(-26px); opacity: .7; } }
        @keyframes csShine { 0% { transform: translateX(-120%); } 100% { transform: translateX(260%); } }
        @keyframes csBreath { from { opacity: .55; transform: scale(.94); } to { opacity: .95; transform: translate3d(-9px,8px,0) scale(1.08); } }
        @keyframes csBannerFloat { from { transform: translate3d(-5px,0,0) scale(.96); opacity: .65; } to { transform: translate3d(12px,-8px,0) scale(1.08); opacity: 1; } }
        @keyframes csSheen { 0%,58% { transform: translateX(-110%); opacity: 0; } 64% { opacity: .55; } 78%,100% { transform: translateX(110%); opacity: 0; } }
        @keyframes csCardIn { from { opacity: 0; transform: translateY(18px) scale(.97); } to { opacity: 1; transform: none; } }

        .cs-orb-a { animation: csDriftA 26s ease-in-out infinite; }
        .cs-orb-b { animation: csDriftB 30s ease-in-out infinite; }
        .cs-orb-c { animation: csDriftC 34s ease-in-out infinite; }
        .cs-aurora { position: absolute; inset: -45%; pointer-events: none;
          background: conic-gradient(from 0deg, transparent 0%, rgba(94,234,212,.12) 12%, transparent 35%, rgba(167,139,250,.15) 62%, transparent 85%);
          animation: csSpin 26s linear infinite; }
        .cs-particle { animation: csParticle 8s ease-in-out infinite; }

        .cs-rise { animation: csRise .8s cubic-bezier(.2,.7,.2,1) .1s backwards; }
        .cs-rise-2 { animation: csRise .9s cubic-bezier(.2,.7,.2,1) .22s backwards; }
        .cs-panel { animation: csPanel .45s cubic-bezier(.2,.7,.2,1) backwards; }
        .cs-gradtext { background-size: 220% 100%; animation: csGrad 5s ease-in-out infinite alternate; }

        .cs-glider { transition: left .45s cubic-bezier(.3,1.25,.4,1); }
        .cs-save { transition: background-color .3s ease, transform .2s ease; }
        .cs-save:active { transform: scale(.97); }

        .cs-card .cs-spot { background: radial-gradient(420px circle at var(--mx, 50%) var(--my, 30%), rgba(167,139,250,.10), transparent 65%); }
        .cs-ring { animation: csSpin 8s linear infinite; }
        .cs-banner-orb { animation: csBannerFloat 18s ease-in-out infinite alternate; }
        .cs-banner-orb-2 { animation-duration: 23s; animation-delay: -6s; }
        .cs-sheen { transform: translateX(-110%); animation: csSheen 13s cubic-bezier(.4,0,.2,1) infinite; }
        .cs-shine::after { content: ""; position: absolute; inset: 0; width: 38%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.5), transparent);
          animation: csShine 3s ease-in-out infinite; pointer-events: none; }

        .cs-header-glow { position: absolute; width: 190px; height: 190px; right: -75px; top: -95px; border-radius: 999px;
          background: rgba(124,92,255,.28); filter: blur(52px); pointer-events: none; animation: csBreath 10s ease-in-out infinite alternate; }
        .cs-ring-meter { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 50%; padding: 3px;
          box-shadow: 0 0 24px rgba(94,234,212,.10); transition: background .65s cubic-bezier(.22,1,.36,1); }
        .cs-ring-inner { display: flex; width: 100%; height: 100%; flex-direction: column; align-items: center; justify-content: center; border-radius: inherit; background: #0A1030; }
        .cs-mini-avatar { display: grid; place-items: center; width: 38px; height: 38px; overflow: hidden; border-radius: 12px;
          border: 1px solid rgba(167,139,250,.42); background: linear-gradient(135deg, #5EEAD4, #6D8FE8 48%, #7C5CFF);
          color: #04201C; font-size: 15px; font-weight: 700; }
        .cs-bar { background: linear-gradient(90deg, #5EEAD4, #6EA6FF 48%, #A78BFA); box-shadow: 0 0 12px rgba(94,234,212,.3); transition: width .7s cubic-bezier(.22,1,.36,1); }

        .cs-int { animation: csCardIn .6s cubic-bezier(.2,.7,.2,1) backwards; }

        .creator-studio input:focus,
        .creator-studio textarea:focus { box-shadow: 0 0 0 3px rgba(94,234,212,.08), 0 0 24px rgba(124,92,255,.10); }
        .creator-studio input,
        .creator-studio textarea { transition: border-color .3s ease, box-shadow .3s ease, background-color .3s ease; }
        .creator-studio button:focus-visible { outline: 2px solid rgba(94,234,212,.55); outline-offset: 2px; }

        .creator-studio ::-webkit-scrollbar { width: 7px; height: 7px; }
        .creator-studio ::-webkit-scrollbar-track { background: transparent; }
        .creator-studio ::-webkit-scrollbar-thumb { background: rgba(148,163,184,.30); border-radius: 999px; border: 2px solid transparent; background-clip: padding-box; }
        .creator-studio ::-webkit-scrollbar-thumb:hover { background: rgba(167,139,250,.6); border: 2px solid transparent; background-clip: padding-box; }

        @media (prefers-reduced-motion: reduce) {
          .cs-orb-a, .cs-orb-b, .cs-orb-c, .cs-aurora, .cs-particle, .cs-rise, .cs-rise-2, .cs-panel, .cs-gradtext,
          .cs-ring, .cs-banner-orb, .cs-sheen, .cs-shine::after, .cs-header-glow, .cs-int { animation: none !important; }
          .cs-glider, .cs-bar, .cs-ring-meter { transition: none !important; }
        }
      `}</style>
    </main>
  );
}

/* -------------------- COMPONENTS -------------------- */

function Ico({ name, size = 18, filled = false }: { name: string; size?: number; filled?: boolean }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: filled ? "currentColor" : "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
    className: "shrink-0",
  };

  switch (name) {
    case "youtube":
      return <svg {...common}><rect x="3" y="6" width="18" height="12" rx="4" /><path d="M10.5 9.5v5l4-2.5z" fill="currentColor" /></svg>;
    case "instagram":
      return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="5" /><circle cx="12" cy="12" r="3.5" /><circle cx="17" cy="7" r=".6" fill="currentColor" /></svg>;
    case "twitch":
      return <svg {...common}><path d="M5 3h15v10l-4 4h-4l-3 3v-3H5z" /><path d="M15 8v3M11 8v3" /></svg>;
    case "kick":
      return <svg {...common}><path d="M6 4v16M6 12l7-8M6 12l7 8" /></svg>;
    case "discord":
      return <svg {...common}><path d="M7 7c3-1.5 7-1.5 10 0 1.8 3 2.6 6 2.2 9-1.5 1-3 1.6-4.5 2l-1-1.7M7 7C5.2 10 4.4 13 4.8 16c1.5 1 3 1.6 4.5 2l1-1.7" /><circle cx="9.5" cy="12" r="1" /><circle cx="14.5" cy="12" r="1" /></svg>;
    case "text":
      return <svg {...common}><path d="M5 6V4.5h14V6M12 4.5V20M9 20h6" /></svg>;
    case "mic":
      return <svg {...common}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>;
    case "sound":
      return <svg {...common}><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></svg>;
    case "bolt":
      return <svg {...common}><path d="M13 3 5 13.5h6L10 21l8-10.5h-6z" /></svg>;
    case "check":
      return <svg {...common} strokeWidth={2.4}><path d="m5 12.5 4.5 4.5L19 7" /></svg>;
    case "link":
      return <svg {...common}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>;
    case "eye":
      return <svg {...common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
    case "pencil":
      return <svg {...common}><path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z" /></svg>;
    case "monitor":
      return <svg {...common}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>;
    case "phone":
      return <svg {...common}><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></svg>;
    case "verified":
      return <svg {...common}><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="8" /></svg>;
  }
}

function PanelTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative z-10 rounded-full py-2.5 text-[11px] font-semibold transition-colors ${active ? "text-white" : "text-[#8A97B5] hover:text-white"}`}
    >
      {label}
    </button>
  );
}

function PanelInput({
  label,
  value,
  placeholder,
  onChange,
  icon,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  icon?: string;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-[#CBD5E1]">{label}</label>
      <div className="relative mt-2">
        {icon && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B]">
            <Ico name={icon} size={16} />
          </span>
        )}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full rounded-2xl border border-white/10 bg-white/[0.04] py-3 pr-3.5 text-sm outline-none placeholder:text-[#64748B] focus:border-[#5EEAD4]/60 ${icon ? "pl-10" : "pl-3.5"}`}
        />
      </div>
    </div>
  );
}

function PanelTextarea({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const max = 180;
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-[#CBD5E1]">{label}</label>
        <span className={`text-[10px] tabular-nums ${value.length > max - 20 ? "text-[#A78BFA]" : "text-[#64748B]"}`}>
          {value.length}/{max}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={max}
        rows={5}
        className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm leading-6 outline-none placeholder:text-[#64748B] focus:border-[#5EEAD4]/60"
      />
    </div>
  );
}

function ViewerStat({ value, label, live }: { value: string; label: string; live?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 backdrop-blur-md transition-colors hover:border-[#5EEAD4]/30">
      <div className="flex items-center gap-2">
        {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5EEAD4] shadow-[0_0_8px_#5EEAD4]" />}
        <p className="text-base font-semibold tracking-[-0.03em]">{value}</p>
      </div>
      <p className="mt-1 text-[10px] text-[#8A97B5]">{label}</p>
    </div>
  );
}

function SocialLink({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-[#CBD5E1] transition-colors hover:border-[#A78BFA]/40 hover:text-white">
      <span className="text-[#A78BFA]"><Ico name={icon} size={15} /></span>
      {label}
    </div>
  );
}

function ViewerInteraction({
  icon,
  title,
  subtitle,
  color,
  index,
}: {
  icon: string;
  title: string;
  subtitle: string;
  color: string;
  index: number;
}) {
  return (
    <div
      className="cs-int group/i relative min-h-[118px] overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.035] p-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-[var(--ic)]"
      style={{ "--ic": `${color}88`, animationDelay: `${0.35 + index * 0.08}s` } as CSSProperties}
    >
      <div className="absolute inset-x-5 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      <div className="flex items-start justify-between">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-2xl border transition-transform duration-300 group-hover/i:-rotate-3 group-hover/i:scale-110"
          style={{ color, backgroundColor: `${color}14`, borderColor: `${color}33`, boxShadow: `0 0 22px ${color}22` }}
        >
          <Ico name={icon} size={18} />
        </div>
        <span className="text-[10px] font-medium tracking-[0.2em] text-[#475569]">{String(index + 1).padStart(2, "0")}</span>
      </div>
      <p className="mt-4 text-[15px] font-semibold tracking-[-0.02em]">{title}</p>
      <p className="mt-0.5 text-[11px] text-[#8A97B5]">{subtitle}</p>
    </div>
  );
}
