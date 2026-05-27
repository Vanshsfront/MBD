import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

// GET /api/appointments — list appointments with filters
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date"); // YYYY-MM-DD
    const dateFrom = searchParams.get("dateFrom"); // YYYY-MM-DD
    const dateTo = searchParams.get("dateTo"); // YYYY-MM-DD
    const therapistId = searchParams.get("therapistId");
    const clientId = searchParams.get("clientId");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};

    if (dateFrom && dateTo) {
      const start = new Date(dateFrom);
      start.setHours(0, 0, 0, 0);
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      where.startTime = { gte: start, lte: end };
    } else if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      where.startTime = { gte: start, lte: end };
    }

    if (therapistId) where.therapistId = therapistId;
    if (clientId) where.clientId = clientId;
    if (status && status !== "ALL") {
      // Support comma-separated values (e.g. "CANCELLED,NO_SHOW")
      if (status.includes(",")) {
        where.status = { in: status.split(",").map(s => s.trim()) };
      } else {
        where.status = status;
      }
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        client: { select: { id: true, firstName: true, lastName: true, clientCode: true, phone: true } },
        therapist: { select: { id: true, name: true, designation: true } },
        service: { select: { id: true, name: true } },
      },
      orderBy: { startTime: "asc" },
    });

    return NextResponse.json(appointments);
  } catch (error) {
    console.error("[GET /api/appointments]", error);
    return NextResponse.json({ error: "Failed to fetch appointments" }, { status: 500 });
  }
}

// POST /api/appointments — create appointment with conflict detection
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clientId, therapistId, serviceId, startTime, endTime, notes, performedById, force, queuePosition, backupStartTime, backupEndTime } = body;

    if (!clientId || !therapistId || !serviceId || !startTime || !endTime) {
      return NextResponse.json({ error: "clientId, therapistId, serviceId, startTime, and endTime are required" }, { status: 400 });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    // Conflict detection: check for overlapping appointments for this therapist
    const conflicts = await prisma.appointment.findMany({
      where: {
        therapistId,
        status: { in: ["CONFIRMED", "CHECKED_IN"] },
        OR: [
          { startTime: { lt: end }, endTime: { gt: start } },
        ],
      },
      include: {
        client: { select: { firstName: true, lastName: true } },
        service: { select: { name: true } },
      },
    });

    // If there are conflicts and this is NOT a force/queue request, return 409
    if (conflicts.length > 0 && !force && !queuePosition) {
      const conflictNames = conflicts.map(c => `${c.client.firstName} ${c.client.lastName}`).join(", ");
      return NextResponse.json({
        error: "CONFLICT",
        message: `Therapist has overlapping appointment(s) with: ${conflictNames}`,
        conflicts: conflicts.map(c => ({
          id: c.id,
          clientName: `${c.client.firstName} ${c.client.lastName}`,
          startTime: c.startTime,
          endTime: c.endTime,
          serviceName: c.service.name,
        })),
      }, { status: 409 });
    }

    // Force mode: cancel conflicting appointments before creating the new one
    if (force && conflicts.length > 0) {
      await prisma.appointment.updateMany({
        where: { id: { in: conflicts.map(c => c.id) } },
        data: { status: "CANCELLED" },
      });
    }

    // Calculate queue position for this therapist on this day
    const dayStart = new Date(start);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(start);
    dayEnd.setHours(23, 59, 59, 999);

    const existingCount = await prisma.appointment.count({
      where: {
        therapistId,
        startTime: { gte: dayStart, lte: dayEnd },
        status: { in: ["CONFIRMED", "CHECKED_IN"] },
      },
    });

    // Determine status and queue fields
    const isQueued = !!queuePosition;

    const appointment = await prisma.appointment.create({
      data: {
        clientId,
        therapistId,
        serviceId,
        startTime: start,
        endTime: end,
        status: isQueued ? "QUEUED" : "CONFIRMED",
        notes: notes || null,
        queuePosition: isQueued ? queuePosition : existingCount + 1,
        backupStartTime: backupStartTime ? new Date(backupStartTime) : null,
        backupEndTime: backupEndTime ? new Date(backupEndTime) : null,
      },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, clientCode: true } },
        therapist: { select: { id: true, name: true } },
        service: { select: { id: true, name: true } },
      },
    });

    // Audit
    if (performedById) {
      await createAuditLog({
        action: "CREATE",
        entity: "Appointment",
        entityId: appointment.id,
        performedById,
        changes: { clientId, therapistId, serviceId, startTime, endTime, ...(isQueued ? { queuePosition, backupStartTime, backupEndTime } : {}) },
        metadata: {
          clientCode: appointment.client.clientCode,
          clientName: `${appointment.client.firstName} ${appointment.client.lastName}`,
          therapistName: appointment.therapist.name,
          serviceName: appointment.service.name,
          ...(isQueued ? { queued: true } : {}),
          ...(force ? { replacedConflicts: conflicts.map(c => c.id) } : {}),
        },
      });
    }

    // Send notification to the therapist/doctor about the new appointment
    if (therapistId && performedById !== therapistId) {
      const formattedDate = start.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
      const formattedTime = start.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      await prisma.notification.create({
        data: {
          type: "APPOINTMENT",
          title: "New Appointment Scheduled",
          message: `${appointment.client.firstName} ${appointment.client.lastName} (${appointment.service.name}) scheduled for ${formattedDate} at ${formattedTime}.`,
          targetUserId: therapistId,
          clientId,
          priority: "NORMAL",
          metadata: JSON.stringify({ clientId, appointmentId: appointment.id, actionUrl: "/dashboard/appointments/calendar" }),
        },
      }).catch(() => { /* silent */ });
    }

    return NextResponse.json(appointment, { status: 201 });
  } catch (error) {
    console.error("[POST /api/appointments]", error);
    return NextResponse.json({ error: "Failed to create appointment" }, { status: 500 });
  }
}
