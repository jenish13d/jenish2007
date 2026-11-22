import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_LAYOUT, WIDGETS, moveWidget, normalizeLayout, sameLayout, toggleWidget } from "../lib/dashboard/layout.ts";

test("empty or garbage storage yields the default layout", () => {
  assert.deepEqual(normalizeLayout(null), { order: DEFAULT_LAYOUT.order, hidden: [] });
  assert.deepEqual(normalizeLayout("x"), { order: DEFAULT_LAYOUT.order, hidden: [] });
  assert.deepEqual(normalizeLayout({ order: 5, hidden: "a" }), { order: DEFAULT_LAYOUT.order, hidden: [] });
});

test("unknown and duplicate widgets are dropped; new widgets are appended", () => {
  const l = normalizeLayout({ order: ["recent", "recent", "evil<script>", "trend"], hidden: ["streams", "nope"] });
  assert.deepEqual(l.order.slice(0, 2), ["recent", "trend"]);
  assert.equal(l.order.length, WIDGETS.length);
  assert.deepEqual(l.hidden, ["streams"]);
});

test("move and toggle are pure and bounded", () => {
  const moved = moveWidget(DEFAULT_LAYOUT, "setup", 0);
  assert.equal(moved.order[0], "setup");
  assert.equal(moveWidget(DEFAULT_LAYOUT, "earnings", 99).order.at(-1), "earnings");
  assert.equal(DEFAULT_LAYOUT.order[0], "earnings", "default not mutated");
  const hidden = toggleWidget(DEFAULT_LAYOUT, "streams");
  assert.deepEqual(hidden.hidden, ["streams"]);
  assert.deepEqual(toggleWidget(hidden, "streams").hidden, []);
  assert.ok(sameLayout(DEFAULT_LAYOUT, normalizeLayout({})));
  assert.ok(!sameLayout(DEFAULT_LAYOUT, moved));
});
