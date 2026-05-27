import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const staffId = searchParams.get("staffId");

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    // If staffId is provided, return doctor-specific stats
    if (staffId) {
      const [myPatients, todayAppointments, activePackages, todayAppointmentsList] = await Promise.all([
        prisma.clientDoctorAssignment.count({ where: { staffId } }),
        prisma.appointment.count({
          where: {
            therapistId: staffId,
            startTime: { gte: startOfDay, lt: endOfDay },
            status: { not: "CANCELLED" },
          },
        }),
        prisma.package.count({
          where: {
            status: "ACTIVE",
            client: {
              doctorAssignments: { some: { staffId } },
            },
          },
        }),
        prisma.appointment.findMany({
          where: {
            therapistId: staffId,
            startTime: { gte: startOfDay, lt: endOfDay },
            status: { not: "CANCELLED" },
          },
          include: {
            client: { select: { id: true, firstName: true, lastName: true, clientCode: true, phone: true } },
            service: { select: { id: true, name: true } },
          },
          orderBy: { startTime: "asc" },
        }),
      ]);

      return NextResponse.json({
        totalClients: myPatients,
        todaySessions: todayAppointments,
        activePackages,
        pendingInvoices: 0,
        todayAppointmentsList,
      });
    }

    // General stats (for FO/Admin/Owner)
    const [totalClients, activePackages, todaySessions, pendingInvoices, recentClients, recentSessions] = await Promise.all([
      prisma.client.count(),
      prisma.package.count({ where: { status: "ACTIVE" } }),
      prisma.session.count({
        where: {
          sessionDate: { gte: startOfDay, lt: endOfDay },
        },
      }),
      prisma.invoice.count({
        where: { status: { in: ["DRAFT", "SENT", "PARTIAL", "OVERDUE"] } },
      }),
      prisma.client.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, clientCode: true, firstName: true, lastName: true, createdAt: true },
      }),
      prisma.session.findMany({
        where: { sessionDate: { gte: startOfDay, lt: endOfDay } },
        include: { client: true, therapist: true, service: true },
        orderBy: { sessionDate: "asc" },
        take: 10,
      }),
    ]);

    // Monthly revenue for chart
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const payments = await prisma.payment.findMany({
      where: { paymentDate: { gte: sixMonthsAgo } },
      select: { amount: true, paymentDate: true },
    });

    const revenueByMonth: Record<string, number> = {};
    payments.forEach((p) => {
      const key = `${p.paymentDate.getFullYear()}-${String(p.paymentDate.getMonth() + 1).padStart(2, "0")}`;
      revenueByMonth[key] = (revenueByMonth[key] || 0) + p.amount;
    });

    // Session stats
    const sessionStats = await prisma.session.groupBy({
      by: ["status"],
      _count: true,
    });

    // Daily session counts for last 7 days (for dashboard chart)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const recentSessionsAll = await prisma.session.findMany({
      where: { sessionDate: { gte: sevenDaysAgo } },
      select: { sessionDate: true },
    });

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weeklySessionCounts: { name: string; sessions: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - 6 + i);
      d.setHours(0, 0, 0, 0);
      const nextD = new Date(d);
      nextD.setDate(nextD.getDate() + 1);
      const count = recentSessionsAll.filter(
        (s) => s.sessionDate >= d && s.sessionDate < nextD
      ).length;
      weeklySessionCounts.push({ name: dayNames[d.getDay()], sessions: count });
    }

    // Packages expiring within 7 days
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const expiringPackages = await prisma.package.count({
      where: {
        status: "ACTIVE",
        validUntil: { gte: today, lte: nextWeek },
      },
    });

    return NextResponse.json({
      totalClients,
      activePackages,
      todaySessions,
      pendingInvoices,
      recentClients,
      recentSessions,
      revenueByMonth,
      sessionStats,
      totalRevenue: payments.reduce((sum, p) => sum + p.amount, 0),
      weeklySessionCounts,
      expiringPackages,
    });
  } catch (error) {
    console.error("[GET /api/dashboard/stats]", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
