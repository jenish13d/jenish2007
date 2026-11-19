import assert from "node:assert/strict";
import { test } from "node:test";

import { updatePreferencesSchema } from "../lib/validation/preferences.ts";

test("preferences schema rejects unknown keys and out-of-range values", () => {
  assert.equal(updatePreferencesSchema.safeParse({ creator_id: "x" }).success, false);
  assert.equal(updatePreferencesSchema.safeParse({ announcer_rate: 5 }).success, false);
  assert.equal(updatePreferencesSchema.safeParse({ message_max_length: 5000 }).success, false);
  assert.equal(updatePreferencesSchema.safeParse({ location_city: "<b>x</b>" }).success, false);
  assert.equal(updatePreferencesSchema.safeParse({ overlay_overrides: { obs: { scale: 9 } } }).success, false);
  assert.equal(
    updatePreferencesSchema.safeParse({ announcer_muted: true, message_max_length: 50, overlay_overrides: { obs: { scale: 1.2 } } }).success,
    true,
  );
});
