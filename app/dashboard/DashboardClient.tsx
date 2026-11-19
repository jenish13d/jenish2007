"use client";

import { useEffect, useMemo, useState, type ReactNode, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import DashboardSidebar from "@/app/component/DashboardSidebar";
import StreamLoader from "@/app/component/StreamLoader";
import LoadError from "@/app/component/LoadError";
import { loginUrl, resolveClientAuth } from "@/lib/supabase/client-auth";
import {
  calculateEarningsTotals,
  money,
  type EarningsTotals,
} from "@/lib/earnings/utils";
import {
  DEFAULT_OVERLAY_THEME,
  OVERLAY_THEMES,
  OVERLAY_THEME_CONFIGS,
  type OverlayThemeId,
  resolveOverlayTheme,
} from "@/lib/overlay/themes";


type InteractionType =
  | "text"
  | "audio"
  | "soundboard"
  | "stickers"
  | "spin_wheel"
  | "tasks";

/** One entry in a creator's soundboard selection, as stored in `settings`. */
type SettingsSound = {
  id: string;
  name: string;
  enabled: boolean;
};

/**
 * Per-interaction configuration, stored as jsonb.
 *
 * The shape varies by interaction type, so the index signature stays open, but
 * the fields the dashboard actually reads are declared. Previously this was
 * `[key: string]: any`, which disabled type checking at every use site.
 */
type InteractionSettings = {
  sounds?: SettingsSound[];
  options?: string[];
  tasks?: string[];
  maxDuration?: number;
  maxFileSize?: number;
  minCharacters?: number;
  maxCharacters?: number;
  maxStickers?: number;
  cooldownSeconds?: number;
  maxTasks?: number;
  maxWords?: number;
  [key: string]: unknown;
};

type Interaction = {
  interaction_type: InteractionType;
  enabled: boolean;
  price: number;
  minimum_price: number;
  settings: InteractionSettings;
};

const interactionDefinitions: {
  type: InteractionType;
  icon: string;
  title: string;
  description: string;
  color: string;
}[] = [
  {
    type: "text",
    icon: "T",
    title: "Text",
    description: "Viewer messages with TTS and on-screen display.",
    color: "#5EEAD4",
  },
  {
    type: "audio",
    icon: "🎙",
    title: "Voice Record",
    description: "Let viewers send voice messages directly to your stream.",
    color: "#7C3AED",
  },
  {
    type: "soundboard",
    icon: "♪",
    title: "Soundboard",
    description: "Allow viewers to trigger your approved sounds.",
    color: "#A78BFA",
  },
  {
    type: "stickers",
    icon: "✦",
    title: "AI Sticker",
    description: "Display images and stickers instantly on stream.",
    color: "#5EEAD4",
  },
  {
    type: "spin_wheel",
    icon: "↻",
    title: "Spin the Wheel",
    description: "Let viewers pay to spin your custom wheel.",
    color: "#7C3AED",
  },
  {
    type: "tasks",
    icon: "⚡",
    title: "Tasks",
    description: "Give you fun in-game challenges during your stream.",
    color: "#A78BFA",
  },
];

/* Hidden from the dashboard UI only.
   All of this interaction's code, defaults and saved data stay in place.
   To bring it back, remove it from this list. */
const HIDDEN_INTERACTIONS: InteractionType[] = ["stickers"];

const VISIBLE_TOTAL =
  interactionDefinitions.length - HIDDEN_INTERACTIONS.length;

/* Lay the cards out on a 6-column grid so the last row is never half empty:
   5 cards -> 3 on top (2 cols each), 2 below (3 cols each). */
function cardSpan(i: number, n: number) {
  const rem = n % 3;

  const lg =
    rem && i >= n - rem
      ? rem === 1
        ? "lg:col-span-6"
        : "lg:col-span-3"
      : "lg:col-span-2";

  const sm =
    n % 2 === 1 && i === n - 1
      ? "sm:col-span-2"
      : "sm:col-span-1";

  return `${sm} ${lg} [&>div]:h-full`;
}

const defaultMinimums: Record<InteractionType, number> = {
  text: 18,
  soundboard: 28,
  spin_wheel: 28,
  stickers: 38,
  tasks: 48,
  audio: 58,
};

const defaultSettings: Record<
  InteractionType,
  InteractionSettings
> = {
  text: {
    minCharacters: 1,
    maxCharacters: 150,
    maxWords: 30,
  },

  audio: {
    maxDuration: 8,
  },

  soundboard: {
    sounds: [
      {
        id: "airhorn",
        name: "Air Horn",
        enabled: true,
      },
      {
        id: "bruh",
        name: "Bruh",
        enabled: true,
      },
      {
        id: "vineboom",
        name: "Vine Boom",
        enabled: true,
      },
      {
        id: "laugh",
        name: "Laugh",
        enabled: true,
      },
      {
        id: "applause",
        name: "Applause",
        enabled: true,
      },
      {
        id: "suspense",
        name: "Suspense",
        enabled: true,
      },
    ],
  },

  stickers: {
    maxStickers: 1,
    maxFileSize: 5,
  },

  spin_wheel: {
    options: [
      "Do 5 kills",
      "Drop your weapon",
      "No abilities",
      "Play next round with Sheriff",
    ],
  },

  tasks: {
    tasks: [
      "Do 5 kills",
      "Win the next round",
      "Get one headshot",
      "Use only Sheriff",
    ],
  },
};

const particles = [
  { left: "7%", top: "16%", size: 2, delay: "0s", duration: "8s" },
  { left: "15%", top: "67%", size: 3, delay: "2s", duration: "10s" },
  { left: "25%", top: "30%", size: 2, delay: "4s", duration: "9s" },
  { left: "36%", top: "78%", size: 2, delay: "1s", duration: "11s" },
  { left: "48%", top: "20%", size: 3, delay: "5s", duration: "8s" },
  { left: "58%", top: "62%", size: 2, delay: "3s", duration: "10s" },
  { left: "68%", top: "35%", size: 2, delay: "0s", duration: "12s" },
  { left: "78%", top: "74%", size: 3, delay: "4s", duration: "9s" },
  { left: "88%", top: "22%", size: 2, delay: "2s", duration: "11s" },
  { left: "94%", top: "57%", size: 2, delay: "6s", duration: "8s" },
];

export default function DashboardClient() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  const [creatorName, setCreatorName] = useState("Creator");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");

  const [youtubeConnected, setYoutubeConnected] =
    useState(false);

  const [creatorPageEnabled, setCreatorPageEnabled] =
    useState(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingInteractions, setLoadingInteractions] =
    useState(true);

  const [savingInteractions, setSavingInteractions] =
    useState(false);

  const [interactions, setInteractions] =
    useState<Interaction[]>([]);

  const [managementOpen, setManagementOpen] =
    useState(false);

  const [configType, setConfigType] =
    useState<InteractionType | null>(null);

  const [saveMessage, setSaveMessage] =
    useState("");

  const [obsInfoOpen, setObsInfoOpen] =
    useState(false);

  const [loadingSupport, setLoadingSupport] =
    useState(true);

  const [supportTotals, setSupportTotals] =
    useState<EarningsTotals | null>(null);

  const [supportError, setSupportError] =
    useState(false);

  useEffect(() => {
    loadDashboard();
    checkInteractionsTrigger();
  }, []);

  function checkInteractionsTrigger() {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("modal") === "interactions" || params.get("interactions") === "open") {
      setManagementOpen(true);
    }
  }

  function handleCloseManagement() {
    setManagementOpen(false);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("modal") === "interactions" || params.get("interactions") === "open") {
        params.delete("modal");
        params.delete("interactions");
        const remaining = params.toString();
        window.history.replaceState({}, "", remaining ? `/dashboard?${remaining}` : "/dashboard");
      }
    }
  }

  async function loadDashboard() {
    setLoadError(null);
    try {
      const auth = await resolveClientAuth();

      if (auth.status === "signed_out") {
        router.replace(loginUrl("/dashboard"));
        return;
      }
      if (auth.status === "error") {
        setLoadError(auth.message);
        return;
      }

      const user = auth.user;

      setEmail(user.email || "");

      const metadata = user.user_metadata || {};

      setCreatorName(
        metadata.creator_name ||
          metadata.full_name ||
          "Creator"
      );

      const { data: profile } =
        await supabase
          .from("creator_profiles")
          .select(
            "username, creator_name, youtube_connected, public_page_enabled"
          )
          .eq("id", user.id)
          .maybeSingle();

      if (profile) {
        if (profile.username) {
          setUsername(profile.username);
        }

        if (profile.creator_name) {
          setCreatorName(
            profile.creator_name
          );
        }

        setYoutubeConnected(
          Boolean(
            profile.youtube_connected
          )
        );

        setCreatorPageEnabled(
          Boolean(
            profile.public_page_enabled
          )
        );
      }

      await Promise.all([
        loadInteractions(user.id),
        loadSupportTotals(user.id),
      ]);
    } catch (error) {
      console.error(
        "Dashboard loading error:",
        error
      );
      setLoadError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSupportTotals(
    creatorId: string
  ) {
    try {
      setLoadingSupport(true);
      setSupportError(false);

      const { data, error } = await supabase
        .from("creator_submissions")
        .select("amount, payment_status, status")
        .eq("creator_id", creatorId);

      if (error) {
        console.error("Support totals error:", error);
        setSupportError(true);
        return;
      }

      const totals = calculateEarningsTotals(data || []);
      setSupportTotals(totals);
    } catch (err) {
      console.error("Support totals load exception:", err);
      setSupportError(true);
    } finally {
      setLoadingSupport(false);
    }
  }

  async function loadInteractions(
    creatorId: string
  ) {
    try {
      setLoadingInteractions(true);

      const [
        { data: saved, error: savedError },
        { data: pricing, error: pricingError },
      ] = await Promise.all([
        supabase
          .from("creator_interactions")
          .select(
            "interaction_type, enabled, price, settings"
          )
          .eq("creator_id", creatorId),

        supabase
          .from("interaction_pricing")
          .select(
            "interaction_type, minimum_price"
          ),
      ]);

      if (savedError) {
        console.error(
          "Saved interactions error:",
          savedError
        );
      }

      if (pricingError) {
        console.error(
          "Pricing error:",
          pricingError
        );
      }

      const minimumMap: Record<
        string,
        number
      > = {
        ...defaultMinimums,
      };

      type PricingRow = {
        interaction_type: string;
        minimum_price: number | string;
      };
      type SavedRow = {
        interaction_type: string;
        enabled: boolean | null;
        price: number | string | null;
        settings: Record<string, unknown> | null;
      };

      (pricing as PricingRow[] | null)?.forEach((item) => {
        minimumMap[item.interaction_type] = Number(item.minimum_price);
      });

      const savedMap = new Map<string, SavedRow>(
        ((saved as SavedRow[] | null) || []).map((item) => [
          item.interaction_type,
          item,
        ])
      );

      const result =
        interactionDefinitions.map(
          (definition) => {
            const existing =
              savedMap.get(
                definition.type
              );

            const minimum =
              minimumMap[
                definition.type
              ] ??
              defaultMinimums[
                definition.type
              ];

            return {
              interaction_type:
                definition.type,

              enabled:
                existing?.enabled ??
                false,

              price: Math.max(
                Number(
                  existing?.price ??
                    minimum
                ),
                minimum
              ),

              minimum_price: minimum,

              settings:
                existing?.settings &&
                Object.keys(
                  existing.settings
                ).length
                  ? {
                      ...defaultSettings[
                        definition.type
                      ],
                      ...existing.settings,
                    }
                  : {
                      ...defaultSettings[
                        definition.type
                      ],
                    },
            };
          }
        );

      setInteractions(result);
    } catch (error) {
      console.error(
        "Interaction loading error:",
        error
      );
    } finally {
      setLoadingInteractions(false);
    }
  }

  const visibleInteractions = useMemo(
    () =>
      interactions.filter(
        (item) =>
          !HIDDEN_INTERACTIONS.includes(
            item.interaction_type
          )
      ),
    [interactions]
  );

  const activeCount = useMemo(
    () =>
      visibleInteractions.filter(
        (item) => item.enabled
      ).length,
    [visibleInteractions]
  );

  function showMessage(
    message: string
  ) {
    setSaveMessage(message);

    setTimeout(() => {
      setSaveMessage("");
    }, 3000);
  }

  function getDefinition(
    type: InteractionType
  ) {
    return interactionDefinitions.find(
      (item) => item.type === type
    );
  }

  function getTitle(
    type: InteractionType
  ) {
    return (
      getDefinition(type)?.title ||
      type
    );
  }

  function updateInteraction(
    type: InteractionType,
    updates: Partial<Interaction>
  ) {
    setInteractions((current) =>
      current.map((item) =>
        item.interaction_type === type
          ? {
              ...item,
              ...updates,
            }
          : item
      )
    );
  }

  function toggleInteraction(
    type: InteractionType
  ) {
    const current =
      interactions.find(
        (item) =>
          item.interaction_type ===
          type
      );

    if (!current) return;

    if (
      current.enabled &&
      activeCount === 1
    ) {
      showMessage(
        "At least one interaction must remain active."
      );

      return;
    }

    updateInteraction(type, {
      enabled: !current.enabled,
    });
  }

  function changePrice(
    type: InteractionType,
    direction:
      | "increase"
      | "decrease"
  ) {
    const current =
      interactions.find(
        (item) =>
          item.interaction_type ===
          type
      );

    if (!current) return;

    const next =
      direction === "increase"
        ? current.price + 1
        : current.price - 1;

    updateInteraction(type, {
      price: Math.max(
        current.minimum_price,
        next
      ),
    });
  }

  async function saveAllInteractions(
    nextList?: Interaction[]
  ) {
    const list =
      nextList || interactions;

    try {
      setSavingInteractions(true);

      const { data } =
        await supabase.auth.getUser();

      if (!data.user) {
        router.push("/login");
        return false;
      }

      if (
        list.filter(
          (item) =>
            item.enabled &&
            !HIDDEN_INTERACTIONS.includes(
              item.interaction_type
            )
        ).length < 1
      ) {
        showMessage(
          "Keep at least one interaction active."
        );

        return false;
      }

      for (const item of list) {
        if (
          item.price <
          item.minimum_price
        ) {
          showMessage(
            `${getTitle(
              item.interaction_type
            )} cannot be below ₹${item.minimum_price}.`
          );

          return false;
        }
      }

      const payload = list.map(
        (item) => ({
          creator_id:
            data.user.id,

          interaction_type:
            item.interaction_type,

          enabled:
            item.enabled,

          price:
            item.price,

          settings:
            item.settings,

          updated_at:
            new Date().toISOString(),
        })
      );

      const { error } =
        await supabase
          .from(
            "creator_interactions"
          )
          .upsert(payload, {
            onConflict:
              "creator_id,interaction_type",
          });

      if (error) {
        console.error(
          "Save interaction error:",
          error
        );

        showMessage(
          error.message ||
            "Could not save interaction settings."
        );

        return false;
      }

      setInteractions(list);

      showMessage(
        "Interaction settings saved ✓"
      );

      return true;
    } catch (error: unknown) {
      console.error(error);

      showMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong."
      );

      return false;
    } finally {
      setSavingInteractions(false);
    }
  }

  async function saveSingleConfiguration(
    type: InteractionType,
    settings: InteractionSettings
  ) {
    const nextList =
      interactions.map((item) =>
        item.interaction_type === type
          ? {
              ...item,
              settings,
            }
          : item
      );

    const success =
      await saveAllInteractions(
        nextList
      );

    if (success) {
      setConfigType(null);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();

    router.push("/login");
  }

  if (loadError) {
    return (
      <LoadError
        message={loadError}
        onRetry={() => {
          setLoading(true);
          void loadDashboard();
        }}
      />
    );
  }

  if (loading) {
    return (
      <StreamLoader
        messages={[
          "Warming up your dashboard…",
          "Syncing your interactions…",
          "Counting your support…",
          "Almost live…",
        ]}
      />
    );
  }

  const firstName =
    creatorName.trim().split(" ")[0] || "Creator";

  const hour = new Date().getHours();

  const greeting =
    hour < 5
      ? "Still up"
      : hour < 12
      ? "Good morning"
      : hour < 17
      ? "Good afternoon"
      : hour < 22
      ? "Good evening"
      : "Late night";

  const openPage = () => {
    if (username) {
      router.push(`/${username}`);
    } else {
      router.push("/creator");
    }
  };

  const enabledTypes = visibleInteractions
    .filter((item) => item.enabled)
    .map((item) => item.interaction_type);

  const feedTypes: InteractionType[] = enabledTypes.length
    ? enabledTypes
    : interactionDefinitions
        .map((d) => d.type)
        .filter((t) => !HIDDEN_INTERACTIONS.includes(t));

  const sampleViewers = ["Aarav", "Mira", "Rohan", "Zoya", "Kabir", "Isha"];

  const feedItems = feedTypes.map((type, i) => {
    const def = interactionDefinitions.find((d) => d.type === type)!;
    const found = interactions.find((x) => x.interaction_type === type);
    const settings: InteractionSettings =
      found?.settings || defaultSettings[type];
    const amount = found?.price ?? defaultMinimums[type];

    const text =
      type === "text"
        ? "“play the Sheriff next round!”"
        : type === "audio"
        ? "sent a voice message"
        : type === "soundboard"
        ? `played ${
            settings.sounds?.find((x) => x.enabled)?.name ?? "Vine Boom"
          }`
        : type === "stickers"
        ? "sent a sticker to your screen"
        : type === "spin_wheel"
        ? `spun the wheel → ${settings.options?.[0] ?? "Do 5 kills"}`
        : `gave you a task: ${settings.tasks?.[1] ?? "Win the next round"}`;

    return {
      icon: def.icon,
      color: def.color,
      who: sampleViewers[i % sampleViewers.length],
      text,
      amount,
      label: def.title,
    };
  });

  const goCreator = () => router.push("/creator");

  const step = !youtubeConnected
    ? {
        note: "You're a few small steps from going live. Start by connecting YouTube. It takes about a minute.",
        cta: "Connect YouTube →",
        go: goCreator,
      }
    : !creatorPageEnabled
    ? {
        note: "YouTube is connected. Now finish your creator page so viewers have somewhere to land.",
        cta: "Finish my page →",
        go: goCreator,
      }
    : activeCount === 0
    ? {
        note: "Your page is ready. Pick at least one way for viewers to join in.",
        cta: "Choose interactions →",
        go: () => setManagementOpen(true),
      }
    : null;

  return (
    <main className="ss-dashboard min-h-screen bg-[#070B1F] text-[#F8FAFC] overflow-hidden relative">
      {/* BACKGROUND */}

      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_18%_32%,rgba(124,92,255,0.20),transparent_55%),radial-gradient(ellipse_at_88%_78%,rgba(94,234,212,0.09),transparent_50%)]" />

        <div className="sd-aurora" />

        <div className="sd-orb-a absolute -top-[320px] -left-[250px] w-[760px] h-[760px] rounded-full bg-[#7C5CFF]/20 blur-[170px]" />

        <div className="sd-orb-b absolute top-[16%] -right-[300px] w-[720px] h-[720px] rounded-full bg-[#5EEAD4]/[0.11] blur-[180px]" />

        <div className="sd-orb-c absolute -bottom-[350px] left-[22%] w-[820px] h-[620px] rounded-full bg-[#4F46E5]/20 blur-[180px]" />

        {particles.map(
          (particle, index) => (
            <span
              key={index}
              className="absolute rounded-full bg-[#A78BFA] animate-particle"
              style={{
                left: particle.left,
                top: particle.top,
                width: `${particle.size}px`,
                height: `${particle.size}px`,
                animationDelay:
                  particle.delay,
                animationDuration:
                  particle.duration,
              }}
            />
          )
        )}

        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#070B1F]/70" />

        <div className="absolute inset-0 opacity-[0.03] atmosphere-grain" />
      </div>

      {/* SIDEBAR */}

      <DashboardSidebar
        activeItem="Overview"
        creatorName={creatorName}
        email={email}
        onInteractionsClick={() => setManagementOpen(true)}
        onSignOut={handleLogout}
      />

      {/* MAIN */}

      <div className="lg:ml-[250px] relative z-10">
        {/* TOPBAR */}

        <header className="h-[78px] border-b border-white/[0.06] bg-transparent backdrop-blur-md flex items-center justify-between px-5 sm:px-8">
          <div>
            <p className="text-xs text-[#64748B]">
              Creator Dashboard
            </p>

            <p className="font-semibold text-sm sm:text-base">
              Welcome back, {creatorName}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (username) {
                  router.push(
                    `/${username}`
                  );
                } else {
                  router.push(
                    "/creator"
                  );
                }
              }}
              className="hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-full border border-white/[0.08] bg-[#101838]/55 hover:border-[#5EEAD4] transition text-sm"
            >
              ◉ Preview Page
            </button>

            <button
              onClick={handleLogout}
              className="px-4 py-2.5 rounded-full border border-white/10 hover:bg-white/5 text-sm font-semibold transition"
            >
              Logout
            </button>
          </div>
        </header>

        {/* CONTENT */}

        <section className="px-5 sm:px-8 lg:px-10 py-8 max-w-[1500px] mx-auto">
          {/* HERO */}

          <div className="sd-rise relative mb-16 pt-6 sm:pt-14">
            <div className="hidden 2xl:block absolute right-6 top-1/2 -translate-y-1/2 w-[380px] sd-float">
              <LiveFeedPreview items={feedItems} />
            </div>

            <p className="flex items-center gap-2 text-sm text-[#64748B] mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#5EEAD4] animate-pulse" />
              {step ? "Your corner of the internet" : "You're live"}
            </p>

            <h1 className="text-5xl sm:text-8xl font-medium tracking-[-0.055em] leading-[0.98]">
              {greeting},
              <br />

              <span className="bg-gradient-to-r from-white via-[#A78BFA] to-[#5EEAD4] sd-gradtext bg-clip-text text-transparent">
                {firstName}.
              </span>
            </h1>

            <p className="mt-7 text-[#94A3B8] text-base sm:text-lg leading-8 max-w-xl">
              {step
                ? step.note
                : `Your page is live and ${activeCount} ${
                    activeCount === 1
                      ? "interaction is"
                      : "interactions are"
                  } ready for your viewers. Go make a moment.`}
            </p>

            <div className="flex flex-wrap items-center gap-5 mt-9">
              <button
                onClick={step ? step.go : openPage}
                className="px-7 py-3.5 rounded-full bg-[#5EEAD4] hover:bg-[#7FF2E0] text-[#04201C] font-semibold text-sm shadow-[0_8px_30px_rgba(94,234,212,0.25)] transition hover:-translate-y-0.5"
              >
                {step ? step.cta : "View Creator Page →"}
              </button>

              <button
                onClick={
                  step
                    ? openPage
                    : () => setManagementOpen(true)
                }
                className="text-sm text-[#94A3B8] hover:text-white transition"
              >
                {step ? "Preview my page" : "Manage interactions"}
              </button>
            </div>
          </div>

          {/* STATS */}

          <div className="sd-stagger grid grid-cols-2 xl:grid-cols-4 gap-x-8 gap-y-8 mb-14 pt-8 border-t border-white/[0.08]">
            <StatCard
              icon="▶"
              label="YouTube Subscribers"
              value="—"
              sub={
                youtubeConnected
                  ? "YouTube connected"
                  : "Connect your channel"
              }
              onClick={() =>
                router.push("/creator")
              }
            />

            <StatCard
              icon="₹"
              label="Total Support"
              value={
                loading || loadingSupport
                  ? "..."
                  : supportError
                  ? "—"
                  : money(supportTotals?.totalEarnings || 0)
              }
              sub={
                loading || loadingSupport
                  ? "Loading earnings..."
                  : supportError
                  ? "Unable to load earnings"
                  : supportTotals && supportTotals.totalSupports > 0
                  ? `${supportTotals.totalSupports} ${
                      supportTotals.totalSupports === 1 ? "support" : "supports"
                    } · All-time`
                  : "Your first support will feel great"
              }
              onClick={() =>
                router.push(
                  "/dashboard/earnings"
                )
              }
            />

            <StatCard
              icon="⚡"
              label="Active Interactions"
              value={`${activeCount}/${VISIBLE_TOTAL}`}
              sub={activeCount > 0 ? "Live for your viewers" : "Turn one on to get started"}
              onClick={() =>
                setManagementOpen(true)
              }
            />

            <StatCard
              icon="◉"
              label="Creator Page"
              value={
                creatorPageEnabled
                  ? "LIVE"
                  : "OFF"
              }
              sub={
                creatorPageEnabled
                  ? "Public page active"
                  : "Finish setup to activate"
              }
              onClick={() => {
                if (username) {
                  router.push(
                    `/${username}`
                  );
                } else {
                  router.push(
                    "/creator"
                  );
                }
              }}
            />
          </div>

          {/* MAIN GRID */}

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_350px] gap-6">
            {/* INTERACTIONS */}

            <div className="sd-rise rounded-3xl border border-white/[0.08] bg-white/[0.035] backdrop-blur-lg p-6 sm:p-7">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <p className="text-xs text-[#A78BFA] font-bold tracking-wider">
                    STREAM TOOLS
                  </p>

                  <h2 className="text-2xl font-semibold tracking-tight mt-1">
                    How viewers join in
                  </h2>

                  <p className="text-sm text-[#64748B] mt-1">
                    {activeCount} of {VISIBLE_TOTAL} interactions active
                  </p>
                </div>

                <button
                  onClick={() =>
                    setManagementOpen(true)
                  }
                  className="px-5 py-2.5 rounded-full bg-[#5EEAD4] hover:bg-[#7FF2E0] text-[#04201C] text-sm font-bold transition shadow-lg shadow-[#5EEAD4]/10"
                >
                  Manage Interactions
                </button>
              </div>

              {loadingInteractions ? (
                <div className="py-16 flex flex-col items-center justify-center">
                  <div className="w-9 h-9 rounded-full border-4 border-white/[0.08] border-t-[#5EEAD4] animate-spin" />

                  <p className="text-sm text-[#64748B] mt-4">
                    Loading your interactions...
                  </p>
                </div>
              ) : (
                <div className="sd-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                  {visibleInteractions.map(
                    (interaction, index) => {
                      const definition =
                        getDefinition(
                          interaction.interaction_type
                        );

                      if (!definition)
                        return null;

                      return (
                        <div
                          key={interaction.interaction_type}
                          className={cardSpan(
                            index,
                            visibleInteractions.length
                          )}
                        >
                        <DashboardInteractionCard
                          key={
                            interaction.interaction_type
                          }
                          interaction={
                            interaction
                          }
                          definition={
                            definition
                          }
                          onConfigure={() =>
                            setConfigType(
                              interaction.interaction_type
                            )
                          }
                        />
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </div>

            {/* SETUP */}

            <div className="flex flex-col gap-6">
            <SetupPanel
              youtubeConnected={
                youtubeConnected
              }
              creatorPageEnabled={
                creatorPageEnabled
              }
              interactionsActive={
                activeCount > 0
              }
              onYoutube={() =>
                router.push(
                  "/creator"
                )
              }
              onCreatorPage={() =>
                router.push(
                  "/creator"
                )
              }
              onInteractions={() =>
                setManagementOpen(true)
              }
              onOBS={() =>
                setObsInfoOpen(true)
              }
            />

            <EarningPotential
              options={(activeCount > 0
                ? visibleInteractions.filter((i) => i.enabled)
                : visibleInteractions
              ).map((i) => ({
                title: getTitle(i.interaction_type),
                price: i.price,
              }))}
            />
            </div>
          </div>

          {/* BOTTOM */}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            {/* PUBLIC PAGE */}

            <div className="sd-rise rounded-3xl border border-white/[0.08] bg-white/[0.035] backdrop-blur-lg p-6 sm:p-7">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#A78BFA] font-bold tracking-wider">
                    PUBLIC PAGE
                  </p>

                  <h2 className="text-xl font-semibold tracking-tight mt-1">
                    Your StreamLounge Link
                  </h2>
                </div>

                <div className="w-11 h-11 rounded-xl bg-[#5EEAD4]/10 border border-[#5EEAD4]/20 flex items-center justify-center text-[#A78BFA]">
                  🔗
                </div>
              </div>

              <div className="mt-5 flex items-center gap-3 p-3 rounded-xl bg-[#0A0E1F] border border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => {
                    if (username) {
                      router.push(
                        `/${username}`
                      );
                    } else {
                      router.push(
                        "/creator"
                      );
                    }
                  }}
                  className="text-sm text-[#64748B] hover:text-[#C7D2FE] transition text-left truncate flex-1"
                >
                  streamlounge.com/@
                  {username ||
                    "yourname"}
                </button>

                <button
                  onClick={async () => {
                    if (!username)
                      return;

                    const url =
                      `${window.location.origin}/${username}`;

                    await navigator.clipboard.writeText(
                      url
                    );

                    showMessage(
                      "Creator page link copied ✓"
                    );
                  }}
                  className="px-3 py-2 rounded-lg bg-[#1E293B] text-xs font-bold hover:bg-[#334155] transition"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* ACTIVITY */}

            <div className="sd-rise rounded-3xl border border-white/[0.08] bg-white/[0.035] backdrop-blur-lg p-6 sm:p-7">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#A78BFA] font-bold tracking-wider">
                    ACTIVITY
                  </p>

                  <h2 className="text-xl font-semibold tracking-tight mt-1">
                    Recent Support
                  </h2>
                </div>

                <span className="px-3 py-1.5 rounded-full bg-[#1E293B] text-xs text-[#64748B]">
                  No activity
                </span>
              </div>

              <div className="mt-5 h-[105px] rounded-2xl border border-dashed border-white/[0.08] flex flex-col items-center justify-center">
                <div className="text-2xl mb-2 opacity-50">
                  ✦
                </div>

                <p className="text-sm text-[#64748B]">
                  Quiet for now. When someone backs you, you&apos;ll see them here first.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* MANAGEMENT MODAL */}

      {managementOpen && (
        <InteractionManagementModal
          interactions={visibleInteractions}
          activeCount={activeCount}
          saving={savingInteractions}
          onClose={handleCloseManagement}
          onToggle={toggleInteraction}
          onIncrease={(type) =>
            changePrice(
              type,
              "increase"
            )
          }
          onDecrease={(type) =>
            changePrice(
              type,
              "decrease"
            )
          }
          onConfigure={(type) =>
            setConfigType(type)
          }
          onSave={async () => {
            const success =
              await saveAllInteractions();

            if (success) {
              handleCloseManagement();
            }
          }}
        />
      )}

      {/* SPECIFIC CONFIG */}

      {configType && (
        <InteractionConfigModal
          type={configType}
          interaction={
            interactions.find(
              (item) =>
                item.interaction_type ===
                configType
            )!
          }
          saving={savingInteractions}
          onClose={() =>
            setConfigType(null)
          }
          onSave={
            saveSingleConfiguration
          }
        />
      )}

      {/* OBS */}

      {obsInfoOpen && (
        <OBSInfoModal
          username={username}
          onClose={() =>
            setObsInfoOpen(false)
          }
        />
      )}

      {/* MESSAGE */}

      {saveMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200]">
          <div className="px-5 py-3 rounded-2xl border border-white/[0.08] bg-[#111827]/95 backdrop-blur-xl shadow-2xl shadow-black/40 text-sm font-semibold">
            {saveMessage}
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes sdRise { from { opacity: 0; transform: translateY(26px) scale(.985); } to { opacity: 1; transform: none; } }
        @keyframes sdGrad { 0% { background-position: 0% 50%; } 100% { background-position: 100% 50%; } }
        @keyframes sdWave { 0% { transform: scaleY(.25); } 100% { transform: scaleY(1); } }
        @keyframes sdShine { 0% { transform: translateX(-120%); } 100% { transform: translateX(220%); } }
        @keyframes sdFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
        @keyframes sdGlow { 0%,100% { box-shadow: 0 8px 30px rgba(94,234,212,.22); } 50% { box-shadow: 0 8px 46px rgba(94,234,212,.5); } }
        @keyframes sdSpin { to { transform: rotate(360deg); } }

        @keyframes imBackdropIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes imPanelIn { from { opacity: 0; transform: translateY(18px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes imRowIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .im-backdrop-in { animation: imBackdropIn 220ms ease-out both; }
        .im-panel-in {
          animation: imPanelIn 440ms cubic-bezier(.2,.8,.2,1) both;
          border-color: rgba(167,139,250,.18);
          background: linear-gradient(145deg, rgba(21,28,49,.99), rgba(13,20,38,.99));
          box-shadow: 0 28px 90px rgba(0,0,0,.6), 0 0 50px rgba(124,58,237,.08);
        }
        .im-row-in { animation: imRowIn 420ms cubic-bezier(.2,.8,.2,1) backwards; }

        .sd-rise { animation: sdRise .8s cubic-bezier(.2,.7,.2,1) .15s backwards; }
        .sd-stagger > * { animation: sdRise .7s cubic-bezier(.2,.7,.2,1) backwards; }
        .sd-stagger > *:nth-child(1) { animation-delay: .25s; }
        .sd-stagger > *:nth-child(2) { animation-delay: .35s; }
        .sd-stagger > *:nth-child(3) { animation-delay: .45s; }
        .sd-stagger > *:nth-child(4) { animation-delay: .55s; }
        .sd-stagger > *:nth-child(5) { animation-delay: .65s; }
        .sd-stagger > *:nth-child(6) { animation-delay: .75s; }

        .sd-gradtext { background-size: 220% 100%; animation: sdGrad 5s ease-in-out infinite alternate; }
        .sd-float { animation: sdFloat 6s ease-in-out infinite; }
        .sd-glow { animation: sdGlow 3s ease-in-out infinite; }
        .sd-aurora { position: absolute; inset: -45%; pointer-events: none;
          background: conic-gradient(from 0deg, transparent 0%, rgba(94,234,212,.13) 12%, transparent 35%, rgba(167,139,250,.16) 62%, transparent 85%);
          animation: sdSpin 26s linear infinite; }
        .sd-wave-bar { width: 4px; border-radius: 3px; transform-origin: bottom;
          background: linear-gradient(to top, #5EEAD4, #A78BFA);
          animation: sdWave 1.1s ease-in-out infinite alternate; }
        .sd-shine::after { content: ""; position: absolute; inset: 0; width: 40%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent);
          animation: sdShine 2.6s ease-in-out infinite; }

        @keyframes sdDraw { to { stroke-dashoffset: 0; } }
        .sd-sticker { transform: rotate(-2deg); transition: transform .3s ease; }
        .sd-sticker:hover { transform: rotate(1deg) scale(1.04); }
        .sd-squiggle path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: sdDraw 1.1s ease .9s forwards; }

        @keyframes sdDriftA { 0%,100% { transform: translate3d(0,0,0) scale(1); } 33% { transform: translate3d(200px,100px,0) scale(1.15); } 66% { transform: translate3d(70px,220px,0) scale(.95); } }
        @keyframes sdDriftB { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(-220px,130px,0) scale(1.12); } }
        @keyframes sdDriftC { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(180px,-130px,0) scale(1.1); } }
        .sd-orb-a { animation: sdDriftA 26s ease-in-out infinite; }
        .sd-orb-b { animation: sdDriftB 30s ease-in-out infinite; }
        .sd-orb-c { animation: sdDriftC 34s ease-in-out infinite; }

        @keyframes icBar { 0% { transform: scaleY(.25); } 100% { transform: scaleY(1); } }
        @keyframes icDot { 0%,60%,100% { transform: translateY(0); opacity: .35; } 30% { transform: translateY(-4px); opacity: 1; } }
        @keyframes icPad { 0%,100% { opacity: .22; transform: scale(.94); } 50% { opacity: 1; transform: scale(1); } }
        @keyframes icCheck { 0%,15% { transform: scale(0); opacity: 0; } 30%,80% { transform: scale(1); opacity: 1; } 100% { transform: scale(0); opacity: 0; } }
        .ic-bar { transform-origin: center; animation: icBar 1s ease-in-out infinite alternate; }
        .ic-dot { animation: icDot 1.2s ease-in-out infinite; }
        .ic-pad { animation: icPad 2.4s ease-in-out infinite; }
        .ic-check { animation: icCheck 4.8s ease-in-out infinite; }
        .ic-spin { animation: sdSpin 9s linear infinite; }
        .ic-off .ic-bar, .ic-off .ic-dot, .ic-off .ic-pad, .ic-off .ic-check, .ic-off .ic-spin { animation-play-state: paused; }

        @keyframes sdFeedIn { from { opacity: 0; transform: translateY(-16px) scale(.98); } to { opacity: 1; transform: none; } }
        .sd-feed-in { animation: sdFeedIn .6s cubic-bezier(.2,.7,.2,1) backwards; }

        @keyframes sdSpinRev { to { transform: rotate(-360deg); } }
        .sd-orbit { animation: sdSpin 60s linear infinite; }
        .sd-counter { animation: sdSpinRev 60s linear infinite; }
        .sd-orbit-rev { animation: sdSpinRev 36s linear infinite; }
        .sd-orbit-wrap:hover .sd-orbit,
        .sd-orbit-wrap:hover .sd-counter,
        .sd-orbit-wrap:hover .sd-orbit-rev { animation-play-state: paused; }

        @media (prefers-reduced-motion: reduce) {
          .sd-rise, .sd-stagger > *, .sd-gradtext, .sd-float, .sd-glow, .sd-aurora, .sd-wave-bar, .sd-shine::after { animation: none !important; }
          .im-backdrop-in, .im-panel-in, .im-row-in { animation: none !important; }
          .sd-squiggle path { stroke-dashoffset: 0 !important; }
          .sd-orb-a, .sd-orb-b, .sd-orb-c, .animate-particle, .sd-orbit, .sd-counter, .sd-orbit-rev, .sd-feed-in, .ic-bar, .ic-dot, .ic-pad, .ic-check, .ic-spin { animation: none !important; }
        }
        @keyframes atmosphereOne {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }

          50% {
            transform: translate3d(90px, 50px, 0)
              scale(1.12);
          }
        }

        @keyframes atmosphereTwo {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }

          50% {
            transform: translate3d(-80px, 60px, 0)
              scale(1.1);
          }
        }

        @keyframes atmosphereThree {
          0%,
          100% {
            transform: translate3d(0, 0, 0);
          }

          50% {
            transform: translate3d(50px, -35px, 0);
          }
        }

        @keyframes particleFloat {
          0%,
          100% {
            transform: translate3d(0, 0, 0);
            opacity: 0.15;
          }

          50% {
            transform: translate3d(0, -35px, 0);
            opacity: 0.8;
          }
        }

        .animate-atmosphere-one {
          animation: atmosphereOne 18s ease-in-out infinite;
        }

        .animate-atmosphere-two {
          animation: atmosphereTwo 22s ease-in-out infinite;
        }

        .animate-atmosphere-three {
          animation: atmosphereThree 20s ease-in-out infinite;
        }

        .animate-particle {
          animation: particleFloat 9s ease-in-out infinite;
        }

        .atmosphere-grain {
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='.25'/%3E%3C/svg%3E");
        }
      `}</style>
    </main>
  );
}



/* =============================================================== */
/* STAT CARD */
/* =============================================================== */

function StatCard({
  icon,
  label,
  value,
  sub,
  onClick,
}: {
  icon: string;
  label: string;
  value: string;
  sub: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`group transition ${
        onClick ? "cursor-pointer" : ""
      }`}
    >
      <p className="flex items-center gap-2 text-xs text-[#64748B] group-hover:text-[#5EEAD4] transition">
        <span>{icon}</span>
        {label}
      </p>

      <p className="text-4xl sm:text-5xl font-medium tracking-[-0.045em] mt-3">
        {value}
      </p>

      <p className="text-xs text-[#64748B] mt-2">
        {sub}
      </p>
    </div>
  );
}

/* =============================================================== */
/* MINI STAT */
/* =============================================================== */

function MiniStat({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-xl bg-[#111827] border border-[#334155]/70 p-2 text-center">
      <p className="font-bold text-xs">
        {value}
      </p>

      <p className="text-[9px] text-[#64748B] mt-0.5">
        {label}
      </p>
    </div>
  );
}

/* =============================================================== */
/* DASHBOARD INTERACTION CARD */
/* =============================================================== */

function DashboardInteractionCard({
  interaction,
  definition,
  onConfigure,
}: {
  interaction: Interaction;
  definition: {
    type: InteractionType;
    icon: string;
    title: string;
    description: string;
    color: string;
  };
  onConfigure: () => void;
}) {
  const on = interaction.enabled;
  const st: InteractionSettings = interaction.settings || {};

  const metaMap: Record<InteractionType, string> = {
    text: `Up to ${st.maxCharacters ?? 150} characters`,
    audio: `${st.maxDuration ?? 8}s voice notes`,
    soundboard: `${
      (st.sounds || []).filter((x) => x.enabled).length
    } sounds ready`,
    stickers: `Up to ${st.maxFileSize ?? 5} MB`,
    spin_wheel: `${(st.options || []).length} slices`,
    tasks: `${(st.tasks || []).length} challenges`,
  };

  return (
    <div
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
      style={{ "--ic": `${definition.color}88` } as CSSProperties}
      className={`group relative overflow-hidden rounded-3xl border bg-white/[0.045] backdrop-blur-md p-5 transition-all duration-300 ${
        on
          ? "border-white/[0.08] hover:-translate-y-1.5 hover:border-[var(--ic)]"
          : "border-white/[0.07] ic-off"
      }`}
    >
      {/* cursor spotlight */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: `radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), ${definition.color}22, transparent 70%)`,
        }}
      />

      {/* live accent line */}
      {on && (
        <div
          className="absolute top-0 inset-x-6 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${definition.color}, transparent)`,
          }}
        />
      )}

      <div className="relative">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center font-semibold text-lg border"
            style={{
              color: definition.color,
              backgroundColor: `${definition.color}14`,
              borderColor: `${definition.color}33`,
            }}
          >
            {definition.icon}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="font-semibold tracking-tight leading-tight">
              {definition.title}
            </h3>

            <p className="text-[11px] text-[#8A97B5] truncate">
              {metaMap[definition.type]}
            </p>
          </div>

          <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-[#94A3B8]">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                on ? "animate-pulse" : ""
              }`}
              style={{
                backgroundColor: on ? definition.color : "#475569",
                boxShadow: on ? `0 0 10px ${definition.color}` : "none",
              }}
            />
            {on ? "LIVE" : "OFF"}
          </span>
        </div>

        <InteractionPreview
          type={definition.type}
          color={definition.color}
          settings={st}
          on={on}
        />

        <p className="mt-4 text-xs leading-5 text-[#94A3B8] line-clamp-2 min-h-[40px]">
          {definition.description}
        </p>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-medium tracking-[-0.04em]">
              ₹{interaction.price}
            </span>

            <span className="text-[10px] text-[#64748B]">per use</span>
          </div>

          <button
            onClick={onConfigure}
            className="group/btn flex items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-2 text-xs font-semibold text-[#94A3B8] transition hover:border-transparent hover:bg-[#5EEAD4] hover:text-[#04201C]"
          >
            Configure
            <span className="transition-transform duration-300 group-hover/btn:translate-x-0.5">
              →
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* tiny animated demo of what each interaction does */

function InteractionPreview({
  type,
  color,
  settings,
  on,
}: {
  type: InteractionType;
  color: string;
  settings: InteractionSettings;
  on: boolean;
}) {
  const stage = `relative mt-4 h-[88px] rounded-2xl border border-white/[0.06] bg-black/20 px-3.5 py-3 overflow-hidden flex items-center justify-center ${
    on ? "" : "opacity-60 saturate-50"
  }`;

  if (type === "text") {
    return (
      <div className={stage}>
        <div className="flex w-full flex-col gap-1.5">
          <span className="self-start max-w-[85%] truncate rounded-2xl rounded-bl-sm bg-white/[0.08] px-3 py-1.5 text-[11px] text-[#CBD5E1]">
            play the Sheriff next round!
          </span>

          <span className="self-start flex gap-1 rounded-2xl rounded-bl-sm bg-white/[0.05] px-3 py-2">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="ic-dot w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor: color,
                  animationDelay: `${i * 0.18}s`,
                }}
              />
            ))}
          </span>
        </div>
      </div>
    );
  }

  if (type === "audio") {
    return (
      <div className={`${stage} gap-[3px]`}>
        {Array.from({ length: 24 }).map((_, i) => (
          <span
            key={i}
            className="ic-bar w-[3px] rounded-full"
            style={{
              height: `${20 + ((i * 41) % 70)}%`,
              background: `linear-gradient(to top, ${color}, ${color}55)`,
              animationDelay: `${(i % 8) * 0.12}s`,
            }}
          />
        ))}
      </div>
    );
  }

  if (type === "soundboard") {
    return (
      <div className={stage}>
        <div className="grid w-full grid-cols-4 gap-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <span
              key={i}
              className="ic-pad h-6 rounded-md"
              style={{
                backgroundColor: color,
                animationDelay: `${(i * 0.37) % 2.4}s`,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (type === "spin_wheel") {
    const n = Math.max(2, (settings.options || []).length);

    const stops = Array.from({ length: n })
      .map((_, i) => {
        const c = i % 2 ? `${color}66` : `${color}1F`;
        return `${c} ${(i * 100) / n}% ${((i + 1) * 100) / n}%`;
      })
      .join(", ");

    return (
      <div className={stage}>
        <div className="relative w-[62px] h-[62px]">
          <span
            className="absolute left-1/2 -top-1.5 z-10 -translate-x-1/2 w-0 h-0 border-x-[5px] border-x-transparent border-t-[8px]"
            style={{ borderTopColor: color }}
          />

          <div
            className="ic-spin w-full h-full rounded-full border"
            style={{
              background: `conic-gradient(${stops})`,
              borderColor: `${color}66`,
            }}
          />

          <span className="absolute inset-[22px] rounded-full bg-[#0B1130] border border-white/10" />
        </div>
      </div>
    );
  }

  if (type === "tasks") {
    const list: string[] = (settings.tasks || []).slice(0, 3);
    const lines = list.length ? list : ["Win the next round"];

    return (
      <div className={stage}>
        <div className="flex w-full flex-col gap-1.5">
          {lines.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <span
                className="relative w-3.5 h-3.5 shrink-0 rounded-[5px] border"
                style={{ borderColor: `${color}88` }}
              >
                <span
                  className="ic-check absolute inset-[2px] rounded-[3px]"
                  style={{
                    backgroundColor: color,
                    animationDelay: `${i * 1.2}s`,
                  }}
                />
              </span>

              <span className="truncate text-[11px] text-[#CBD5E1]">
                {t}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={stage}>
      <span
        className="ic-pad text-3xl"
        style={{ color }}
      >
        ✦
      </span>
    </div>
  );
}

/* =============================================================== */
/* SETUP PANEL */
/* =============================================================== */

function SetupPanel({
  youtubeConnected,
  creatorPageEnabled,
  interactionsActive,
  onYoutube,
  onCreatorPage,
  onInteractions,
  onOBS,
}: {
  youtubeConnected: boolean;
  creatorPageEnabled: boolean;
  interactionsActive: boolean;
  onYoutube: () => void;
  onCreatorPage: () => void;
  onInteractions: () => void;
  onOBS: () => void;
}) {
  const completed =
    1 +
    (youtubeConnected ? 1 : 0) +
    (creatorPageEnabled ? 1 : 0) +
    (interactionsActive ? 1 : 0);

  const percentage = Math.round(
    (completed / 5) * 100
  );

  return (
    <div className="sd-rise rounded-3xl border border-white/[0.08] bg-white/[0.035] backdrop-blur-lg p-6 sm:p-7">
      <p className="text-xs text-[#A78BFA] font-bold tracking-wider">
        GET STARTED
      </p>

      <h2 className="text-2xl font-semibold tracking-tight mt-1">
        Let&apos;s get you live
      </h2>

      <p className="text-sm text-[#94A3B8] mt-2 leading-6">
        A few small steps and you&apos;re ready to share your link.
      </p>

      <div className="mt-7 space-y-3">
        <SetupButton
          number="01"
          title="Create account"
          done
          onClick={() => {}}
        />

        <SetupButton
          number="02"
          title="Connect YouTube"
          done={youtubeConnected}
          onClick={onYoutube}
        />

        <SetupButton
          number="03"
          title="Customize creator page"
          done={creatorPageEnabled}
          onClick={onCreatorPage}
        />

        <SetupButton
          number="04"
          title="Enable interactions"
          done={interactionsActive}
          onClick={onInteractions}
        />

        <SetupButton
          number="05"
          title="Connect OBS"
          done={false}
          onClick={onOBS}
        />
      </div>

      <div className="mt-7 p-4 rounded-2xl bg-[#5EEAD4]/5 border border-[#5EEAD4]/15">
        <div className="flex justify-between text-xs mb-2">
          <span className="text-[#94A3B8]">
            Setup progress
          </span>

          <span className="text-[#A78BFA] font-bold">
            {percentage}%
          </span>
        </div>

        <div className="h-2 rounded-full bg-[#1E293B] overflow-hidden">
          <div
            className="relative overflow-hidden sd-shine h-full rounded-full bg-gradient-to-r from-[#5EEAD4] to-[#7C3AED] transition-all duration-500"
            style={{
              width: `${percentage}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* =============================================================== */
/* SETUP BUTTON */
/* =============================================================== */

function SetupButton({
  number,
  title,
  done,
  onClick,
}: {
  number: string;
  title: string;
  done: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 text-left group"
    >
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold border shrink-0 ${
          done
            ? "bg-[#5EEAD4]/10 border-[#5EEAD4]/30 text-[#5EEAD4]"
            : "bg-[#1E293B] border-white/[0.08] text-[#64748B]"
        }`}
      >
        {done ? "✓" : number}
      </div>

      <div className="flex-1">
        <p
          className={`text-sm font-semibold ${
            done
              ? "text-[#F8FAFC]"
              : "text-[#94A3B8]"
          } group-hover:text-white transition`}
        >
          {title}
        </p>
      </div>

      {done ? (
        <span className="text-[9px] font-bold text-[#5EEAD4]">
          DONE
        </span>
      ) : (
        <span className="text-[#64748B] group-hover:text-[#A78BFA] transition">
          →
        </span>
      )}
    </button>
  );
}

/* =============================================================== */
/* MANAGEMENT MODAL */
/* =============================================================== */

function InteractionManagementModal({
  interactions,
  activeCount,
  saving,
  onClose,
  onToggle,
  onIncrease,
  onDecrease,
  onConfigure,
  onSave,
}: {
  interactions: Interaction[];
  activeCount: number;
  saving: boolean;
  onClose: () => void;
  onToggle: (
    type: InteractionType
  ) => void;
  onIncrease: (
    type: InteractionType
  ) => void;
  onDecrease: (
    type: InteractionType
  ) => void;
  onConfigure: (
    type: InteractionType
  ) => void;
  onSave: () => void;
}) {
  return (
    <ModalShell
      onClose={onClose}
      maxWidth="1050px"
      animation="management"
    >
      <div className="shrink-0 px-5 sm:px-8 py-4 sm:py-5 border-b border-[#334155]/70">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-[#A78BFA] font-bold tracking-wider">
              CREATOR CONTROLS
            </p>

            <h2 className="text-xl sm:text-3xl font-semibold tracking-tight mt-1">
              Interaction Management
            </h2>

            <p className="text-xs sm:text-sm text-[#64748B] mt-1">
              Enable interactions and configure each one separately.
            </p>
          </div>

          <button
            onClick={onClose}
            aria-label="Close interaction management"
            className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-xl bg-[#1E293B] hover:bg-[#334155] flex items-center justify-center text-sm font-bold transition"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <SummaryBox
            label="Available"
            value={String(VISIBLE_TOTAL)}
            sub="Interactions"
          />

          <SummaryBox
            label="Active"
            value={String(
              activeCount
            )}
            sub="Currently enabled"
          />

          <SummaryBox
            label="Minimum"
            value="1"
            sub="Active interaction required"
          />
        </div>

        <div className="space-y-3">
          {interactions.map(
            (interaction, index) => {
              const definition =
                interactionDefinitions.find(
                  (item) =>
                    item.type ===
                    interaction.interaction_type
                );

              if (!definition)
                return null;

              return (
                <ManagementRow
                  key={
                    interaction.interaction_type
                  }
                  interaction={
                    interaction
                  }
                  definition={
                    definition
                  }
                  index={index}
                  onToggle={() =>
                    onToggle(
                      interaction.interaction_type
                    )
                  }
                  onIncrease={() =>
                    onIncrease(
                      interaction.interaction_type
                    )
                  }
                  onDecrease={() =>
                    onDecrease(
                      interaction.interaction_type
                    )
                  }
                  onConfigure={() =>
                    onConfigure(
                      interaction.interaction_type
                    )
                  }
                />
              );
            }
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-white/[0.08] bg-[#111827]/70 p-4">
          <div className="flex gap-3">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-[#5EEAD4]/10 border border-[#5EEAD4]/20 flex items-center justify-center text-[#A78BFA]">
              i
            </div>

            <div>
              <p className="text-sm font-bold">
                Pricing
              </p>

              <p className="text-xs text-[#64748B] leading-5 mt-1">
                StreamLounge sets the minimum. You can increase your creator
                price, and viewers can pay more than your configured price.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 px-5 sm:px-8 py-4 sm:py-5 border-t border-[#334155]/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#0D1426]">
        <p className="text-xs text-[#64748B]">
          {activeCount} of {VISIBLE_TOTAL} interactions active
        </p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 sm:flex-initial px-5 py-2.5 sm:py-3 rounded-xl bg-[#1E293B] hover:bg-[#334155] text-sm font-bold transition"
          >
            Close
          </button>

          <button
            onClick={onSave}
            disabled={
              saving ||
              activeCount === 0
            }
            className="flex-1 sm:flex-initial px-6 py-2.5 sm:py-3 rounded-xl bg-[#5EEAD4] hover:bg-[#7FF2E0] text-[#04201C] disabled:opacity-40 text-sm font-bold transition"
          >
            {saving
              ? "Saving..."
              : "Save Changes"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* =============================================================== */
/* MANAGEMENT ROW */
/* =============================================================== */

function ManagementRow({
  interaction,
  definition,
  index,
  onToggle,
  onIncrease,
  onDecrease,
  onConfigure,
}: {
  interaction: Interaction;
  index: number;
  definition: {
    type: InteractionType;
    icon: string;
    title: string;
    description: string;
    color: string;
  };
  onToggle: () => void;
  onIncrease: () => void;
  onDecrease: () => void;
  onConfigure: () => void;
}) {
  return (
    <div
      className="im-row-in rounded-2xl border border-white/[0.08] bg-[#111827]/75 p-4 sm:p-5 transition-[transform,border-color,background-color,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:border-[#A78BFA]/30 hover:bg-[#151C31] hover:shadow-[0_12px_32px_rgba(94,234,212,0.06)]"
      style={{ animationDelay: `${100 + index * 55}ms` }}
    >
      <div className="flex flex-col xl:flex-row xl:items-center gap-4">
        <div className="flex items-center gap-4 flex-1">
          <div
            className="w-12 h-12 shrink-0 rounded-xl flex items-center justify-center font-black text-lg border"
            style={{
              color: definition.color,
              backgroundColor:
                `${definition.color}12`,
              borderColor:
                `${definition.color}30`,
            }}
          >
            {definition.icon}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold">
                {definition.title}
              </h3>

              {interaction.enabled && (
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#5EEAD4]/10 text-[#A78BFA]">
                  ACTIVE
                </span>
              )}
            </div>

            <p className="text-xs text-[#64748B] mt-1">
              {definition.description}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-[10px] text-[#64748B] uppercase">
              Price
            </p>

            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={onDecrease}
                aria-label={`Decrease price for ${definition.title}`}
                disabled={
                  interaction.price <=
                  interaction.minimum_price
                }
                className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg bg-[#1E293B] hover:bg-[#334155] disabled:opacity-30 text-base font-bold transition"
              >
                −
              </button>

              <span className="min-w-[55px] text-center font-black">
                ₹{interaction.price}
              </span>

              <button
                type="button"
                onClick={onIncrease}
                aria-label={`Increase price for ${definition.title}`}
                className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg bg-[#1E293B] hover:bg-[#334155] text-base font-bold transition"
              >
                +
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onConfigure}
            className="px-4 py-2.5 min-h-[36px] rounded-xl bg-[#1E293B] hover:bg-[#5EEAD4] hover:text-[#04201C] text-xs font-bold transition flex items-center justify-center"
          >
            Configure →
          </button>

          <button
            type="button"
            onClick={onToggle}
            aria-label={`Toggle ${definition.title}`}
            aria-pressed={interaction.enabled}
            className={`relative w-[54px] h-[32px] rounded-full shrink-0 transition-colors ${
              interaction.enabled
                ? "bg-[#5EEAD4]"
                : "bg-[#1E293B] border border-white/[0.08]"
            }`}
          >
            <span
              className={`absolute top-[4px] w-6 h-6 rounded-full bg-white transition-all ${
                interaction.enabled
                  ? "left-[26px]"
                  : "left-[4px]"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

/* =============================================================== */
/* CONFIG MODAL */
/* =============================================================== */

function InteractionConfigModal({
  type,
  interaction,
  saving,
  onClose,
  onSave,
}: {
  type: InteractionType;
  interaction: Interaction;
  saving: boolean;
  onClose: () => void;
  onSave: (
    type: InteractionType,
    settings: InteractionSettings
  ) => void;
}) {
  const router = useRouter();
  const definition =
    interactionDefinitions.find(
      (item) => item.type === type
    )!;

  const [settings, setSettings] =
    useState<InteractionSettings>(
      JSON.parse(
        JSON.stringify(
          interaction.settings ||
            defaultSettings[type]
        )
      )
    );

  const [newOption, setNewOption] =
    useState("");

  function update(
    key: string,
    value: InteractionSettings[string]
  ) {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function addListItem(
    key: "options" | "tasks"
  ) {
    const value =
      newOption.trim();

    if (!value) return;

    setSettings((current) => ({
      ...current,
      [key]: [
        ...(current[key] || []),
        value,
      ],
    }));

    setNewOption("");
  }

  function removeListItem(
    key: "options" | "tasks",
    index: number
  ) {
    setSettings((current) => ({
      ...current,
      [key]: (current[key] ?? []).filter(
        (_item: string, i: number) => i !== index
      ),
    }));
  }

  function toggleSound(
    id: string
  ) {
    setSettings((current) => ({
      ...current,
      sounds: (current.sounds ?? []).map(
        (sound) =>
          sound.id === id
            ? {
                ...sound,
                enabled:
                  !sound.enabled,
              }
            : sound
      ),
    }));
  }

  return (
    <ModalShell
      onClose={onClose}
      maxWidth="760px"
    >
      <div className="shrink-0 px-5 sm:px-8 py-4 sm:py-5 border-b border-[#334155]/70">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center font-black text-xl border shrink-0"
              style={{
                color:
                  definition.color,
                backgroundColor:
                  `${definition.color}12`,
                borderColor:
                  `${definition.color}30`,
              }}
            >
              {definition.icon}
            </div>

            <div>
              <p className="text-[11px] sm:text-xs text-[#A78BFA] font-bold tracking-wider">
                INTERACTION SETTINGS
              </p>

              <h2 className="text-xl sm:text-2xl font-black mt-0.5">
                {definition.title}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close configuration modal"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#1E293B] hover:bg-[#334155] flex items-center justify-center text-sm font-bold transition shrink-0"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-[#111827] p-4 mb-5">
          <div>
            <p className="text-xs text-[#64748B]">
              Your configured price
            </p>

            <p className="text-2xl font-semibold tracking-tight mt-1">
              ₹{interaction.price}
            </p>
          </div>

          <div className="text-right">
            <p className="text-xs text-[#64748B]">
              StreamLounge minimum
            </p>

            <p className="font-bold text-[#A78BFA] mt-1">
              ₹{interaction.minimum_price}
            </p>
          </div>
        </div>

        {type === "text" && (
          <TextConfig
            settings={settings}
            update={update}
          />
        )}

        {type === "audio" && (
          <AudioConfig
            settings={settings}
            update={update}
          />
        )}

        {type === "soundboard" && (
          <SoundboardConfig
            settings={settings}
            toggleSound={
              toggleSound
            }
            onOpenStudio={() =>
              router.push(
                "/dashboard/soundboard"
              )
            }
          />
        )}

        {type === "stickers" && (
          <StickerConfig
            settings={settings}
            update={update}
          />
        )}

        {type === "spin_wheel" && (
          <ListConfig
            title="Wheel Options"
            description="Add the outcomes that viewers can land on when they spin your wheel."
            items={
              settings.options ||
              []
            }
            newOption={newOption}
            setNewOption={
              setNewOption
            }
            onAdd={() =>
              addListItem(
                "options"
              )
            }
            onRemove={(index) =>
              removeListItem(
                "options",
                index
              )
            }
            emptyText="Add at least 2 options to make your wheel useful."
          />
        )}

        {type === "tasks" && (
          <ListConfig
            title="Task Library"
            description="Create the challenges viewers can activate during your stream."
            items={
              settings.tasks ||
              []
            }
            newOption={newOption}
            setNewOption={
              setNewOption
            }
            onAdd={() =>
              addListItem(
                "tasks"
              )
            }
            onRemove={(index) =>
              removeListItem(
                "tasks",
                index
              )
            }
            emptyText="Add tasks that you want viewers to activate."
          />
        )}
      </div>

      <div className="shrink-0 px-5 sm:px-8 py-4 sm:py-5 border-t border-[#334155]/70 flex justify-end gap-3 bg-[#0D1426]">
        <button
          onClick={onClose}
          className="flex-1 sm:flex-initial px-5 py-2.5 sm:py-3 rounded-xl bg-[#1E293B] hover:bg-[#334155] text-sm font-bold transition"
        >
          Cancel
        </button>

        <button
          onClick={() =>
            onSave(
              type,
              settings
            )
          }
          disabled={saving}
          className="flex-1 sm:flex-initial px-6 py-2.5 sm:py-3 rounded-xl bg-[#5EEAD4] hover:bg-[#7FF2E0] text-[#04201C] disabled:opacity-50 text-sm font-bold shadow-lg shadow-[#5EEAD4]/20 transition"
        >
          {saving
            ? "Saving..."
            : "Save Configuration"}
        </button>
      </div>
    </ModalShell>
  );
}

/* =============================================================== */
/* TEXT CONFIG */
/* =============================================================== */

function TextConfig({
  settings,
  update,
}: {
  settings: InteractionSettings;
  update: (
    key: string,
    value: InteractionSettings[string]
  ) => void;
}) {
  return (
    <div className="space-y-5">
      <ConfigIntro
        title="Text message rules"
        description="Control how much text a viewer can send with one interaction."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <NumberSetting
          label="Minimum Characters"
          value={
            settings.minCharacters ??
            1
          }
          min={1}
          onChange={(value) =>
            update(
              "minCharacters",
              value
            )
          }
        />

        <NumberSetting
          label="Maximum Characters"
          value={
            settings.maxCharacters ??
            150
          }
          min={
            settings.minCharacters ??
            1
          }
          onChange={(value) =>
            update(
              "maxCharacters",
              value
            )
          }
        />

        <NumberSetting
          label="Maximum Words"
          value={
            settings.maxWords ??
            30
          }
          min={1}
          onChange={(value) =>
            update(
              "maxWords",
              value
            )
          }
        />
      </div>

      {/* THIS WAS MISSING BEFORE */}

      <InfoBox>
        Example: if maximum characters is 150 and maximum words is 30,
        viewers cannot send a message above either limit.
      </InfoBox>
    </div>
  );
}

/* =============================================================== */
/* INFO BOX */
/* =============================================================== */

function InfoBox({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#5EEAD4]/15 bg-[#5EEAD4]/5 p-4">
      <div className="flex gap-3">
        <div className="w-8 h-8 shrink-0 rounded-lg bg-[#5EEAD4]/10 border border-[#5EEAD4]/20 flex items-center justify-center text-[#A78BFA] text-xs font-bold">
          i
        </div>

        <p className="text-xs text-[#94A3B8] leading-5">
          {children}
        </p>
      </div>
    </div>
  );
}

/* =============================================================== */
/* AUDIO CONFIG */
/* =============================================================== */

function AudioConfig({
  settings,
  update,
}: {
  settings: InteractionSettings;
  update: (
    key: string,
    value: InteractionSettings[string]
  ) => void;
}) {
  return (
    <div className="space-y-5">
      <ConfigIntro
        title="Voice recording rules"
        description="Control how long viewers can record a voice message."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <NumberSetting
          label="Maximum Recording"
          suffix="seconds"
          value={
            settings.maxDuration ??
            8
          }
          min={3}
          max={60}
          onChange={(value) =>
            update(
              "maxDuration",
              value
            )
          }
        />

        <div className="rounded-2xl border border-white/[0.08] bg-[#111827] p-5">
          <p className="text-xs text-[#64748B]">
            Current limit
          </p>

          <p className="text-2xl font-black mt-2">
            {settings.maxDuration ??
              8}
            s
          </p>

          <p className="text-xs text-[#64748B] mt-2">
            Viewer recording automatically stops at this limit.
          </p>
        </div>
      </div>
    </div>
  );
}

/* =============================================================== */
/* SOUNDBOARD CONFIG */
/* =============================================================== */

function SoundboardConfig({
  settings,
  toggleSound,
  onOpenStudio,
}: {
  settings: InteractionSettings;
  toggleSound: (
    id: string
  ) => void;
  onOpenStudio?: () => void;
}) {
  return (
    <div className="space-y-5">
      <ConfigIntro
        title="Soundboard controls"
        description="Choose which StreamLounge sounds viewers are allowed to trigger."
      />

      <div className="space-y-3">
        {(settings.sounds ||
          []).map(
          (sound) => (
            <div
              key={sound.id}
              className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-[#111827] p-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/10 border border-[#7C3AED]/20 flex items-center justify-center text-[#A78BFA]">
                  ♪
                </div>

                <div>
                  <p className="text-sm font-bold">
                    {sound.name}
                  </p>

                  <p className="text-xs text-[#64748B]">
                    Viewer sound
                  </p>
                </div>
              </div>

              <button
                onClick={() =>
                  toggleSound(
                    sound.id
                  )
                }
                className={`relative w-[54px] h-[30px] rounded-full ${
                  sound.enabled
                    ? "bg-[#5EEAD4]"
                    : "bg-[#1E293B] border border-white/[0.08]"
                }`}
              >
                <span
                  className={`absolute top-[3px] w-6 h-6 rounded-full bg-white transition-all ${
                    sound.enabled
                      ? "left-[27px]"
                      : "left-[3px]"
                  }`}
                />
              </button>
            </div>
          )
        )}
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-[#0D1426] p-4">
        <p className="text-sm font-bold">
          Custom sounds
        </p>

        <p className="text-xs text-[#64748B] mt-1 leading-5">
          Your custom sound upload system uses this Soundboard configuration.
          Manage custom meme sounds, audio files and artwork in the soundboard studio.
        </p>

        {onOpenStudio && (
          <button
            type="button"
            onClick={onOpenStudio}
            className="mt-3 w-full py-2.5 rounded-xl bg-[#5EEAD4] hover:bg-[#7FF2E0] text-[#04201C] text-xs font-bold transition text-white shadow-lg shadow-[#5EEAD4]/20"
          >
            Open Soundboard Studio →
          </button>
        )}
      </div>
    </div>
  );
}

/* =============================================================== */
/* STICKER CONFIG */
/* =============================================================== */

function StickerConfig({
  settings,
  update,
}: {
  settings: InteractionSettings;
  update: (
    key: string,
    value: InteractionSettings[string]
  ) => void;
}) {
  return (
    <div className="space-y-5">
      <ConfigIntro
        title="AI Sticker rules"
        description="Control how many stickers and how large an upload can be."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <NumberSetting
          label="Maximum Stickers"
          value={
            settings.maxStickers ??
            1
          }
          min={1}
          max={5}
          onChange={(value) =>
            update(
              "maxStickers",
              value
            )
          }
        />

        <NumberSetting
          label="Maximum File Size"
          suffix="MB"
          value={
            settings.maxFileSize ??
            5
          }
          min={1}
          max={20}
          onChange={(value) =>
            update(
              "maxFileSize",
              value
            )
          }
        />
      </div>
    </div>
  );
}

/* =============================================================== */
/* LIST CONFIG */
/* =============================================================== */

function ListConfig({
  title,
  description,
  items,
  newOption,
  setNewOption,
  onAdd,
  onRemove,
  emptyText,
}: {
  title: string;
  description: string;
  items: string[];
  newOption: string;
  setNewOption: (
    value: string
  ) => void;
  onAdd: () => void;
  onRemove: (
    index: number
  ) => void;
  emptyText: string;
}) {
  return (
    <div className="space-y-5">
      <ConfigIntro
        title={title}
        description={description}
      />

      <div className="flex gap-2">
        <input
          value={newOption}
          onChange={(event) =>
            setNewOption(
              event.target.value
            )
          }
          onKeyDown={(event) => {
            if (
              event.key ===
              "Enter"
            ) {
              event.preventDefault();
              onAdd();
            }
          }}
          placeholder="Type an option..."
          className="flex-1 h-12 rounded-xl border border-white/[0.08] bg-[#111827] px-4 text-sm text-white outline-none focus:border-[#5EEAD4]"
        />

        <button
          onClick={onAdd}
          className="px-5 h-12 rounded-xl bg-[#5EEAD4] hover:bg-[#7FF2E0] text-[#04201C] font-bold text-sm"
        >
          + Add
        </button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.08] p-8 text-center">
          <div className="text-3xl opacity-40">
            ✦
          </div>

          <p className="text-sm text-[#64748B] mt-3">
            {emptyText}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(
            (item, index) => (
              <div
                key={`${item}-${index}`}
                className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-[#111827] p-3"
              >
                <div className="w-8 h-8 rounded-lg bg-[#7C3AED]/10 border border-[#7C3AED]/20 flex items-center justify-center text-xs font-bold text-[#A78BFA]">
                  {index + 1}
                </div>

                <p className="flex-1 text-sm font-semibold">
                  {item}
                </p>

                <button
                  onClick={() =>
                    onRemove(index)
                  }
                  className="w-9 h-9 rounded-lg bg-[#1E293B] hover:bg-red-500/10 hover:text-red-400 text-[#64748B] transition"
                >
                  ✕
                </button>
              </div>
            )
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="rounded-xl bg-[#5EEAD4]/5 border border-[#5EEAD4]/15 p-3">
          <p className="text-xs text-[#94A3B8]">
            {items.length} options configured
          </p>
        </div>
      )}
    </div>
  );
}

/* =============================================================== */
/* CONFIG INTRO */
/* =============================================================== */

function ConfigIntro({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h3 className="text-lg font-black">
        {title}
      </h3>

      <p className="text-sm text-[#64748B] mt-1 leading-6">
        {description}
      </p>
    </div>
  );
}

/* =============================================================== */
/* NUMBER SETTING */
/* =============================================================== */

function NumberSetting({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  suffix?: string;
  onChange: (
    value: number
  ) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#111827] p-5">
      <p className="text-xs text-[#64748B]">
        {label}
      </p>

      <div className="flex items-center gap-3 mt-3">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => {
            let next =
              Number(
                event.target.value
              );

            if (
              !Number.isFinite(
                next
              )
            ) {
              next = min;
            }

            next = Math.max(
              min,
              next
            );

            if (
              max !== undefined
            ) {
              next = Math.min(
                max,
                next
              );
            }

            onChange(next);
          }}
          className="w-full h-12 rounded-xl border border-white/[0.08] bg-[#0A0E1F] px-4 text-lg font-black text-white outline-none focus:border-[#5EEAD4]"
        />

        {suffix && (
          <span className="text-xs text-[#64748B] whitespace-nowrap">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

/* =============================================================== */
/* SUMMARY BOX */
/* =============================================================== */

function SummaryBox({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#111827] p-4">
      <p className="text-xs text-[#64748B]">
        {label}
      </p>

      <p className="text-2xl font-semibold tracking-tight mt-1">
        {value}
      </p>

      <p className="text-xs text-[#64748B] mt-1">
        {sub}
      </p>
    </div>
  );
}

/* =============================================================== */
/* MODAL SHELL */
/* =============================================================== */

function ModalShell({
  children,
  onClose,
  maxWidth,
  animation,
}: {
  children: ReactNode;
  onClose: () => void;
  maxWidth: string;
  animation?: "management";
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div
        className={`fixed inset-0 bg-black/75 backdrop-blur-md ${animation === "management" ? "im-backdrop-in" : ""}`}
        onClick={onClose}
      />

      <div
        className={`relative w-full max-h-[92dvh] sm:max-h-[90vh] flex flex-col overflow-hidden rounded-[24px] sm:rounded-[30px] border border-white/[0.08] bg-[#0D1426]/98 shadow-2xl shadow-black/60 my-auto ${animation === "management" ? "im-panel-in" : ""}`}
        style={{
          maxWidth,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* =============================================================== */
/* OBS MODAL WITH PREDEFINED THEME SELECTOR */
/* =============================================================== */

function OBSInfoModal({
  username,
  onClose,
}: {
  username: string;
  onClose: () => void;
}) {
  const [selectedTheme, setSelectedTheme] =
    useState<OverlayThemeId>(DEFAULT_OVERLAY_THEME);
  const [copied, setCopied] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);
  const [themeNotice, setThemeNotice] = useState<string | null>(null);
  const [overlayKey, setOverlayKey] = useState("");
  const [overlayKeyError, setOverlayKeyError] = useState<string | null>(null);
  const [rotatingKey, setRotatingKey] = useState(false);

  // Load creator's saved theme
  useEffect(() => {
    let mounted = true;

    async function loadTheme() {
      // 1. Check local storage cache
      if (typeof window !== "undefined") {
        const cached = localStorage.getItem(`streamlounge_theme_${username}`);
        if (cached && mounted) {
          setSelectedTheme(resolveOverlayTheme(cached));
        }
      }

      // 2. Fetch from server
      try {
        const res = await fetch(`/api/creator/theme?username=${encodeURIComponent(username)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (mounted && data?.theme) {
          setSelectedTheme(resolveOverlayTheme(data.theme));
        }
      } catch (err) {
        console.warn("Theme load error:", err);
      }
    }

    loadTheme();
    loadOverlayKey();
    return () => {
      mounted = false;
    };
    // loadOverlayKey is stable for the lifetime of this component and reads no
    // reactive value, so it is deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  async function loadOverlayKey() {
    setOverlayKeyError(null);
    try {
      const res = await fetch("/api/creator/overlay-key", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data?.success && data.overlay_key) {
        setOverlayKey(String(data.overlay_key));
      } else {
        setOverlayKeyError(
          data?.error || "Could not load your overlay URL. Please reload.",
        );
      }
    } catch {
      setOverlayKeyError("Could not reach the server. Please reload.");
    }
  }

  async function handleRotateOverlayKey() {
    const confirmed = window.confirm(
      "Rotate your overlay key?\n\nYour current OBS browser source will stop " +
        "working immediately and you will need to paste the new URL into OBS.",
    );
    if (!confirmed) return;

    setRotatingKey(true);
    setOverlayKeyError(null);
    try {
      const res = await fetch("/api/creator/overlay-key", { method: "POST" });
      const data = await res.json();
      if (res.ok && data?.success && data.overlay_key) {
        setOverlayKey(String(data.overlay_key));
        setThemeNotice("New overlay URL generated. Update OBS with it.");
        setTimeout(() => setThemeNotice(null), 6000);
      } else {
        setOverlayKeyError(data?.error || "Could not rotate your key.");
      }
    } catch {
      setOverlayKeyError("Could not reach the server. Please retry.");
    } finally {
      setRotatingKey(false);
    }
  }

  async function handleSelectTheme(themeId: OverlayThemeId) {
    setSelectedTheme(themeId);
    if (typeof window !== "undefined") {
      localStorage.setItem(`streamlounge_theme_${username}`, themeId);
    }

    setSavingTheme(true);
    setThemeNotice(null);

    try {
      const res = await fetch("/api/creator/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: themeId }),
      });
      const data = await res.json();

      if (res.ok && data?.success) {
        setThemeNotice("Theme saved ✓");
      } else {
        // The previous version showed "Theme saved!" even when the write had
        // failed, so a creator believed a setting had persisted when it had not.
        setThemeNotice(data?.error || "Could not save that theme. Please retry.");
      }
    } catch (err) {
      console.warn("Theme save error:", err);
      setThemeNotice("Could not reach the server. Please retry.");
    } finally {
      setSavingTheme(false);
      setTimeout(() => setThemeNotice(null), 4000);
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // Built from the creator's secret overlay key rather than their public
  // username. The username is not a credential: polling the event endpoint
  // claims the next queued alert, so a guessable URL let anyone consume a
  // creator's paid alerts.
  const obsUrl = overlayKey
    ? `${origin}/obs?key=${encodeURIComponent(overlayKey)}&theme=${selectedTheme}`
    : "";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(obsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback copy
      const input = document.createElement("input");
      input.value = obsUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  return (
    <ModalShell onClose={onClose} maxWidth="660px">
      <div className="shrink-0 flex items-center justify-between border-b border-[#334155]/70 px-5 sm:px-8 py-4 sm:py-5">
        <div>
          <p className="text-xs text-[#A78BFA] font-bold tracking-wider uppercase">
            Stream Output
          </p>
          <h2 className="text-xl sm:text-2xl font-black mt-0.5 text-[#F8FAFC]">
            Connect OBS Alert
          </h2>
        </div>

        <button
          onClick={onClose}
          aria-label="Close OBS Alert Modal"
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#1E293B] hover:bg-[#334155] flex items-center justify-center text-[#94A3B8] hover:text-white transition"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-6">
        {/* 1. Theme Selector Section */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-[#CBD5E1] uppercase tracking-wider">
              Signature Alert Theme
            </label>
            {savingTheme ? (
              <span className="text-[11px] text-[#A78BFA] animate-pulse">
                Saving theme...
              </span>
            ) : themeNotice ? (
              <span className="text-[11px] text-[#34D399] font-medium">
                {themeNotice}
              </span>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {OVERLAY_THEMES.map((themeId) => {
              const cfg = OVERLAY_THEME_CONFIGS[themeId];
              const isSelected = selectedTheme === themeId;

              return (
                <button
                  key={themeId}
                  type="button"
                  onClick={() => handleSelectTheme(themeId)}
                  className={`group relative flex flex-col items-start p-3 rounded-xl border text-left transition-all duration-200 ${
                    isSelected
                      ? "border-[#5EEAD4] bg-[#1E293B] shadow-lg shadow-[#5EEAD4]/15 ring-2 ring-[#5EEAD4]/30"
                      : "border-white/[0.08] bg-[#111827] hover:border-[#475569] hover:bg-[#1E293B]/70"
                  }`}
                >
                  <div className="w-full flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3.5 h-3.5 rounded-full shadow-sm"
                        style={{
                          backgroundColor: cfg.accent,
                          boxShadow: `0 0 8px ${cfg.accent}`,
                        }}
                      />
                      <span className="text-xs font-bold text-[#F8FAFC]">
                        {cfg.name}
                      </span>
                    </div>

                    {isSelected && (
                      <span className="text-xs text-[#5EEAD4] font-black">
                        ✓
                      </span>
                    )}
                  </div>

                  {/* Miniature Frame Preview */}
                  <div className="mt-2 w-full h-11 rounded-lg overflow-hidden bg-[#0A0E1F]/90 border border-[#334155]/60 flex items-center justify-center p-1">
                    <img
                      src={cfg.frameAsset}
                      alt={cfg.name}
                      className="w-full h-full object-contain pointer-events-none"
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Browser Source URL */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#111827] p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#F8FAFC]">
                OBS Browser Source URL
              </h3>
              <p className="text-xs text-[#64748B] mt-0.5">
                Add this link as a Browser Source in OBS Studio or Streamlabs.
              </p>
            </div>
            <a
              href={obsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-[#5EEAD4] hover:underline flex items-center gap-1 self-start sm:self-auto"
            >
              Test Alert ↗
            </a>
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#0A0E1F] border border-white/[0.08] p-2">
            <label htmlFor="obs-url" className="sr-only">
              OBS browser source URL
            </label>
            <input
              id="obs-url"
              type="text"
              readOnly
              value={obsUrl || (overlayKeyError ? "" : "Loading…")}
              className="w-full bg-transparent px-2 text-xs text-[#C7D2FE] font-mono focus:outline-none"
            />
            <button
              onClick={handleCopy}
              disabled={!obsUrl}
              className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed ${
                copied
                  ? "bg-[#10B981] text-white"
                  : "bg-[#5EEAD4] hover:bg-[#7FF2E0] text-[#04201C] text-white"
              }`}
            >
              {copied ? "Copied! ✓" : "Copy"}
            </button>
          </div>

          {overlayKeyError && (
            <p className="mt-2 text-xs text-[#FCA5A5]">{overlayKeyError}</p>
          )}

          {/* This URL contains a secret. It is the credential that authorises an
              OBS browser source to receive and claim this creator's paid alerts,
              so it must be treated like a password — and because it will
              eventually appear on stream by accident, rotating it is a
              first-class action rather than a support request. */}
          <div className="mt-3 rounded-xl border border-[#92400E]/50 bg-[#92400E]/15 p-3">
            <p className="text-xs font-semibold text-[#FCD34D]">
              Keep this URL private
            </p>
            <p className="mt-1 text-xs text-[#FDE68A]/80 leading-relaxed">
              Anyone with this link receives your alerts instead of your stream.
              Do not show it on stream or paste it in chat. If it leaks, rotate
              it below and paste the new URL into OBS.
            </p>
            <button
              onClick={handleRotateOverlayKey}
              disabled={rotatingKey || !overlayKey}
              className="mt-2.5 rounded-lg border border-[#FCD34D]/40 px-3 py-1.5 text-xs font-bold text-[#FCD34D] transition hover:bg-[#FCD34D]/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {rotatingKey ? "Rotating…" : "Rotate overlay key"}
            </button>
          </div>

          {/* Recommended OBS Canvas Specs */}
          <div className="mt-4 pt-3 border-t border-[#334155]/60 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-[#94A3B8]">
            <div>
              <span className="text-[#64748B]">Recommended Size:</span>
              <p className="font-mono text-[#F8FAFC] font-semibold">
                720 × 304 <span className="text-[#64748B] font-normal">(or 1920×1080)</span>
              </p>
            </div>
            <div>
              <span className="text-[#64748B]">Background:</span>
              <p className="font-semibold text-[#10B981]">
                Transparent (Built-in)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed Footer */}
      <div className="shrink-0 border-t border-[#334155]/70 p-4 sm:px-8 bg-[#0D1426]">
        <button
          onClick={onClose}
          className="w-full h-11 rounded-xl bg-[#1E293B] hover:bg-[#334155] text-white font-bold text-sm transition"
        >
          Close
        </button>
      </div>
    </ModalShell>
  );
}


/* =============================================================== */
/* LIVE FEED PREVIEW */
/* =============================================================== */

function LiveFeedPreview({
  items,
}: {
  items: {
    icon: string;
    color: string;
    who: string;
    text: string;
    amount: number;
    label: string;
  }[];
}) {
  const [tick, setTick] = useState(2);

  useEffect(() => {
    if (items.length < 2) return;

    const id = setInterval(() => setTick((t) => t + 1), 2800);

    return () => clearInterval(id);
  }, [items.length]);

  if (items.length === 0) return null;

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-4 shadow-[0_30px_80px_-30px_rgba(124,92,255,0.5)]">
      <div className="flex items-center justify-between px-1 pb-3">
        <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-[#94A3B8]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#5EEAD4] animate-pulse" />
          LIVE PREVIEW
        </p>

        <span className="text-[11px] text-[#64748B]">
          What viewers send
        </span>
      </div>

      <div className="space-y-2.5">
        {[0, 1, 2].map((k) => {
          const n = tick - k;

          if (n < 0) return null;

          const item = items[n % items.length];

          return (
            <div
              key={n}
              className={`flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-3 transition-opacity duration-500 ${
                k === 0 ? "sd-feed-in" : ""
              }`}
              style={{
                opacity: k === 0 ? 1 : k === 1 ? 0.65 : 0.35,
              }}
            >
              <div
                className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-sm font-semibold border"
                style={{
                  color: item.color,
                  borderColor: `${item.color}40`,
                  backgroundColor: `${item.color}15`,
                }}
              >
                {item.icon}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">
                  <span className="font-semibold">{item.who}</span>{" "}
                  <span className="text-[#94A3B8]">{item.text}</span>
                </p>

                <p className="text-[11px] text-[#64748B]">
                  {item.label}
                </p>
              </div>

              <span className="text-sm font-semibold text-[#5EEAD4]">
                ₹{item.amount}
              </span>
            </div>
          );
        })}
      </div>

      <p className="px-1 pt-3 text-[11px] text-[#64748B]">
        Sample activity. Real support appears under Recent Support.
      </p>
    </div>
  );
}


/* =============================================================== */
/* EARNING POTENTIAL (what-if) */
/* =============================================================== */

function EarningPotential({
  options,
}: {
  options: { title: string; price: number }[];
}) {
  const [viewers, setViewers] = useState(20);
  const [pick, setPick] = useState(0);

  if (options.length === 0) return null;

  const opt = options[Math.min(pick, options.length - 1)];
  const total = viewers * opt.price;

  return (
    <div className="sd-rise rounded-3xl border border-white/[0.08] bg-white/[0.035] backdrop-blur-lg p-6 sm:p-7">
      <p className="text-xs text-[#A78BFA] font-bold tracking-wider">
        WHAT IF
      </p>

      <h2 className="text-xl font-semibold tracking-tight mt-1">
        Earning potential
      </h2>

      <div className="mt-5 flex flex-wrap gap-2">
        {options.map((o, i) => (
          <button
            key={o.title}
            onClick={() => setPick(i)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              i === Math.min(pick, options.length - 1)
                ? "bg-[#5EEAD4] text-[#04201C]"
                : "border border-white/10 text-[#94A3B8] hover:text-white"
            }`}
          >
            {o.title}
          </button>
        ))}
      </div>

      <div className="mt-6">
        <div className="flex items-baseline justify-between text-xs text-[#94A3B8]">
          <span>Viewers using it</span>

          <span className="text-sm font-semibold text-white">
            {viewers}
          </span>
        </div>

        <input
          type="range"
          min={1}
          max={100}
          value={viewers}
          onChange={(e) => setViewers(Number(e.target.value))}
          aria-label="Number of viewers"
          className="mt-3 w-full accent-[#5EEAD4]"
        />
      </div>

      <div className="mt-5 rounded-2xl border border-[#5EEAD4]/20 bg-[#5EEAD4]/[0.06] p-4">
        <p className="text-4xl font-medium tracking-[-0.045em]">
          ₹{total.toLocaleString("en-IN")}
        </p>

        <p className="mt-1 text-[11px] text-[#8A97B5]">
          per stream · {viewers} × ₹{opt.price} {opt.title}
        </p>
      </div>

      <p className="mt-4 text-[11px] leading-5 text-[#64748B]">
        Just a what-if, not a forecast. Your real numbers live under Earnings.
      </p>
    </div>
  );
}
