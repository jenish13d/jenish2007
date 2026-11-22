/**
 * Public creator page appearance. Stored in creator_preferences.page_style
 * (validated by pageStyleSchema on write) and normalised again on read, so a
 * bad stored value can only ever fall back to defaults.
 */

export const ACCENTS = {
  champagne: { name: "Champagne", hex: "#C8A878", ink: "#17130C" },
  silver: { name: "Silver", hex: "#C9CDD0", ink: "#111315" },
  sage: { name: "Sage", hex: "#93AC92", ink: "#0F1510" },
  clay: { name: "Clay", hex: "#C58F72", ink: "#1A110C" },
  ink: { name: "Slate", hex: "#93A4BE", ink: "#0E1218" },
} as const;
export type AccentId = keyof typeof ACCENTS;

export interface PageStyleResolved {
  accent: AccentId;
  theme: "dark" | "light";
  layout: "editorial" | "centered" | "compact";
  button: "solid" | "outline";
  font: "sans" | "mono";
  amounts: number[];
  show_qr: boolean;
}

export const DEFAULT_PAGE_STYLE: PageStyleResolved = {
  accent: "champagne",
  theme: "dark",
  layout: "editorial",
  button: "solid",
  font: "sans",
  amounts: [50, 100, 200, 500, 1000],
  show_qr: true,
};

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function resolvePageStyle(stored: unknown): PageStyleResolved {
  const s = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const amounts = Array.isArray(s.amounts)
    ? [...new Set(s.amounts.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 500000))].sort((a, b) => a - b).slice(0, 6)
    : [];
  return {
    accent: pick(s.accent, Object.keys(ACCENTS) as AccentId[], DEFAULT_PAGE_STYLE.accent),
    theme: pick(s.theme, ["dark", "light"] as const, DEFAULT_PAGE_STYLE.theme),
    layout: pick(s.layout, ["editorial", "centered", "compact"] as const, DEFAULT_PAGE_STYLE.layout),
    button: pick(s.button, ["solid", "outline"] as const, DEFAULT_PAGE_STYLE.button),
    font: pick(s.font, ["sans", "mono"] as const, DEFAULT_PAGE_STYLE.font),
    amounts: amounts.length ? amounts : DEFAULT_PAGE_STYLE.amounts,
    show_qr: typeof s.show_qr === "boolean" ? s.show_qr : DEFAULT_PAGE_STYLE.show_qr,
  };
}
