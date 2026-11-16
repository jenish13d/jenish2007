/**
 * StreamLounge Predefined OBS Alert Themes
 * Single source of truth for theme tokens, assets, and validation.
 */

export const OVERLAY_THEMES = [
  "emerald",
  "crimson",
  "violet",
  "cyber-blue",
  "gold",
  "rose",
] as const;

export type OverlayThemeId = (typeof OVERLAY_THEMES)[number];

export const DEFAULT_OVERLAY_THEME: OverlayThemeId = "gold";

export interface OverlayThemeConfig {
  id: OverlayThemeId;
  name: string;
  tagline: string;
  accent: string;
  glow: string;
  textAccent: string;
  badgeBg: string;
  badgeBorder: string;
  frameAsset: string;
}

export const OVERLAY_THEME_CONFIGS: Record<OverlayThemeId, OverlayThemeConfig> = {
  emerald: {
    id: "emerald",
    name: "Emerald",
    tagline: "Neon Matrix Green",
    accent: "#10B981",
    glow: "rgba(16, 185, 129, 0.45)",
    textAccent: "#34D399",
    badgeBg: "rgba(16, 185, 129, 0.15)",
    badgeBorder: "rgba(16, 185, 129, 0.4)",
    frameAsset: "/overlay/frames/emerald.png",
  },
  crimson: {
    id: "crimson",
    name: "Crimson",
    tagline: "Fiery Battle Red",
    accent: "#EF4444",
    glow: "rgba(239, 68, 68, 0.45)",
    textAccent: "#F87171",
    badgeBg: "rgba(239, 68, 68, 0.15)",
    badgeBorder: "rgba(239, 68, 68, 0.4)",
    frameAsset: "/overlay/frames/crimson.png",
  },
  violet: {
    id: "violet",
    name: "Violet",
    tagline: "Electric Cyber Purple",
    accent: "#A855F7",
    glow: "rgba(168, 85, 247, 0.45)",
    textAccent: "#C084FC",
    badgeBg: "rgba(168, 85, 247, 0.15)",
    badgeBorder: "rgba(168, 85, 247, 0.4)",
    frameAsset: "/overlay/frames/violet.png",
  },
  "cyber-blue": {
    id: "cyber-blue",
    name: "Cyber Blue",
    tagline: "Deep Electric Cyan",
    accent: "#0080FF",
    glow: "rgba(0, 128, 255, 0.45)",
    textAccent: "#38BDF8",
    badgeBg: "rgba(0, 128, 255, 0.15)",
    badgeBorder: "rgba(0, 128, 255, 0.4)",
    frameAsset: "/overlay/frames/cyber-blue.png",
  },
  gold: {
    id: "gold",
    name: "Gold",
    tagline: "Champagne Amber Glow",
    accent: "#F59E0B",
    glow: "rgba(245, 158, 11, 0.45)",
    textAccent: "#FBBF24",
    badgeBg: "rgba(245, 158, 11, 0.15)",
    badgeBorder: "rgba(245, 158, 11, 0.4)",
    frameAsset: "/overlay/frames/gold.png",
  },
  rose: {
    id: "rose",
    name: "Rose",
    tagline: "Vivid Sakura Pink",
    accent: "#F43F5E",
    glow: "rgba(244, 63, 94, 0.45)",
    textAccent: "#FB7185",
    badgeBg: "rgba(244, 63, 94, 0.15)",
    badgeBorder: "rgba(244, 63, 94, 0.4)",
    frameAsset: "/overlay/frames/rose.png",
  },
};

/**
 * Validates whether a value is one of the supported overlay themes.
 */
export function isValidOverlayTheme(value: unknown): value is OverlayThemeId {
  return typeof value === "string" && OVERLAY_THEMES.includes(value as OverlayThemeId);
}

/**
 * Resolves any input safely to a valid theme, falling back to Emerald.
 */
export function resolveOverlayTheme(value: unknown): OverlayThemeId {
  if (isValidOverlayTheme(value)) {
    return value;
  }
  return DEFAULT_OVERLAY_THEME;
}
