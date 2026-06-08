// Structured JSON logger built on Pino (MIT, FOSS).
//
// Why Pino and not Sentry/Datadog:
//   - Zero external service. Logs live on disk; we own them.
//   - Pino is the fastest Node logger; ~5× faster than Winston.
//   - Drop-in compatible with a self-hosted GlitchTip (Sentry-API
//     compatible, AGPL-3.0) when we're ready to add error aggregation.
//
// Layout:
//   - DEV: pino-pretty for human-readable colored output to stdout.
//   - PROD: pino-roll rotates logs daily into ./logs/app-YYYY-MM-DD.jsonl.
//     The `logs/` directory is gitignored.
//
// Usage:
//   import { logger } from "@/lib/logger";
//   logger.info({ cron: "package-expiry", alerts: 5 }, "cron job ok");
//   logger.error({ err }, "audit write failed");
//
// Request-scoped child loggers carry a request ID so a single FO request
// is traceable across cron triggers, audit writes, and downstream calls:
//   const log = logger.child({ requestId });
//
// Reference: audit-2026-06-06 OBS-002 (Medium, live-confirmed gap).

import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";
const level = process.env.LOG_LEVEL ?? (isDev ? "debug" : "info");

function buildLogger(): pino.Logger {
  if (isDev) {
    return pino({
      level,
      transport: {
        target: "pino-pretty",
        options: {
          translateTime: "SYS:HH:MM:ss.l",
          colorize: true,
          singleLine: false,
          ignore: "pid,hostname",
        },
      },
    });
  }
  return pino({
    level,
    transport: {
      target: "pino-roll",
      options: {
        file: "./logs/app",
        frequency: "daily",
        size: "100m",
        mkdir: true,
        extension: ".jsonl",
      },
    },
    base: {
      app: "mbd-clinic-os",
      env: process.env.NODE_ENV,
    },
  });
}

// Single global instance survives Next.js hot reloads.
declare global {
  var __mbdLogger: pino.Logger | undefined;
}

export const logger: pino.Logger =
  globalThis.__mbdLogger ?? buildLogger();

if (isDev) {
  globalThis.__mbdLogger = logger;
}

/**
 * Mint a per-request child logger carrying a stable requestId. Use in
 * any API handler that does meaningful work; the requestId surfaces in
 * every downstream log line AND in the X-Request-ID response header so a
 * support ticket can be traced.
 */
export function childForRequest(req: Request): { log: pino.Logger; requestId: string } {
  const headerId = req.headers.get("x-request-id");
  const requestId = headerId && headerId.length <= 64 ? headerId : crypto.randomUUID();
  return { log: logger.child({ requestId }), requestId };
}
