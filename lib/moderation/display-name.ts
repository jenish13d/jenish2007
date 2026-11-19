/**
 * Display-name moderation for the optional sender alias ("Shiv sent ₹100").
 *
 * The alias is what the creator and the stream see. The real payer stays
 * recorded server-side (payments.viewer_user_id) and is never shown to the
 * creator. This module only decides whether a chosen alias is acceptable.
 */

export const DISPLAY_NAME_MAX = 32;

// Zero-width, bidi overrides/isolates, BOM, soft hyphen, and other invisible
// format characters used to spoof names or break layouts.
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ]/g;
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;
// Combining marks stacked to make "zalgo" text.
const STACKED_MARKS = /(\p{M}{3,})/gu;

// Names that would let a sender impersonate the platform or its staff.
// Matched anywhere in the name.
const RESERVED_ANYWHERE = ["streamlounge", "admin", "moderator", "official", "razorpay", "staffteam", "supportteam"];
// Matched only as the whole name, or the name plus a few characters ("mod1").
const RESERVED_WHOLE = ["mod", "support", "staff", "system", "youtube", "twitch", "kick"];

// A short, conservative block list. Matched on a folded form so simple
// letter-substitution ("a$$") and spacing tricks are caught.
const BLOCKED = [
  "fuck", "shit", "bitch", "cunt", "nigger", "nigga", "faggot", "retard", "rape", "slut", "whore",
  "chutiya", "madarchod", "behenchod", "bhenchod", "bhosdike", "gandu", "randi", "lund", "harami",
];

function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/[@4]/g, "a").replace(/[3]/g, "e").replace(/[1!|]/g, "i").replace(/[0]/g, "o")
    .replace(/[$5]/g, "s").replace(/[7]/g, "t")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export type DisplayNameResult =
  | { ok: true; value: string }
  | { ok: false; reason: string };

export function moderateDisplayName(
  raw: string | null | undefined,
  context: { creatorName?: string | null; creatorUsername?: string | null } = {},
): DisplayNameResult {
  if (raw == null) return { ok: true, value: "Anonymous" };

  // NFKC collapses full-width and compatibility look-alikes ("ＡＤＭＩＮ" -> "ADMIN").
  let value = raw.normalize("NFKC").replace(CONTROL, "").replace(INVISIBLE, "");
  value = value.replace(STACKED_MARKS, (marks) => marks.slice(0, 2));
  value = value.replace(/\s+/g, " ").trim();

  if (value === "") return { ok: true, value: "Anonymous" };
  if ([...value].length > DISPLAY_NAME_MAX) {
    return { ok: false, reason: `Display names can be up to ${DISPLAY_NAME_MAX} characters.` };
  }
  if (/[<>{}`\\]/.test(value) || /https?:|www\./i.test(value)) {
    return { ok: false, reason: "Display names can't contain links or code." };
  }

  // Mixing scripts inside one word (Latin + Cyrillic "аdmin") is a spoofing tell.
  const scripts = new Set<string>();
  for (const ch of value.replace(/[^\p{L}]/gu, "")) {
    if (/\p{Script=Latin}/u.test(ch)) scripts.add("Latin");
    else if (/\p{Script=Cyrillic}/u.test(ch)) scripts.add("Cyrillic");
    else if (/\p{Script=Greek}/u.test(ch)) scripts.add("Greek");
  }
  if (scripts.size > 1) {
    return { ok: false, reason: "Display names can't mix look-alike alphabets." };
  }

  const folded = fold(value);
  if (
    RESERVED_ANYWHERE.some((word) => folded.includes(word)) ||
    RESERVED_WHOLE.some((word) => folded.startsWith(word) && folded.length <= word.length + 3)
  ) {
    return { ok: false, reason: "That name is reserved." };
  }
  for (const creatorValue of [context.creatorName, context.creatorUsername]) {
    if (creatorValue && fold(creatorValue).length >= 3 && folded === fold(creatorValue)) {
      return { ok: false, reason: "You can't use the creator's own name." };
    }
  }
  if (BLOCKED.some((word) => folded.includes(word))) {
    return { ok: false, reason: "Please choose a different display name." };
  }

  return { ok: true, value };
}
