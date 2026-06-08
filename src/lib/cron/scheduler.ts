// node-cron scheduler. Boots once per Node process via the global guard so
// hot-reload doesn't stack timers, and only when the runtime is Node (skipped
// for the Edge runtime where node-cron isn't available).

import { runPackageExpiryJob, runLowStockJob, runFollowUpDueJob, runIntakeTokenPurgeJob } from "@/lib/cron/jobs";
import { logger } from "@/lib/logger";

declare global {
  var __mbdCronStarted: boolean | undefined;
}

let started = false;

export async function startScheduler(): Promise<void> {
  if (started || globalThis.__mbdCronStarted) return;
  started = true;
  globalThis.__mbdCronStarted = true;

  // Lazy-load node-cron so the module isn't pulled into Edge bundles.
  const cron = (await import("node-cron")).default;

  // Daily at 06:00 local: package expiry + follow-up-due.
  cron.schedule("0 6 * * *", () => {
    void safeRun("package-expiry", runPackageExpiryJob);
    void safeRun("follow-up-due", () => runFollowUpDueJob(14));
  });

  // Every 4 hours: low-stock sweep.
  cron.schedule("0 */4 * * *", () => {
    void safeRun("low-stock", runLowStockJob);
  });

  // Daily at 03:00: purge expired intake tokens older than 7 days.
  // Reference: audit-2026-06-06 F-003 (Critical, retention policy).
  cron.schedule("0 3 * * *", () => {
    void safeRun("intake-token-purge", runIntakeTokenPurgeJob);
  });

  logger.info({ event: "cron.scheduler.started" }, "cron scheduler started");
}

async function safeRun(name: string, fn: () => Promise<unknown>): Promise<void> {
  const start = Date.now();
  try {
    const result = await fn();
    logger.info(
      { event: "cron.job.ok", job: name, durationMs: Date.now() - start, result },
      `cron job ${name} ok`,
    );
  } catch (err) {
    logger.error(
      { event: "cron.job.failed", job: name, durationMs: Date.now() - start, err },
      `cron job ${name} failed`,
    );
  }
}

/**
 * Run all jobs once on demand (for /api/cron/run-now or one-off testing).
 */
export async function runAllOnce(): Promise<{
  packageExpiry: { alerts: number };
  lowStock: { alerts: number };
  followUpDue: { notifications: number };
  intakeTokenPurge: { purged: number };
}> {
  const [packageExpiry, lowStock, followUpDue, intakeTokenPurge] = await Promise.all([
    runPackageExpiryJob(),
    runLowStockJob(),
    runFollowUpDueJob(14),
    runIntakeTokenPurgeJob(),
  ]);
  return { packageExpiry, lowStock, followUpDue, intakeTokenPurge };
}
