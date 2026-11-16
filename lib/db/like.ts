/**
 * Escapes a value for use as an exact, case-insensitive ILIKE pattern.
 *
 * Usernames may contain `_`, which ILIKE treats as a single-character
 * wildcard. Unescaped, a lookup for `a_b` also matches `axb`, so a viewer on
 * one creator's page could be billed on behalf of another creator.
 */
export function exactIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
