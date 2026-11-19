/* Pure helpers with no dependencies, so they are unit-testable anywhere. */

/** The effective message limit: the creator's choice clamped to platform bounds and the type's own cap. */
export function effectiveMessageLimit(
  creatorLimit: number | null | undefined,
  bounds: { min: number; max: number; fallback: number },
  typeMax: number,
): number {
  const chosen = creatorLimit ?? bounds.fallback;
  const clamped = Math.min(Math.max(chosen, bounds.min), bounds.max);
  return Math.max(1, Math.min(clamped, typeMax));
}

/** Truncates by Unicode code points so an emoji is never split in half. */
export function truncateCodePoints(value: string, max: number): string {
  const chars = [...value];
  return chars.length <= max ? value : chars.slice(0, max).join("");
}
