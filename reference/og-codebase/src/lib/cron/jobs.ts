// Cron job bodies (PRD §4 B7, FO daily, alerts).
//
// Each job is idempotent: it computes the relevant set, then de-dupes against
// recent Alerts/Notifications so re-running within the same day doesn't spam.

import { prisma } from "@/lib/prisma";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Package-expiry: warn for packages whose validUntil is within
 * `expiryWarningDays` from now AND haven't already been alerted today.
 */
export async function runPackageExpiryJob(): Promise<{ alerts: number }> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 30 * ONE_DAY_MS);

  const candidates = await prisma.package.findMany({
    where: {
      status: "ACTIVE",
      validUntil: { gte: now, lte: horizon },
    },
    include: { client: { select: { id: true, firstName: true, lastName: true } } },
  });

  let created = 0;
  for (const p of candidates) {
    const daysLeft = Math.ceil((p.validUntil.getTime() - now.getTime()) / ONE_DAY_MS);
    if (daysLeft > p.expiryWarningDays) continue;

    // De-dupe: skip if we already alerted on this package today.
    const since = new Date(now.getTime() - ONE_DAY_MS);
    const existing = await prisma.alert.findFirst({
      where: {
        type: "PACKAGE_EXPIRY",
        clientId: p.clientId,
        createdAt: { gte: since },
        message: { contains: p.id },
      },
    });
    if (existing) continue;

    await prisma.alert.create({
      data: {
        type: "PACKAGE_EXPIRY",
        clientId: p.clientId,
        message: `Package ${p.id} for ${p.client.firstName} ${p.client.lastName} expires in ${daysLeft} day(s) (${p.completedSessions}/${p.totalSessions} sessions used).`,
      },
    });
    created++;
  }
  return { alerts: created };
}

/**
 * Low-stock: emit Alert + Notification to OWNER + ADMIN + FO when stock <=
 * minStock. De-duped daily per item.
 */
export async function runLowStockJob(): Promise<{ alerts: number }> {
  const now = new Date();
  const since = new Date(now.getTime() - ONE_DAY_MS);

  const allItems = await prisma.inventoryItem.findMany({
    include: { product: { select: { name: true } } },
  });
  // Two-column comparison (stock <= minStock) — done in JS rather than SQL
  // since the runtime adapter doesn't expose a portable "field reference".
  const lowStock = allItems.filter((i) => i.stock <= i.minStock);

  const reviewers = await prisma.staff.findMany({
    where: { isActive: true, role: { in: ["OWNER", "ADMIN", "FRONT_OFFICE"] } },
    select: { id: true },
  });

  let created = 0;
  for (const item of lowStock) {
    const recent = await prisma.alert.findFirst({
      where: {
        type: "LOW_STOCK",
        message: { contains: item.id },
        createdAt: { gte: since },
      },
    });
    if (recent) continue;

    const message = `Low stock: ${item.product.name} (${item.stock} left, min ${item.minStock}) [${item.id}]`;
    for (const r of reviewers) {
      await prisma.alert.create({
        data: { type: "LOW_STOCK", targetUserId: r.id, message },
      });
    }
    created++;
  }

  return { alerts: created };
}

/**
 * Follow-up-due: notify therapists when an active package patient hasn't been
 * seen in `followUpDays` (default 14) days and still has remaining sessions.
 */
export async function runFollowUpDueJob(
  followUpDays = 14,
): Promise<{ notifications: number }> {
  const cutoff = new Date(Date.now() - followUpDays * ONE_DAY_MS);

  const activePackages = await prisma.package.findMany({
    where: { status: "ACTIVE" },
    include: {
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          doctorAssignments: {
            where: { endedAt: null },
            select: { staffId: true },
            take: 5,
          },
        },
      },
      sessions: {
        orderBy: { sessionDate: "desc" },
        take: 1,
        select: { sessionDate: true },
      },
    },
  });

  const since = new Date(Date.now() - ONE_DAY_MS);
  let created = 0;
  for (const p of activePackages) {
    if (p.completedSessions >= p.totalSessions) continue;
    const lastSession = p.sessions[0]?.sessionDate;
    const lastSeen = lastSession ?? p.createdAt;
    if (lastSeen >= cutoff) continue;

    for (const a of p.client.doctorAssignments) {
      const recent = await prisma.notification.findFirst({
        where: {
          type: "APPT_REMINDER",
          targetUserId: a.staffId,
          message: { contains: p.id },
          createdAt: { gte: since },
        },
      });
      if (recent) continue;

      await prisma.notification.create({
        data: {
          type: "APPT_REMINDER",
          title: "Follow-up due",
          message: `${p.client.firstName} ${p.client.lastName} hasn't been seen in over ${followUpDays} days (package ${p.id}).`,
          targetUserId: a.staffId,
          metadata: JSON.stringify({ packageId: p.id, clientId: p.client.id }),
        },
      });
      created++;
    }
  }
  return { notifications: created };
}
