import assert from "node:assert/strict";
import { test } from "node:test";

import { isSealed, openToken, sealToken } from "../lib/security/token-crypto.ts";

const KEY = "a".repeat(64);
const OTHER = "b".repeat(64);

test("round-trips and produces distinct ciphertexts", () => {
  const a = sealToken("ya29.secret", KEY, "youtube:access:u1");
  const b = sealToken("ya29.secret", KEY, "youtube:access:u1");
  assert.notEqual(a, b);
  assert.ok(isSealed(a));
  assert.ok(!a.includes("ya29"));
  assert.equal(openToken(a, KEY, "youtube:access:u1"), "ya29.secret");
});

test("rejects wrong key, wrong owner and tampering", () => {
  const sealed = sealToken("token", KEY, "kick:refresh:u1");
  assert.throws(() => openToken(sealed, OTHER, "kick:refresh:u1"));
  assert.throws(() => openToken(sealed, KEY, "kick:refresh:u2"));
  const parts = sealed.split(":");
  parts[3] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => openToken(parts.join(":"), KEY, "kick:refresh:u1"));
});

test("passes legacy plaintext through", () => {
  assert.equal(openToken("legacy-plain", KEY, "x"), "legacy-plain");
});
