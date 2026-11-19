import assert from "node:assert/strict";
import { test } from "node:test";

import qrcodegen from "../lib/qr/qrcodegen.ts";
import { qrSvg } from "../lib/qr/svg.ts";

test("encodes a creator link and renders a valid SVG", () => {
  const url = "https://streamlounge.co/c/creator_a";
  const qr = qrcodegen.QrCode.encodeText(url, qrcodegen.QrCode.Ecc.QUARTILE);
  assert.ok(qr.size >= 21);
  const svg = qrSvg(url);
  assert.ok(svg.startsWith("<svg"));
  assert.ok(!svg.includes("streamlounge.co"), "link text must not be embedded in markup");
});

test("rejects colour injection", () => {
  const svg = qrSvg("x", { dark: '"/><script>alert(1)</script>' });
  assert.ok(!svg.includes("script"));
});
