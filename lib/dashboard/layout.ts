/**
 * Creator overview layout: which widgets show, in what order. Stored per
 * creator in creator_preferences.dashboard_layout (migration 0013) and
 * validated by dashboardLayoutSchema on write.
 */

export const WIDGETS = ["earnings", "balance", "trend", "sources", "recent", "supporters", "streams", "setup"] as const;
export type WidgetId = (typeof WIDGETS)[number];

export interface DashboardLayout {
  order: WidgetId[];
  hidden: WidgetId[];
}

export const DEFAULT_LAYOUT: DashboardLayout = Object.freeze({
  order: ["earnings", "trend", "balance", "recent", "supporters", "sources", "streams", "setup"],
  hidden: [],
}) as DashboardLayout;

export const WIDGET_META: Record<WidgetId, { title: string; span: 12 | 8 | 6 | 4 }> = {
  earnings: { title: "Earnings summary", span: 12 },
  trend: { title: "Earnings trend", span: 8 },
  balance: { title: "Balance", span: 4 },
  recent: { title: "Recent activity", span: 6 },
  supporters: { title: "Top supporters", span: 6 },
  sources: { title: "Payment channels", span: 6 },
  streams: { title: "Stream statistics", span: 6 },
  setup: { title: "Setup checklist", span: 12 },
};

function isWidget(value: unknown): value is WidgetId {
  return typeof value === "string" && (WIDGETS as readonly string[]).includes(value);
}

/**
 * Turns whatever was stored (possibly from an older version, possibly
 * tampered with) into a complete, valid layout: unknown ids dropped,
 * duplicates removed, widgets added since the layout was saved appended.
 */
export function normalizeLayout(stored: unknown): DashboardLayout {
  const raw = (stored && typeof stored === "object" ? stored : {}) as { order?: unknown; hidden?: unknown };
  const seen = new Set<WidgetId>();
  const order: WidgetId[] = [];
  for (const id of Array.isArray(raw.order) ? raw.order : []) {
    if (isWidget(id) && !seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }
  for (const id of DEFAULT_LAYOUT.order) if (!seen.has(id)) order.push(id);
  const hidden = [...new Set((Array.isArray(raw.hidden) ? raw.hidden : []).filter(isWidget))];
  return { order, hidden };
}

export function moveWidget(layout: DashboardLayout, id: WidgetId, toIndex: number): DashboardLayout {
  const order = layout.order.filter((w) => w !== id);
  const index = Math.max(0, Math.min(toIndex, order.length));
  order.splice(index, 0, id);
  return { ...layout, order };
}

export function toggleWidget(layout: DashboardLayout, id: WidgetId): DashboardLayout {
  const hidden = layout.hidden.includes(id) ? layout.hidden.filter((w) => w !== id) : [...layout.hidden, id];
  return { ...layout, hidden };
}

export function sameLayout(a: DashboardLayout, b: DashboardLayout): boolean {
  return a.order.join() === b.order.join() && [...a.hidden].sort().join() === [...b.hidden].sort().join();
}
