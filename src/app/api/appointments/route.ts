// Appointments CRUD (POST/PATCH/DELETE) + GET for calendar feed.
// Clash check: same therapist with overlapping start..end already booked.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireAuth, requestMeta } from "@/lib/api-auth";
import { createAuditLog, computeChanges } from "@/lib/audit";
import { isClinicalRole } from "@/lib/permissions";
import { validateAppointmentTiming, ADJACENCY_WINDOW_MINUTES } from "@/lib/appointments";
import { staffColor } from "@/lib/staff-colors";

const createSchema = z.object({
  clientId: z.string().min(1),
  therapistId: z.string().min(1),
  // Optional: Front Office books the slot without committing to a service —
  // the assigned therapist sets it later. Other roles supply it at booking.
  // When omitted, package consumption is not possible at booking time and
  // any consumeFromPackageId will 400 (we can't match the mix entry).
  serviceId: z.string().min(1).optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  notes: z.string().max(500).optional(),
  // Optional: link this appointment to a package whose remaining session
  // count for this service should be decremented atomically with the
  // booking. Caller is expected to have confirmed via the FO prompt.
  consumeFromPackageId: z.string().optional(),
  // Optional: if the therapist isn't currently assigned to this patient,
  // create the ClientDoctorAssignment row inside the same transaction.
  addAssignment: z.boolean().optional(),
});

interface ServiceMixEntry {
  serviceId?: string;
  serviceName?: string;
  count: number;
  consumed?: number;
}

function parseMix(json: string | null | undefined): ServiceMixEntry[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (e): e is ServiceMixEntry => e && typeof e === "object" && typeof e.count === "number",
    );
  } catch {
    return [];
  }
}

const CANCELLATION_CATEGORIES = [
  "NO_SHOW",
  "PATIENT_CANCELLED",
  "THERAPIST_CANCELLED_SHIFT",
] as const;

const updateSchema = z.object({
  id: z.string().min(1),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  status: z
    .enum(["CONFIRMED", "RESCHEDULED", "CANCELLED", "COMPLETED", "NO_SHOW"])
    .optional(),
  cancelledBy: z.enum(["PATIENT", "THERAPIST", "CLINIC"]).optional(),
  cancelledReason: z.string().max(500).optional(),
  // Required tag when transitioning to CANCELLED. Server enforces below.
  cancellationCategory: z.enum(CANCELLATION_CATEGORIES).optional(),
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

// Non-blocking warning: does this patient already have an appointment within
// ±15 minutes of the proposed slot? (PRD §6 punchlist #9 — warn, don't block.)
async function patientAdjacencyWarning(
  clientId: string,
  start: Date,
  end: Date,
  excludeId?: string,
): Promise<string | undefined> {
  const w = ADJACENCY_WINDOW_MINUTES * 60_000;
  const near = await prisma.appointment.findFirst({
    where: {
      clientId,
      status: { in: ["CONFIRMED", "RESCHEDULED"] },
      startTime: { lt: new Date(end.getTime() + w) },
      endTime: { gt: new Date(start.getTime() - w) },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    include: { therapist: { select: { name: true } } },
  });
  if (!near) return undefined;
  return `Heads up: this patient already has an appointment near this time${
    near.therapist?.name ? ` with ${near.therapist.name}` : ""
  }.`;
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

  const timing = validateAppointmentTiming(start, end);
  if (timing.error) {
    return NextResponse.json({ error: timing.error, windowLabel: timing.windowLabel }, { status: 400 });
  }

  const therapist = await prisma.staff.findUnique({
    where: { id: f.therapistId },
    select: { isActive: true },
  });
  if (!therapist) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!therapist.isActive) return NextResponse.json({ error: "therapist_inactive" }, { status: 409 });

  const clash = await findClash(f.therapistId, start, end);
  if (clash) {
    return NextResponse.json({ error: "clash", ...clash }, { status: 409 });
  }

  const client = await prisma.client.findUnique({ where: { id: f.clientId } });
  if (!client) return NextResponse.json({ error: "client_not_found" }, { status: 404 });

  const warning = await patientAdjacencyWarning(f.clientId, start, end);

  // Atomic: book the appointment + (optionally) decrement the package
  // counters + (optionally) create the missing therapist assignment.
  // If the package isn't actually consumable (status flipped, exhausted,
  // service not in mix) we 409 instead of silently no-op'ing.
  type TxResult = {
    appointment: Awaited<ReturnType<typeof prisma.appointment.create>>;
    consumedPackage: { id: string; completedSessions: number } | null;
    addedAssignment: boolean;
  };
  let txResult: TxResult;
  try {
    txResult = await prisma.$transaction(async (tx): Promise<TxResult> => {
      let consumedPackage: { id: string; completedSessions: number } | null = null;

      if (f.consumeFromPackageId) {
        // FO-defers-service path: serviceId is optional in the booking body,
        // but package consumption needs it to find the right mix entry —
        // otherwise we'd silently double-count. Reject loudly.
        if (!f.serviceId) throw new Error("package_requires_service");
        const pkg = await tx.package.findUnique({
          where: { id: f.consumeFromPackageId },
          select: {
            id: true,
            clientId: true,
            status: true,
            totalSessions: true,
            completedSessions: true,
            validFrom: true,
            validUntil: true,
            serviceMix: true,
          },
        });
        if (!pkg || pkg.clientId !== f.clientId) throw new Error("package_not_found");
        if (pkg.status !== "ACTIVE") throw new Error("package_inactive");
        if (pkg.validUntil < start || pkg.validFrom > start) throw new Error("package_out_of_range");
        const mix = parseMix(pkg.serviceMix);
        const idx = mix.findIndex((e) => e.serviceId === f.serviceId);
        if (idx === -1) throw new Error("package_service_mismatch");
        const entry = mix[idx]!;
        const consumed = entry.consumed ?? 0;
        if (entry.count - consumed <= 0) throw new Error("package_exhausted_for_service");

        mix[idx] = { ...entry, consumed: consumed + 1 };
        const nextCompleted = pkg.completedSessions + 1;
        const nextStatus = nextCompleted >= pkg.totalSessions ? "COMPLETED" : pkg.status;

        await tx.package.update({
          where: { id: pkg.id },
          data: {
            serviceMix: JSON.stringify(mix),
            completedSessions: nextCompleted,
            status: nextStatus,
          },
        });
        consumedPackage = { id: pkg.id, completedSessions: nextCompleted };
      }

      let addedAssignment = false;
      if (f.addAssignment) {
        const existing = await tx.clientDoctorAssignment.findFirst({
          where: { clientId: f.clientId, staffId: f.therapistId, endedAt: null },
          select: { id: true },
        });
        if (!existing) {
          // Promote to primary only if no other active primary exists, so
          // we don't accidentally demote the patient's lead therapist.
          const anyPrimary = await tx.clientDoctorAssignment.findFirst({
            where: { clientId: f.clientId, endedAt: null, isPrimary: true },
            select: { id: true },
          });
          await tx.clientDoctorAssignment.create({
            data: {
              clientId: f.clientId,
              staffId: f.therapistId,
              isPrimary: !anyPrimary,
            },
          });
          addedAssignment = true;
        }
      }

      const appointment = await tx.appointment.create({
        data: {
          clientId: f.clientId,
          therapistId: f.therapistId,
          serviceId: f.serviceId ?? null,
          centreId: client.centreId,
          startTime: start,
          endTime: end,
          notes: f.notes ?? null,
          status: "CONFIRMED",
          packageId: f.consumeFromPackageId ?? null,
        },
      });
      return { appointment, consumedPackage, addedAssignment };
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "unknown";
    const mappable = new Set([
      "package_not_found",
      "package_inactive",
      "package_out_of_range",
      "package_requires_service",
      "package_service_mismatch",
      "package_exhausted_for_service",
    ]);
    if (mappable.has(code)) {
      return NextResponse.json({ error: code }, { status: 409 });
    }
    throw err;
  }
  const { appointment, consumedPackage, addedAssignment } = txResult;

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
    metadata: {
      clientId: f.clientId,
      therapistId: f.therapistId,
      serviceId: f.serviceId ?? null,
      ...(consumedPackage
        ? {
            packageId: consumedPackage.id,
            packageCompletedAfter: consumedPackage.completedSessions,
          }
        : {}),
      ...(addedAssignment ? { addedAssignment: true } : {}),
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({
    ok: true,
    appointment: serialise(appointment),
    warning,
    ...(consumedPackage ? { consumedPackage } : {}),
    ...(addedAssignment ? { addedAssignment: true } : {}),
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

  // Cancellation must be tagged — required so we can report on why slots
  // were lost (patient no-show vs therapist shift vs patient cancellation).
  // Skip the guard if the existing row is already cancelled (idempotent
  // PATCHes that just refresh notes shouldn't get blocked).
  if (
    f.status === "CANCELLED" &&
    existing.status !== "CANCELLED" &&
    !f.cancellationCategory
  ) {
    return NextResponse.json(
      { error: "cancellation_category_required" },
      { status: 400 },
    );
  }

  const newStart = f.startTime ? new Date(f.startTime) : existing.startTime;
  const newEnd = f.endTime ? new Date(f.endTime) : existing.endTime;
  let warning: string | undefined;
  // Timing rules only apply to reschedules (a pure status change — e.g.
  // cancelling a past appointment — must still be allowed).
  if (f.startTime || f.endTime) {
    const timing = validateAppointmentTiming(newStart, newEnd);
    if (timing.error) {
      return NextResponse.json({ error: timing.error, windowLabel: timing.windowLabel }, { status: 400 });
    }
    const therapist = await prisma.staff.findUnique({
      where: { id: existing.therapistId },
      select: { isActive: true },
    });
    if (therapist && !therapist.isActive) {
      return NextResponse.json({ error: "therapist_inactive" }, { status: 409 });
    }
    const clash = await findClash(existing.therapistId, newStart, newEnd, f.id);
    if (clash) {
      return NextResponse.json({ error: "clash", ...clash }, { status: 409 });
    }
    warning = await patientAdjacencyWarning(existing.clientId, newStart, newEnd, f.id);
  }

  const updated = await prisma.appointment.update({
    where: { id: f.id },
    data: {
      ...(f.startTime ? { startTime: newStart } : {}),
      ...(f.endTime ? { endTime: newEnd } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.cancelledBy ? { cancelledBy: f.cancelledBy, cancelledAt: new Date(), cancelledById: auth.user.id } : {}),
      ...(f.cancelledReason !== undefined ? { cancelledReason: f.cancelledReason } : {}),
      ...(f.cancellationCategory !== undefined
        ? { cancellationCategory: f.cancellationCategory }
        : {}),
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

  return NextResponse.json({ ok: true, appointment: serialise(updated), warning });
}

// Hard-delete an appointment booked by mistake. Soft-cancel (PATCH with
// status=CANCELLED) is the right path for genuine cancellations — this is
// strictly for "shouldn't have been booked at all". Gated to ≤24h after
// createdAt so we don't lose history of older operational mistakes.
const DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;
const DELETE_ALLOWED_ROLES = new Set(["OWNER", "ADMIN", "FRONT_OFFICE"]);

export async function DELETE(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  if (!DELETE_ALLOWED_ROLES.has(auth.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id_required" }, { status: 400 });
  }

  const existing = await prisma.appointment.findUnique({
    where: { id },
    select: { id: true, createdAt: true, clientId: true, therapistId: true, startTime: true },
  });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (Date.now() - existing.createdAt.getTime() > DELETE_WINDOW_MS) {
    return NextResponse.json(
      { error: "delete_window_expired" },
      { status: 409 },
    );
  }

  await prisma.appointment.delete({ where: { id } });

  const meta = requestMeta(req);
  await createAuditLog({
    action: "DELETE",
    entity: "Appointment",
    entityId: id,
    performedById: auth.user.id,
    metadata: {
      reason: "booked_by_mistake",
      clientId: existing.clientId,
      therapistId: existing.therapistId,
      startTime: existing.startTime.toISOString(),
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ ok: true });
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
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          clientCode: true,
          intakeStatus: true,
          flags: {
            where: { isActive: true },
            select: { type: true, label: true, color: true },
          },
        },
      },
      therapist: { select: { id: true, name: true, color: true } },
      service: { select: { id: true, name: true, basePrice: true, departmentId: true } },
    },
  });

  // Clash detection — sweep events per therapist, mark IDs whose [start,end)
  // overlaps another non-CANCELLED appointment for the same therapist.
  // Bounded by the window so the O(N log N) sort is comfortable.
  const clashedIds = computeClashes(appointments);

  // Pending RESCHEDULE change requests — surface a chip on the event so the
  // FO sees at-a-glance "patient/therapist wants to move this". New
  // change-requests live in `payloadJson` (structured); older ones in
  // `details` (legacy free-text JSON). Read both so the chip surfaces on
  // legacy AND new requests.
  const pendingReschedules = await prisma.changeRequest.findMany({
    where: { status: "PENDING", type: "RESCHEDULE" },
    select: { details: true, payloadJson: true },
  });
  const pendingApptIds = new Set<string>();
  for (const r of pendingReschedules) {
    try {
      if (r.payloadJson) {
        const parsed = JSON.parse(r.payloadJson) as { appointmentId?: string };
        if (parsed.appointmentId) {
          pendingApptIds.add(parsed.appointmentId);
          continue;
        }
      }
      const legacy = JSON.parse(r.details) as { appointmentId?: string };
      if (legacy.appointmentId) pendingApptIds.add(legacy.appointmentId);
    } catch {
      /* skip malformed */
    }
  }

  return NextResponse.json(
    appointments.map((a) => ({
      id: a.id,
      title: `${a.client.firstName} ${a.client.lastName} — ${a.service?.name ?? "Service TBD"}`,
      start: a.startTime.toISOString(),
      end: a.endTime.toISOString(),
      status: a.status,
      therapistId: a.therapist.id,
      therapistName: a.therapist.name,
      // Calendar tints events by therapist; null override → deterministic
      // palette colour derived from the therapist id (resolved client-side
      // via staffColor() so the same person always renders the same hue).
      therapistColor: staffColor(a.therapist.id, a.therapist.color),
      clientId: a.client.id,
      clientCode: a.client.clientCode,
      serviceId: a.service?.id ?? "",
      serviceName: a.service?.name ?? "",
      flags: a.client.flags ?? [],
      hasClash: clashedIds.has(a.id),
      pendingReschedule: pendingApptIds.has(a.id),
      intakePending: a.client.intakeStatus === "PENDING_INTAKE",
      // "Delete (booked by mistake)" is only allowed within 24h of creation.
      // Surface that here so the UI can hide the button outside the window
      // instead of hitting the server and getting a 409.
      canDelete:
        Date.now() - a.createdAt.getTime() <= 24 * 60 * 60 * 1000,
    })),
  );
}

function computeClashes(
  appointments: Array<{ id: string; startTime: Date; endTime: Date; therapistId: string; status: string }>,
): Set<string> {
  const clashed = new Set<string>();
  // Group by therapist, sort by start, sweep for overlaps. Skip cancelled
  // and no-show since those shouldn't flag healthy bookings as conflicting.
  const byTherapist = new Map<string, Array<{ id: string; startTime: Date; endTime: Date }>>();
  for (const a of appointments) {
    if (a.status === "CANCELLED" || a.status === "NO_SHOW") continue;
    if (!byTherapist.has(a.therapistId)) byTherapist.set(a.therapistId, []);
    byTherapist.get(a.therapistId)!.push({ id: a.id, startTime: a.startTime, endTime: a.endTime });
  }
  for (const list of byTherapist.values()) {
    list.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (list[j]!.startTime >= list[i]!.endTime) break;
        clashed.add(list[i]!.id);
        clashed.add(list[j]!.id);
      }
    }
  }
  return clashed;
}

interface PrismaAppointment {
  id: string;
  startTime: Date;
  endTime: Date;
  status: string;
  clientId: string;
  therapistId: string;
  serviceId: string | null;
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
