import type { NextConfig } from "next";

/**
 * Baseline security headers for every route.
 *
 * The CSP is deliberately limited to directives that cannot break the Razorpay
 * checkout script or the OBS browser source (no script-src/connect-src
 * allow-list yet): it blocks clickjacking, <base> hijacking, plugin content
 * and cross-origin form posts. A full script-src policy should follow once the
 * checkout flow is tested end to end with it in report-only mode.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), usb=(), interest-cohort=()" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
