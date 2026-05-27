// Next.js instrumentation hook — runs once per server process boot.
// Skipped on Edge runtime (node-cron is Node-only).

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.MBD_DISABLE_CRON === "1") return;
  const { startScheduler } = await import("@/lib/cron/scheduler");
  await startScheduler();
}
