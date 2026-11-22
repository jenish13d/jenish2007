import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_PAGE_STYLE, resolvePageStyle } from "../lib/creator/page-style.ts";

test("bad stored style falls back to defaults, field by field", () => {
  assert.deepEqual(resolvePageStyle(null), DEFAULT_PAGE_STYLE);
  const s = resolvePageStyle({ accent: "neon", theme: "light", amounts: [500, 50, 50, -1, 1.5, 9_999_999], show_qr: "yes" });
  assert.equal(s.accent, "champagne");
  assert.equal(s.theme, "light");
  assert.deepEqual(s.amounts, [50, 500]);
  assert.equal(s.show_qr, true);
});
