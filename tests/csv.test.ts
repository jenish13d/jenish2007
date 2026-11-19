import assert from "node:assert/strict";
import { test } from "node:test";

import { csvCell } from "../lib/admin/csv.ts";

test("csv cells escape quotes, commas and spreadsheet formulas", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(csvCell("+1"), "'+1");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(12500), "12500");
  assert.equal(csvCell(-500), "-500");
  assert.equal(csvCell("-5+cmd"), "'-5+cmd");
});
