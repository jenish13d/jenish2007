import qrcodegen from "../../vendor/qrcodegen/qrcodegen.ts";

/**
 * Renders text (a creator payment link) as a standalone SVG QR code.
 * Error correction is QUARTILE so stream compression does not break scanning.
 * Output contains only numbers and validated colours; the encoded text itself
 * never appears in the SVG markup.
 */
export function qrSvg(
  text: string,
  options: { border?: number; dark?: string; light?: string; size?: number } = {},
): string {
  const border = Math.max(0, Math.min(8, Math.round(options.border ?? 4)));
  const isColour = (value: string | undefined) => /^#[0-9a-fA-F]{3,8}$/.test(value ?? "");
  const dark = isColour(options.dark) ? (options.dark as string) : "#0A2137";
  const light = isColour(options.light) ? (options.light as string) : "#FFFFFF";
  const qr = qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.QUARTILE);
  const dim = qr.size + border * 2;
  const parts: string[] = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) parts.push(`M${x + border},${y + border}h1v1h-1z`);
    }
  }
  const px = options.size ? ` width="${Math.round(options.size)}" height="${Math.round(options.size)}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}"${px} shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${light}"/><path d="${parts.join("")}" fill="${dark}"/></svg>`;
}
