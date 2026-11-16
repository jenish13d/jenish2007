import assert from "node:assert/strict";
import { test } from "node:test";

import { exactIlikePattern } from "../lib/db/like.ts";
import { safeNextPath } from "../lib/http/safe-redirect.ts";

test("exactIlikePattern escapes LIKE wildcards in usernames", () => {
  assert.equal(exactIlikePattern("a_b"), "a\\_b");
  assert.equal(exactIlikePattern("50%off"), "50\\%off");
  assert.equal(exactIlikePattern("plain"), "plain");
  assert.equal(exactIlikePattern("back\\slash"), "back\\\\slash");
});

test("safeNextPath only allows same-site paths", () => {
  assert.equal(safeNextPath("/dashboard/earnings"), "/dashboard/earnings");
  assert.equal(safeNextPath("//evil.com"), "/dashboard");
  assert.equal(safeNextPath("/\\evil.com"), "/dashboard");
  assert.equal(safeNextPath("https://evil.com"), "/dashboard");
  assert.equal(safeNextPath(null), "/dashboard");
  assert.equal(safeNextPath(undefined, "/"), "/");
});

import { stickerPathFor } from "../lib/storage/soundboard.ts";

test("stickerPathFor derives a confined path from verified ids only", () => {
  const creator = "0b7c9a52-1d3e-4f6a-9b8c-7d6e5f4a3b2c";
  assert.equal(stickerPathFor(creator, "pay_ABC123"), `${creator}/pay_ABC123.png`);
  assert.equal(stickerPathFor(creator, "../other"), null);
  assert.equal(stickerPathFor(creator, "pay/../x"), null);
  assert.equal(stickerPathFor("not-a-uuid", "pay_ABC123"), null);
});
