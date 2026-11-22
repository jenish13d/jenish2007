"use client";

import { useState } from "react";

/**
 * Minimal, accessible bar chart: one series, hairline baseline, a value label
 * for the hovered or focused bar. Highest bar is drawn in the accent colour.
 */
export function BarChart({
  data,
  height = 160,
  format,
  label,
}: {
  data: { label: string; value: number }[];
  height?: number;
  format: (v: number) => string;
  label: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const peak = data.findIndex((d) => d.value === max && d.value > 0);
  const shown = active ?? (peak >= 0 ? peak : data.length - 1);
  const current = data[shown];

  return (
    <figure aria-label={label} className="m-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className="sl-num text-[20px] font-medium tracking-[-0.03em]">{current ? format(current.value) : "—"}</span>
        <span className="sl-muted text-[12px]">{current?.label}</span>
      </div>
      <div className="relative flex items-end gap-[3px]" style={{ height }} onMouseLeave={() => setActive(null)}>
        {data.map((d, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${d.label}: ${format(d.value)}`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            className="group relative flex h-full flex-1 items-end bg-transparent p-0"
            style={{ border: 0, cursor: "default" }}
          >
            <span
              className="block w-full rounded-[2px] transition-colors"
              style={{
                height: `${Math.max(d.value > 0 ? 3 : 1, (d.value / max) * 100)}%`,
                background: i === shown ? "var(--sl-accent)" : d.value > 0 ? "var(--sl-surface-3)" : "var(--sl-line)",
              }}
            />
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px]" style={{ color: "var(--sl-faint)", borderTop: "1px solid var(--sl-line)", paddingTop: 8 }}>
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </figure>
  );
}
