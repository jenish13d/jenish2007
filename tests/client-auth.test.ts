import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyAuthResult } from "../lib/supabase/auth-state.ts";

const user = { id: "u1" } as never;

test("a user is signed in", () => {
  assert.equal(classifyAuthResult(user, null).status, "signed_in");
});

test("no user and no error is signed out", () => {
  assert.equal(classifyAuthResult(null, null).status, "signed_out");
});

test("missing or rejected sessions are signed out", () => {
  assert.equal(classifyAuthResult(null, { name: "AuthSessionMissingError" }).status, "signed_out");
  assert.equal(classifyAuthResult(null, { name: "AuthApiError", status: 401 }).status, "signed_out");
});

test("network and server failures are errors, not sign-outs (prevents redirect loops)", () => {
  assert.equal(classifyAuthResult(null, { name: "AuthRetryableFetchError", status: 0 }).status, "error");
  assert.equal(classifyAuthResult(null, { name: "AuthUnknownError", status: 500 }).status, "error");
});

import { DEFAULT_TIMEOUT_MS, STORAGE_TIMEOUT_MS, pickTimeout } from "../lib/supabase/timeout-fetch.ts";

test("only storage uploads get the long timeout", () => {
  const base = "https://x.supabase.co";
  assert.equal(pickTimeout(`${base}/storage/v1/object/voice/a.webm`, "POST", DEFAULT_TIMEOUT_MS), STORAGE_TIMEOUT_MS);
  assert.equal(pickTimeout(`${base}/storage/v1/object/sign/voice/a.webm`, "POST", DEFAULT_TIMEOUT_MS), DEFAULT_TIMEOUT_MS);
  assert.equal(pickTimeout(`${base}/auth/v1/user`, "GET", DEFAULT_TIMEOUT_MS), DEFAULT_TIMEOUT_MS);
  assert.equal(pickTimeout(`${base}/rest/v1/creator_profiles`, "POST", DEFAULT_TIMEOUT_MS), DEFAULT_TIMEOUT_MS);
});
