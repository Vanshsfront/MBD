import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // Build date filter for sessions
    const dateFilter: Record<string, unknown> = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }

    const sessionWhere: Record<string, unknown> = {};
    if (startDate || endDate) {
      sessionWhere.sessionDate = dateFilter;
    }

    // Get all active staff (therapists / consultants)
    const staff = await prisma.staff.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true },
    });

    // Get sessions grouped by therapist and status
    const sessions = await prisma.session.findMany({
      where: sessionWhere,
      select: {
        therapistId: true,
        status: true,
        packageId: true,
        clientId: true,
      },
    });

    // Get invoices within date range for revenue calculation
    const invoiceWhere: Record<string, unknown> = {};
    if (startDate || endDate) {
      const invoiceDateFilter: Record<string, unknown> = {};
      if (startDate) invoiceDateFilter.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        invoiceDateFilter.lte = end;
      }
      invoiceWhere.createdAt = invoiceDateFilter;
    }

    const invoices = await prisma.invoice.findMany({
      where: invoiceWhere,
      select: {
        totalAmount: true,
        paidAmount: true,
        status: true,
        packageId: true,
        package: {
          select: {
            sessions: {
              where: sessionWhere,
              select: { therapistId: true },
              take: 1,
            },
          },
        },
        clientId: true,
      },
    });

    // Appointment cancellations split by who cancelled
    const appointmentWhere: Record<string, unknown> = {};
    if (startDate || endDate) {
      const apptDateFilter: Record<string, unknown> = {};
      if (startDate) apptDateFilter.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        apptDateFilter.lte = end;
      }
      appointmentWhere.startTime = apptDateFilter;
    }
    const cancelledAppointments = await prisma.appointment.findMany({
      where: { ...appointmentWhere, status: "CANCELLED" },
      select: { therapistId: true, cancelledBy: true },
    });

    // Build a map: therapistId -> stats
    const staffMap = new Map<string, {
      completed: number;
      cancelled: number;
      cancelledByPatient: number;
      cancelledByTherapist: number;
      noShow: number;
      scheduled: number;
      revenue: number;
    }>();

    for (const s of staff) {
      staffMap.set(s.id, { completed: 0, cancelled: 0, cancelledByPatient: 0, cancelledByTherapist: 0, noShow: 0, scheduled: 0, revenue: 0 });
    }

    for (const sess of sessions) {
      let entry = staffMap.get(sess.therapistId);
      if (!entry) {
        entry = { completed: 0, cancelled: 0, cancelledByPatient: 0, cancelledByTherapist: 0, noShow: 0, scheduled: 0, revenue: 0 };
        staffMap.set(sess.therapistId, entry);
      }
      switch (sess.status) {
        case "COMPLETED": entry.completed++; break;
        case "CANCELLED": entry.cancelled++; break;
        case "NO_SHOW": entry.noShow++; break;
        case "SCHEDULED": entry.scheduled++; break;
      }
    }

    // Split appointment cancellations
    for (const appt of cancelledAppointments) {
      let entry = staffMap.get(appt.therapistId);
      if (!entry) {
        entry = { completed: 0, cancelled: 0, cancelledByPatient: 0, cancelledByTherapist: 0, noShow: 0, scheduled: 0, revenue: 0 };
        staffMap.set(appt.therapistId, entry);
      }
      if (appt.cancelledBy === "PATIENT") entry.cancelledByPatient++;
      else if (appt.cancelledBy === "THERAPIST") entry.cancelledByTherapist++;
    }

    // Assign invoice revenue to therapists via package -> sessions link
    // For invoices linked to a package, attribute to the therapist who handled sessions in that package
    // For invoices without packages, we cannot attribute to a specific therapist
    for (const inv of invoices) {
      if (inv.package?.sessions?.[0]?.therapistId) {
        const therapistId = inv.package.sessions[0].therapistId;
        const entry = staffMap.get(therapistId);
        if (entry) {
          entry.revenue += inv.paidAmount || 0;
        }
      }
    }

    // Build result array
    const result = staff
      .map((s) => {
        const data = staffMap.get(s.id) || { completed: 0, cancelled: 0, cancelledByPatient: 0, cancelledByTherapist: 0, noShow: 0, scheduled: 0, revenue: 0 };
        const totalSessions = data.completed + data.cancelled + data.noShow + data.scheduled;
        const completionRate = totalSessions > 0
          ? Math.round((data.completed / totalSessions) * 100)
          : 0;

        return {
          id: s.id,
          name: s.name,
          role: s.role,
          completed: data.completed,
          cancelled: data.cancelled,
          cancelledByPatient: data.cancelledByPatient,
          cancelledByTherapist: data.cancelledByTherapist,
          noShow: data.noShow,
          scheduled: data.scheduled,
          totalSessions,
          completionRate,
          revenue: Math.round(data.revenue),
        };
      })
      .filter((s) => s.totalSessions > 0 || s.cancelledByPatient > 0 || s.cancelledByTherapist > 0)
      .sort((a, b) => b.completed - a.completed);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Staff report error:", error);
    return NextResponse.json({ error: "Failed to generate staff report" }, { status: 500 });
  }
}
