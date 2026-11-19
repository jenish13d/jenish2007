# Vendored: QR Code generator library (TypeScript)

- Source: https://github.com/nayuki/QR-Code-generator — `typescript-javascript/qrcodegen.ts`
- License: MIT (copyright notice preserved at the top of the file)
- Modifications: a provenance header and `export default qrcodegen;` at the end. Nothing else.

Vendored because package installs were unavailable in the build environment.
This folder is third-party code: it is type-checked with the app but excluded
from ESLint style rules (see `eslint.config.mjs`) so it stays byte-identical to
upstream and can be diffed or replaced with the npm package later.
StreamLounge's own wrapper is `lib/qr/svg.ts`.
