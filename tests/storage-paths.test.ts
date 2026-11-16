import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_AUDIO_UPLOAD_BYTES,
  extensionForAudioMime,
  interactionAudioPrefix,
  isAllowedAudioMime,
  isAllowedImageMime,
  isInteractionAudioPathFor,
} from "../lib/storage/soundboard.ts";
import { prepareSpeechText } from "../lib/ai/speech.ts";
import {
  RATE_LIMITS,
  consume,
  resetRateLimits,
} from "../lib/security/rate-limit.ts";

const CREATOR = "88888888-8888-4888-8888-888888888888";
const OTHER = "99999999-9999-4999-8999-999999999999";

describe("interaction audio paths", () => {
  it("accepts a path directly under the creator's own folder", () => {
    assert.equal(
      isInteractionAudioPathFor(`${CREATOR}/clip-1.webm`, CREATOR),
      true,
    );
  });

  it("rejects another creator's folder", () => {
    // Without this, a viewer could point a submission at any object in the
    // bucket and the overlay would sign and play it.
    assert.equal(isInteractionAudioPathFor(`${OTHER}/clip-1.webm`, CREATOR), false);
  });

  it("rejects traversal and absolute paths", () => {
    for (const bad of [
      `${CREATOR}/../${OTHER}/clip.webm`,
      `/${CREATOR}/clip.webm`,
      `../${CREATOR}/clip.webm`,
      `${CREATOR}/..`,
      `${CREATOR}\\clip.webm`,
    ]) {
      assert.equal(
        isInteractionAudioPathFor(bad, CREATOR),
        false,
        `expected ${bad} to be rejected`,
      );
    }
  });

  it("rejects nesting below the creator folder", () => {
    assert.equal(
      isInteractionAudioPathFor(`${CREATOR}/sub/clip.webm`, CREATOR),
      false,
    );
  });

  it("rejects the bare prefix and the empty path", () => {
    assert.equal(isInteractionAudioPathFor(interactionAudioPrefix(CREATOR), CREATOR), false);
    assert.equal(isInteractionAudioPathFor("", CREATOR), false);
  });

  it("rejects a creator-id prefix match that is not a folder boundary", () => {
    // "<creator>extra/clip.webm" starts with the id but is a different folder.
    assert.equal(
      isInteractionAudioPathFor(`${CREATOR}extra/clip.webm`, CREATOR),
      false,
    );
  });

  it("rejects characters outside the permitted set", () => {
    for (const bad of [
      `${CREATOR}/clip file.webm`,
      `${CREATOR}/clip%00.webm`,
      `${CREATOR}/clip?x=1.webm`,
      `${CREATOR}/clip#frag.webm`,
    ]) {
      assert.equal(isInteractionAudioPathFor(bad, CREATOR), false, bad);
    }
  });
});

describe("upload type and size limits", () => {
  it("accepts the audio types the recorder produces", () => {
    for (const mime of ["audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4"]) {
      assert.equal(isAllowedAudioMime(mime), true, mime);
    }
  });

  it("rejects non-audio and script-bearing types", () => {
    for (const mime of [
      "text/html",
      "application/javascript",
      "image/svg+xml",
      "application/octet-stream",
      "",
      null,
      undefined,
    ]) {
      assert.equal(isAllowedAudioMime(mime), false, String(mime));
    }
  });

  it("maps each accepted audio type to a file extension", () => {
    assert.equal(extensionForAudioMime("audio/webm"), "webm");
    assert.equal(extensionForAudioMime("audio/mpeg"), "mp3");
    assert.equal(extensionForAudioMime("audio/mp4"), "m4a");
    assert.equal(extensionForAudioMime("application/x-evil"), "bin");
  });

  it("accepts only raster image types for artwork", () => {
    assert.equal(isAllowedImageMime("image/png"), true);
    assert.equal(isAllowedImageMime("image/jpeg"), true);
    // SVG can carry script, so it is not an accepted upload type.
    assert.equal(isAllowedImageMime("image/svg+xml"), false);
  });

  it("caps a voice note at a size a 60-second clip fits inside", () => {
    assert.ok(MAX_AUDIO_UPLOAD_BYTES >= 1024 * 1024);
    assert.ok(MAX_AUDIO_UPLOAD_BYTES <= 10 * 1024 * 1024);
  });
});

describe("speech text preparation", () => {
  it("replaces known emoji with spoken readings", () => {
    const result = prepareSpeechText("that was great \u{1F602}");
    assert.match(result, /hasta hua chehra/);
    assert.ok(!result.includes("\u{1F602}"));
  });

  it("collapses the whitespace the substitutions introduce", () => {
    const result = prepareSpeechText("a \u{1F525}  \u{1F525} b");
    assert.ok(!/\s{2,}/.test(result), result);
  });

  it("truncates to the model's input limit", () => {
    assert.equal(prepareSpeechText("x".repeat(900)).length, 500);
  });

  it("returns an empty string for whitespace-only input", () => {
    assert.equal(prepareSpeechText("   \n\t  "), "");
  });
});

describe("rate limiting", () => {
  it("permits up to the limit and refuses beyond it", () => {
    resetRateLimits();
    const rule = { limit: 3, windowMs: 1000 };

    assert.equal(consume("k", rule, 0).allowed, true);
    assert.equal(consume("k", rule, 10).allowed, true);
    assert.equal(consume("k", rule, 20).allowed, true);

    const refused = consume("k", rule, 30);
    assert.equal(refused.allowed, false);
    assert.ok(refused.retryAfterSeconds >= 1);
  });

  it("resets once the window has passed", () => {
    resetRateLimits();
    const rule = { limit: 1, windowMs: 1000 };

    assert.equal(consume("w", rule, 0).allowed, true);
    assert.equal(consume("w", rule, 500).allowed, false);
    assert.equal(consume("w", rule, 1001).allowed, true);
  });

  it("counts each key independently", () => {
    resetRateLimits();
    const rule = { limit: 1, windowMs: 1000 };

    assert.equal(consume("a", rule, 0).allowed, true);
    assert.equal(consume("b", rule, 0).allowed, true);
    assert.equal(consume("a", rule, 0).allowed, false);
  });

  it("limits the billable AI endpoints more tightly than polling", () => {
    // A mistake here costs money on the OpenAI account, so the relationship is
    // asserted rather than left to a reviewer to notice.
    assert.ok(RATE_LIMITS.aiGeneration.limit < RATE_LIMITS.overlayPoll.limit);
    assert.ok(RATE_LIMITS.aiGeneration.limit <= 10);
  });
});
