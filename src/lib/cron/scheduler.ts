// node-cron scheduler. Boots once per Node process via the global guard so
// hot-reload doesn't stack timers, and only when the runtime is Node (skipped
// for the Edge runtime where node-cron isn't available).

import { runPackageExpiryJob, runLowStockJob, runFollowUpDueJob } from "@/lib/cron/jobs";

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

  // eslint-disable-next-line no-console
  console.info("[cron] scheduler started");
}

async function safeRun(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    const result = await fn();
    // eslint-disable-next-line no-console
    console.info(`[cron] ${name} ok`, result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[cron] ${name} failed`, err);
  }
}

/**
 * Run all jobs once on demand (for /api/cron/run-now or one-off testing).
 */
export async function runAllOnce(): Promise<{
  packageExpiry: { alerts: number };
  lowStock: { alerts: number };
  followUpDue: { notifications: number };
}> {
  const [packageExpiry, lowStock, followUpDue] = await Promise.all([
    runPackageExpiryJob(),
    runLowStockJob(),
    runFollowUpDueJob(14),
  ]);
  return { packageExpiry, lowStock, followUpDue };
}
