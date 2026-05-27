// Appointments CRUD (POST/PATCH/DELETE) + GET for calendar feed.
// Clash check: same therapist with overlapping start..end already booked.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireAuth, requestMeta } from "@/lib/api-auth";
import { createAuditLog, computeChanges } from "@/lib/audit";
import { isClinicalRole } from "@/lib/permissions";

const createSchema = z.object({
  clientId: z.string().min(1),
  therapistId: z.string().min(1),
  serviceId: z.string().min(1),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  notes: z.string().max(500).optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  status: z
    .enum(["CONFIRMED", "RESCHEDULED", "CANCELLED", "COMPLETED", "NO_SHOW"])
    .optional(),
  cancelledBy: z.enum(["PATIENT", "THERAPIST", "CLINIC"]).optional(),
  cancelledReason: z.string().max(500).optional(),
  notes: z.string().max(500).optional(),
});

async function findClash(
  therapistId: string,
  start: Date,
  end: Date,
  excludeId?: string,
): Promise<{
  conflictingStaffName?: string;
  conflictingStart: string;
  conflictingEnd: string;
} | null> {
  const conflict = await prisma.appointment.findFirst({
    where: {
      therapistId,
      status: { in: ["CONFIRMED", "RESCHEDULED"] },
      startTime: { lt: end },
      endTime: { gt: start },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    include: { therapist: { select: { name: true } } },
  });
  if (!conflict) return null;
  return {
    conflictingStaffName: conflict.therapist?.name,
    conflictingStart: conflict.startTime.toISOString(),
    conflictingEnd: conflict.endTime.toISOString(),
  };
}

export async function POST(req: Request) {
  const auth = await requirePermission("appointments:book_reschedule_cancel");
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as unknown;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;
  const start = new Date(f.startTime);
  const end = new Date(f.endTime);
  if (!(end > start)) {
    return NextResponse.json({ error: "end_before_start" }, { status: 400 });
  }
  const clash = await findClash(f.therapistId, start, end);
  if (clash) {
    return NextResponse.json({ error: "clash", ...clash }, { status: 409 });
  }

  const client = await prisma.client.findUnique({ where: { id: f.clientId } });
  if (!client) return NextResponse.json({ error: "client_not_found" }, { status: 404 });

  const appointment = await prisma.appointment.create({
    data: {
      clientId: f.clientId,
      therapistId: f.therapistId,
      serviceId: f.serviceId,
      centreId: client.centreId,
      startTime: start,
      endTime: end,
      notes: f.notes ?? null,
      status: "CONFIRMED",
    },
  });

  // Notification to therapist. NEW_PATIENT only for the client's first ever
  // appointment; everything after is APPT_REMINDER. Otherwise the bell would
  // call every routine booking a "new patient" — confusing for therapists.
  const priorAppointmentCount = await prisma.appointment.count({
    where: { clientId: f.clientId, NOT: { id: appointment.id } },
  });
  const notificationType = priorAppointmentCount === 0 ? "NEW_PATIENT" : "APPT_REMINDER";
  await prisma.notification.create({
    data: {
      type: notificationType,
      title: priorAppointmentCount === 0 ? "New patient booked" : "Appointment booked",
      message: `${client.firstName} ${client.lastName} on ${start.toLocaleString("en-IN")}`,
      targetUserId: f.therapistId,
      metadata: JSON.stringify({ appointmentId: appointment.id, clientId: f.clientId }),
    },
  });

  const meta = requestMeta(req);
  await createAuditLog({
    action: "CREATE",
    entity: "Appointment",
    entityId: appointment.id,
    performedById: auth.user.id,
    changes: {
      startTime: { old: null, new: start.toISOString() },
      endTime: { old: null, new: end.toISOString() },
    },
    metadata: { clientId: f.clientId, therapistId: f.therapistId, serviceId: f.serviceId },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({
    ok: true,
    appointment: serialise(appointment),
  });
}

export async function PATCH(req: Request) {
  const auth = await requirePermission("appointments:book_reschedule_cancel");
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as unknown;
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;

  const existing = await prisma.appointment.findUnique({ where: { id: f.id } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const newStart = f.startTime ? new Date(f.startTime) : existing.startTime;
  const newEnd = f.endTime ? new Date(f.endTime) : existing.endTime;
  if (!(newEnd > newStart)) {
    return NextResponse.json({ error: "end_before_start" }, { status: 400 });
  }
  if (f.startTime || f.endTime) {
    const clash = await findClash(existing.therapistId, newStart, newEnd, f.id);
    if (clash) {
      return NextResponse.json({ error: "clash", ...clash }, { status: 409 });
    }
  }

  const updated = await prisma.appointment.update({
    where: { id: f.id },
    data: {
      ...(f.startTime ? { startTime: newStart } : {}),
      ...(f.endTime ? { endTime: newEnd } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.cancelledBy ? { cancelledBy: f.cancelledBy, cancelledAt: new Date(), cancelledById: auth.user.id } : {}),
      ...(f.cancelledReason !== undefined ? { cancelledReason: f.cancelledReason } : {}),
      ...(f.notes !== undefined ? { notes: f.notes } : {}),
    },
  });

  const changes = computeChanges(
    {
      startTime: existing.startTime.toISOString(),
      endTime: existing.endTime.toISOString(),
      status: existing.status,
      cancelledReason: existing.cancelledReason,
    },
    {
      startTime: updated.startTime.toISOString(),
      endTime: updated.endTime.toISOString(),
      status: updated.status,
      cancelledReason: updated.cancelledReason,
    },
  );
  const meta = requestMeta(req);
  await createAuditLog({
    action: "UPDATE",
    entity: "Appointment",
    entityId: f.id,
    performedById: auth.user.id,
    changes,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ ok: true, appointment: serialise(updated) });
}

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");
  const therapistFilter = url.searchParams.get("therapistId");

  const from = fromStr ? new Date(fromStr) : new Date(Date.now() - 7 * 24 * 3600_000);
  const to = toStr ? new Date(toStr) : new Date(Date.now() + 21 * 24 * 3600_000);

  // Therapists/Consultants only see their own calendar; everyone else sees all (PRD §4 C2).
  const restrictToOwn = isClinicalRole(auth.user.role);

  const appointments = await prisma.appointment.findMany({
    where: {
      startTime: { gte: from, lt: to },
      ...(restrictToOwn ? { therapistId: auth.user.id } : {}),
      ...(therapistFilter && !restrictToOwn ? { therapistId: therapistFilter } : {}),
    },
    orderBy: { startTime: "asc" },
    include: {
      client: { select: { id: true, firstName: true, lastName: true } },
      therapist: { select: { id: true, name: true } },
      service: { select: { id: true, name: true, basePrice: true, departmentId: true } },
    },
  });

  return NextResponse.json(
    appointments.map((a) => ({
      id: a.id,
      title: `${a.client.firstName} ${a.client.lastName} — ${a.service.name}`,
      start: a.startTime.toISOString(),
      end: a.endTime.toISOString(),
      status: a.status,
      therapistId: a.therapist.id,
      therapistName: a.therapist.name,
      clientId: a.client.id,
      serviceId: a.service.id,
      serviceName: a.service.name,
    })),
  );
}

interface PrismaAppointment {
  id: string;
  startTime: Date;
  endTime: Date;
  status: string;
  clientId: string;
  therapistId: string;
  serviceId: string;
}

function serialise(a: PrismaAppointment) {
  return {
    id: a.id,
    startTime: a.startTime.toISOString(),
    endTime: a.endTime.toISOString(),
    status: a.status,
    clientId: a.clientId,
    therapistId: a.therapistId,
    serviceId: a.serviceId,
  };
}
