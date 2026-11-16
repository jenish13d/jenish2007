/**
 * Text-to-speech text preparation.
 *
 * The emoji substitutions are a product feature, not incidental: StreamLounge's
 * audience is Indian streamers, the alerts are read in Hinglish, and an emoji
 * read as "grinning face with smiling eyes" by an English TTS voice lands
 * badly. The original mapping is preserved; it is moved out of the route
 * handler so it can be tested without a network call.
 */

const EMOJI_READINGS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\u{1F602}/gu, "hasta hua chehra"],
  [/\u{1F923}/gu, "zor se hasta hua chehra"],
  [/\u{1F60D}/gu, "dil wali aankhon wala chehra"],
  [/\u{1F622}/gu, "udaas chehra"],
  [/\u{1F62D}/gu, "zor se rota hua chehra"],
  [/\u{1F621}/gu, "gusse wala chehra"],
  [/\u{1F60E}/gu, "sunglasses wala chehra"],
  [/\u{1F914}/gu, "sochta hua chehra"],
  [/\u{1F631}/gu, "dara hua chehra"],
  [/\u{1F44F}/gu, "taali"],
  [/\u{1F44D}/gu, "thumbs up"],
  [/\u{1F44E}/gu, "thumbs down"],
  [/\u{1F64F}/gu, "haath jodna"],
  [/\u{1F440}/gu, "aankhen"],
  [/\u{1F4AA}/gu, "strong arm"],
  [/\u{1F525}/gu, "aag"],
  [/\u{2764}\u{FE0F}/gu, "laal dil"],
  [/\u{2764}/gu, "laal dil"],
  [/\u{1F494}/gu, "toota hua dil"],
  [/\u{1F4AF}/gu, "sau percent"],
  [/\u{2728}/gu, "chamak"],
  [/\u{2B50}/gu, "sitara"],
  [/\u{1F680}/gu, "rocket"],
];

export const MAX_SPEECH_CHARACTERS = 500;

/** Replaces known emoji with spoken readings and normalises whitespace. */
export function prepareSpeechText(input: string): string {
  let result = input.slice(0, MAX_SPEECH_CHARACTERS);

  for (const [pattern, reading] of EMOJI_READINGS) {
    result = result.replace(pattern, `, ${reading}, `);
  }

  return result.replace(/\s+/g, " ").trim();
}

export const SPEECH_INSTRUCTIONS =
  "Speak naturally and clearly. Support English, Hindi and Hinglish. " +
  "Pronounce Romanized Hindi naturally. Speak emoji meanings as words.";
