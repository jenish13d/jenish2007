import assert from "node:assert/strict";
import { test } from "node:test";

import { moderateDisplayName } from "../lib/moderation/display-name.ts";

const ok = (v: string, ctx = {}) => {
  const r = moderateDisplayName(v, ctx);
  assert.ok(r.ok, `${v} should be allowed: ${!r.ok ? r.reason : ""}`);
  return r.ok ? r.value : "";
};
const no = (v: string, ctx = {}) => assert.equal(moderateDisplayName(v, ctx).ok, false, `${v} should be blocked`);

test("plain and Indic names are allowed and trimmed", () => {
  assert.equal(ok("  Shiv  "), "Shiv");
  assert.equal(ok("राहुल"), "राहुल");
  assert.equal(ok(""), "Anonymous");
});
test("invisible and bidi characters are stripped", () => {
  assert.equal(ok("Sh​iv‮"), "Shiv");
});
test("full-width and mixed-script spoofs of reserved names are blocked", () => {
  no("ＡＤＭＩＮ");
  no("StreamLounge");
  no("Stream Lounge Official");
  no("аdmin"); // Cyrillic a
  no("Moderator");
});
test("impersonating the creator is blocked", () => {
  no("Jenish", { creatorName: "Jenish" });
  no("j e n i s h", { creatorUsername: "jenish" });
});
test("offensive names and leetspeak are blocked", () => {
  no("sh1t lord");
  no("f.u.c.k");
});
test("links, markup and over-long names are blocked", () => {
  no("<script>");
  no("visit www.example.com");
  no("x".repeat(40));
});
