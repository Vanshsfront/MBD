import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/cron/package-expiry
// Called by Vercel Cron or manually to handle package expiry warnings and auto-expiration.
export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ── 1. Find packages approaching expiry ──────────────────
    // ACTIVE packages where (validUntil - expiryWarningDays) <= today
    // but validUntil is still >= today (not yet expired)
    const activePackages = await prisma.package.findMany({
      where: {
        status: "ACTIVE",
        validUntil: { gte: today },
      },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, clientCode: true } },
      },
    });

    const warningPackages = activePackages.filter((pkg) => {
      const warningDate = new Date(pkg.validUntil);
      warningDate.setDate(warningDate.getDate() - pkg.expiryWarningDays);
      return warningDate <= today;
    });

    // ── 2. Create notifications for FRONT_OFFICE staff ───────
    const frontOfficeStaff = await prisma.staff.findMany({
      where: { role: "FRONT_OFFICE", isActive: true },
      select: { id: true },
    });

    let notificationsCreated = 0;

    if (warningPackages.length > 0 && frontOfficeStaff.length > 0) {
      const notificationData = warningPackages.flatMap((pkg) => {
        const daysLeft = Math.ceil(
          (pkg.validUntil.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );
        const clientName = `${pkg.client.firstName} ${pkg.client.lastName}`;

        return frontOfficeStaff.map((staff) => ({
          type: "PACKAGE_EXPIRY" as const,
          title: "Package expiring soon",
          message: `${clientName} (${pkg.client.clientCode}) has a package expiring in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`,
          priority: daysLeft <= 3 ? "HIGH" : "NORMAL",
          targetUserId: staff.id,
          clientId: pkg.client.id,
          metadata: JSON.stringify({
            packageId: pkg.id,
            daysLeft,
            validUntil: pkg.validUntil.toISOString(),
          }),
        }));
      });

      // Avoid duplicate notifications: skip if a PACKAGE_EXPIRY notification
      // for the same client+staff was already created today
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);

      const existingToday = await prisma.notification.findMany({
        where: {
          type: "PACKAGE_EXPIRY",
          createdAt: { gte: today, lte: todayEnd },
        },
        select: { targetUserId: true, clientId: true },
      });

      const existingKeys = new Set(
        existingToday.map((n) => `${n.targetUserId}:${n.clientId}`)
      );

      const newNotifications = notificationData.filter(
        (n) => !existingKeys.has(`${n.targetUserId}:${n.clientId}`)
      );

      if (newNotifications.length > 0) {
        const result = await prisma.notification.createMany({
          data: newNotifications,
        });
        notificationsCreated = result.count;
      }
    }

    // ── 3. Mark expired packages ─────────────────────────────
    const expired = await prisma.package.updateMany({
      where: {
        status: "ACTIVE",
        validUntil: { lt: today },
      },
      data: { status: "EXPIRED" },
    });

    return NextResponse.json({
      success: true,
      summary: {
        packagesApproachingExpiry: warningPackages.length,
        notificationsCreated,
        packagesMarkedExpired: expired.count,
      },
    });
  } catch (error) {
    console.error("[CRON /api/cron/package-expiry]", error);
    return NextResponse.json(
      { error: "Failed to process package expiry" },
      { status: 500 }
    );
  }
}
