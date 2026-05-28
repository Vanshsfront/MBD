import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Don't bundle server-only native deps for the client.
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "exceljs",
    "docxtemplater",
    "pizzip",
    "node-cron",
  ],
  // Baseline security headers for a PHI/financial app (PRD §11 / hardening).
  // CSP is a pragmatic v1 below — it blocks external script/style/image loads
  // and inline event handlers, but still allows 'unsafe-inline' for Next's
  // bootstrap and Tailwind utilities. A strict nonce policy belongs at the
  // reverse proxy once that's wired (see HANDOFF). HSTS only bites over HTTPS.
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    // 'unsafe-eval' is only needed during `next dev` for hot reload; drop it
    // in production builds.
    const scriptSrc = isDev
      ? "'self' 'unsafe-inline' 'unsafe-eval'"
      : "'self' 'unsafe-inline'";
    const csp = [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      // Tailwind + Radix emit some style attributes; data: covers font/inline
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      // App-only fetches (NextAuth, our /api/*); blob: covers FullCalendar.
      "connect-src 'self' blob:",
      // No iframes; locked-down ancestors mirror X-Frame-Options DENY.
      "frame-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      // Upgrade insecure requests in prod; dev still talks to http:.
      ...(isDev ? [] : ["upgrade-insecure-requests"]),
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
