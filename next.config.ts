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
  // CSP is intentionally omitted here — a strict policy needs per-request
  // nonces for Next's inline bootstrap; add it at the reverse proxy (see
  // HANDOFF) once nonce wiring is in place. HSTS only bites over HTTPS.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
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
