/**
 * Builds the sentence the automatic announcer speaks for a superchat.
 *
 *   "Jay donated 100 rupees."
 *   "Jay donated 100 rupees. Smiley face, smiley face."
 *   "Jay donated 100 rupees and says, Keep going!"
 *
 * Input is untrusted viewer text. Output is plain text for a speech engine:
 * markup, URLs, control and invisible characters are removed; nothing is ever
 * interpreted as HTML or SSML.
 */

const CURRENCY_WORDS: Record<string, [singular: string, plural: string]> = {
  INR: ["rupee", "rupees"],
  USD: ["dollar", "dollars"],
  EUR: ["euro", "euros"],
  GBP: ["pound", "pounds"],
  AED: ["dirham", "dirhams"],
  SGD: ["Singapore dollar", "Singapore dollars"],
  CAD: ["Canadian dollar", "Canadian dollars"],
  AUD: ["Australian dollar", "Australian dollars"],
};

// Common emoji and how they are read. Anything else is dropped rather than
// read as an awkward Unicode name.
export const EMOJI_NAMES: Record<string, string> = {
  "😀": "smiley face", "😃": "smiley face", "😄": "smiling face", "😁": "grinning face", "🙂": "slight smile",
  "😊": "smiling face", "😂": "tears of joy", "🤣": "rolling on the floor laughing", "😅": "sweat smile",
  "😍": "heart eyes", "🥰": "smiling face with hearts", "😘": "blowing a kiss", "😎": "cool face",
  "🤩": "star struck", "😢": "crying face", "😭": "loudly crying", "😡": "angry face", "😱": "screaming face",
  "🤔": "thinking face", "😴": "sleeping face", "🥳": "party face", "😮": "surprised face", "🙏": "folded hands",
  "👍": "thumbs up", "👎": "thumbs down", "👏": "clapping", "🙌": "raised hands", "💪": "flexed bicep",
  "👋": "waving hand", "🤝": "handshake", "✌️": "victory hand", "🔥": "fire", "💯": "hundred points",
  "❤️": "red heart", "❤": "red heart", "💖": "sparkling heart", "💔": "broken heart", "💙": "blue heart",
  "💚": "green heart", "💛": "yellow heart", "💜": "purple heart", "⭐": "star", "🌟": "glowing star",
  "✨": "sparkles", "🎉": "party popper", "🎊": "confetti", "🎁": "gift", "🏆": "trophy", "🥇": "gold medal",
  "🚀": "rocket", "💰": "money bag", "💸": "money with wings", "👑": "crown", "🎮": "video game",
  "🎵": "music note", "🎶": "music notes", "⚡": "lightning", "🌈": "rainbow", "☕": "coffee", "🍕": "pizza",
  "🍰": "cake", "🎂": "birthday cake", "🐐": "goat", "🦁": "lion", "🐶": "dog", "🐱": "cat", "💀": "skull",
  "👀": "eyes", "🤡": "clown", "🙈": "see no evil monkey", "😇": "angel face", "🤗": "hugging face",
};

const MAX_EMOJI_READ = 5;
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F­​-‏‪-‮⁠-⁯﻿]/g;
const EMOJI_SEQUENCE = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*/gu;

export function spokenAmount(amountPaise: number, currency: string): string {
  const code = currency.toUpperCase();
  const whole = Math.floor(amountPaise / 100);
  const fraction = amountPaise % 100;
  const [one, many] = CURRENCY_WORDS[code] ?? [code, code];
  const unit = whole === 1 && fraction === 0 ? one : many;
  const number = fraction === 0 ? whole.toLocaleString("en-IN") : (amountPaise / 100).toFixed(2);
  return `${number} ${unit}`;
}

/** Plain, speakable text: no markup, links, control characters or runaway repeats. */
export function sanitizeForSpeech(value: string): string {
  return value
    .normalize("NFKC")
    .replace(INVISIBLE, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/https?:\/\/\S+|www\.\S+/gi, " link ")
    .replace(/[<>{}[\]`\\|^~]/g, " ")
    .replace(/(.)\1{4,}/gu, "$1$1$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function emojiToWords(text: string): { words: string[]; rest: string } {
  const words: string[] = [];
  const rest = text.replace(EMOJI_SEQUENCE, (match) => {
    const base = match.replace(/\p{Emoji_Modifier}/gu, "");
    const name = EMOJI_NAMES[base] ?? EMOJI_NAMES[base.replace(/️/g, "")];
    if (name && words.length < MAX_EMOJI_READ) words.push(name);
    return " ";
  });
  return { words, rest: rest.replace(/\s+/g, " ").trim() };
}

export function buildAnnouncement(
  event: { senderName: string | null; amountPaise: number; currency: string; message?: string | null },
  options: { readEmojis: boolean; readMessage: boolean; showSender?: boolean; showAmount?: boolean } = {
    readEmojis: true,
    readMessage: true,
  },
): string {
  const name =
    options.showSender === false ? "A viewer" : sanitizeForSpeech(event.senderName || "").slice(0, 32) || "Someone";
  const amount = options.showAmount === false ? "" : ` ${spokenAmount(event.amountPaise, event.currency)}`;
  const opening = options.showAmount === false ? `${name} sent a superchat` : `${name} donated${amount}`;

  if (!options.readMessage || !event.message) return `${opening}.`;

  const cleaned = sanitizeForSpeech(event.message).slice(0, 200);
  const { words, rest } = emojiToWords(cleaned);
  const parts: string[] = [];
  if (rest) parts.push(`${opening} and says, ${rest}`);
  else parts.push(`${opening}.`);
  if (options.readEmojis && words.length > 0) {
    const emojiSentence = words.map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w)).join(", ");
    parts.push(rest ? `${emojiSentence}.` : `${emojiSentence}.`);
  }
  return parts.join(rest ? " " : " ").replace(/\.\./g, ".");
}
