import assert from "node:assert/strict";
import { test } from "node:test";

import { effectiveMessageLimit, truncateCodePoints } from "../lib/validation/limits.ts";

const bounds = { min: 10, max: 200, fallback: 50 };

test("message limit defaults to 50 and is clamped to platform and type bounds", () => {
  assert.equal(effectiveMessageLimit(null, bounds, 500), 50);
  assert.equal(effectiveMessageLimit(5, bounds, 500), 10);
  assert.equal(effectiveMessageLimit(9999, bounds, 500), 200);
  assert.equal(effectiveMessageLimit(150, bounds, 120), 120);
});
test("truncation never splits an emoji", () => {
  assert.equal(truncateCodePoints("😀😀😀", 2), "😀😀");
  assert.equal(truncateCodePoints("hello", 10), "hello");
});
