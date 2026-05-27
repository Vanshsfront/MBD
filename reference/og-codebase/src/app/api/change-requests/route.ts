// Change requests — clinician-raised (POST), FO/OWNER/ADMIN-reviewed (PATCH).
// PRD §3.1 + revamp Phase 3.
//
// **Approve auto-mutates.** This is the audit-2026-05-08 fix. The legacy
// PATCH only flipped `status` to APPROVED, which caused the user's exact
// complaint:
//   "clicking approve does nothing since nothing was staged"
// Now, when a RESCHEDULE is approved we PATCH the actual Appointment in the
// same transaction (with clash check); when a REASSIGN is approved we close
// the old ClientDoctorAssignment and create a new one with
// `replacedByAssignmentId` set. Each mutated entity gets its own AuditLog row
// so the trail shows both the CR review and the resulting state change.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, requestMeta } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit";

// ───────── Schemas ─────────

const reschedulePayloadSchema = z.object({
  appointmentId: z.string().min(1),
  fromStartIso: z.string().datetime(),
  fromEndIso: z.string().datetime(),
  toStartIso: z.string().datetime(),
  toEndIso: z.string().datetime(),
  reason: z.string().min(1).max(500),
});

const reassignPayloadSchema = z.object({
  clientId: z.string().min(1),
  fromAssignmentId: z.string().min(1),
  toStaffId: z.string().min(1),
  reason: z.string().min(1).max(500),
});

const otherPayloadSchema = z.object({
  freeText: z.string().min(1).max(1000),
});

const createSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("RESCHEDULE"), payload: reschedulePayloadSchema }),
  z.object({ type: z.literal("REASSIGN"), payload: reassignPayloadSchema }),
  z.object({ type: z.literal("OTHER"), payload: otherPayloadSchema }),
]);

const reviewSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["APPROVED", "REJECTED"]),
  response: z.string().max(500).optional(),
});

// ───────── POST: clinician raises a change request ─────────

export async function POST(req: Request) {
  const auth = await requirePermission("appointments:request_change");
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as unknown;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { type, payload } = parsed.data;

  // Cross-checks the schema can't enforce alone:
  // - RESCHEDULE: the appointment must belong to the requester (no raising on
  //   someone else's slot).
  // - REASSIGN: the assignment must belong to the requester and be active.
  if (type === "RESCHEDULE") {
    const appt = await prisma.appointment.findUnique({
      where: { id: payload.appointmentId },
      select: { therapistId: true, status: true },
    });
    if (!appt) return NextResponse.json({ error: "appointment_not_found" }, { status: 404 });
    if (appt.therapistId !== auth.user.id) {
      return NextResponse.json({ error: "appointment_not_yours" }, { status: 403 });
    }
    if (appt.status === "CANCELLED" || appt.status === "COMPLETED") {
      return NextResponse.json({ error: "appointment_locked" }, { status: 409 });
    }
  } else if (type === "REASSIGN") {
    const a = await prisma.clientDoctorAssignment.findUnique({
      where: { id: payload.fromAssignmentId },
      select: { staffId: true, endedAt: true, clientId: true },
    });
    if (!a) return NextResponse.json({ error: "assignment_not_found" }, { status: 404 });
    if (a.staffId !== auth.user.id) {
      return NextResponse.json({ error: "assignment_not_yours" }, { status: 403 });
    }
    if (a.endedAt) {
      return NextResponse.json({ error: "assignment_already_ended" }, { status: 409 });
    }
    if (a.clientId !== payload.clientId) {
      return NextResponse.json({ error: "client_mismatch" }, { status: 400 });
    }
  }

  const cr = await prisma.changeRequest.create({
    data: {
      type,
      // `details` is the legacy text-blob column kept around so older readers
      // don't crash. New consumers should read `payloadJson`.
      details: JSON.stringify({ legacy: false }),
      payloadJson: JSON.stringify(payload),
      requesterId: auth.user.id,
      status: "PENDING",
    },
  });

  // Notify all reviewers (FO + OWNER + ADMIN).
  const reviewers = await prisma.staff.findMany({
    where: { isActive: true, role: { in: ["FRONT_OFFICE", "OWNER", "ADMIN"] } },
    select: { id: true },
  });
  await Promise.all(
    reviewers.map((r) =>
      prisma.notification.create({
        data: {
          type: "CHANGE_REQUEST",
          title: "New change request",
          message: `${auth.user.name ?? "A clinician"} raised a ${type} request.`,
          targetUserId: r.id,
          metadata: JSON.stringify({ changeRequestId: cr.id }),
        },
      }),
    ),
  );

  const meta = requestMeta(req);
  await createAuditLog({
    action: "CREATE",
    entity: "ChangeRequest",
    entityId: cr.id,
    performedById: auth.user.id,
    metadata: { type, payload },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ ok: true, id: cr.id });
}

// ───────── PATCH: FO reviews → auto-mutates on Approve ─────────

export async function PATCH(req: Request) {
  const auth = await requirePermission("appointments:review_change_request");
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as unknown;
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;

  const existing = await prisma.changeRequest.findUnique({ where: { id: f.id } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (existing.status !== "PENDING") {
    return NextResponse.json({ error: "already_reviewed" }, { status: 409 });
  }

  const meta = requestMeta(req);

  // Reject path — no state mutation; just close the CR + notify the requester.
  if (f.status === "REJECTED") {
    await prisma.changeRequest.update({
      where: { id: f.id },
      data: {
        status: "REJECTED",
        response: f.response ?? null,
        reviewedById: auth.user.id,
        reviewedAt: new Date(),
      },
    });
    await prisma.notification.create({
      data: {
        type: "CHANGE_REQUEST",
        title: "Change request rejected",
        message:
          f.response ??
          `Your request was rejected by ${auth.user.name ?? "the front office"}.`,
        targetUserId: existing.requesterId,
        metadata: JSON.stringify({ changeRequestId: f.id }),
      },
    });
    await createAuditLog({
      action: "UPDATE",
      entity: "ChangeRequest",
      entityId: f.id,
      performedById: auth.user.id,
      changes: { status: { old: "PENDING", new: "REJECTED" } },
      metadata: { response: f.response },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return NextResponse.json({ ok: true });
  }

  // Approve path — type-discriminated auto-mutate.
  const payload = parsePayload(existing.payloadJson);

  if (existing.type === "RESCHEDULE") {
    const r = reschedulePayloadSchema.safeParse(payload);
    if (!r.success) {
      return NextResponse.json({ error: "payload_invalid" }, { status: 400 });
    }
    return approveReschedule({
      crId: f.id,
      response: f.response ?? null,
      reviewerId: auth.user.id,
      requesterId: existing.requesterId,
      payload: r.data,
      meta,
    });
  }
  if (existing.type === "REASSIGN") {
    const r = reassignPayloadSchema.safeParse(payload);
    if (!r.success) {
      return NextResponse.json({ error: "payload_invalid" }, { status: 400 });
    }
    return approveReassign({
      crId: f.id,
      response: f.response ?? null,
      reviewerId: auth.user.id,
      requesterId: existing.requesterId,
      payload: r.data,
      meta,
    });
  }
  // OTHER — no auto-mutation; just mark approved + notify.
  return approveOther({
    crId: f.id,
    response: f.response ?? null,
    reviewerId: auth.user.id,
    requesterId: existing.requesterId,
    meta,
  });
}

// ───────── Approve handlers ─────────

interface ApproveCommon {
  crId: string;
  response: string | null;
  reviewerId: string;
  requesterId: string;
  meta: ReturnType<typeof requestMeta>;
}

async function approveReschedule(
  args: ApproveCommon & { payload: z.infer<typeof reschedulePayloadSchema> },
): Promise<NextResponse> {
  const { crId, response, reviewerId, requesterId, payload, meta } = args;
  const newStart = new Date(payload.toStartIso);
  const newEnd = new Date(payload.toEndIso);
  if (!(newEnd > newStart)) {
    return NextResponse.json({ error: "end_before_start" }, { status: 400 });
  }

  const existing = await prisma.appointment.findUnique({
    where: { id: payload.appointmentId },
    select: {
      id: true,
      therapistId: true,
      startTime: true,
      endTime: true,
      status: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "appointment_gone" }, { status: 410 });
  }
  if (existing.status === "CANCELLED" || existing.status === "COMPLETED") {
    return NextResponse.json({ error: "appointment_locked" }, { status: 409 });
  }

  // Clash check — same therapist, overlapping window, different appointment.
  const clash = await prisma.appointment.findFirst({
    where: {
      therapistId: existing.therapistId,
      status: { in: ["CONFIRMED", "RESCHEDULED"] },
      startTime: { lt: newEnd },
      endTime: { gt: newStart },
      NOT: { id: existing.id },
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      therapist: { select: { name: true } },
    },
  });
  if (clash) {
    return NextResponse.json(
      {
        error: "clash",
        conflictingStaffName: clash.therapist?.name,
        conflictingStart: clash.startTime.toISOString(),
        conflictingEnd: clash.endTime.toISOString(),
      },
      { status: 409 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: existing.id },
      data: { startTime: newStart, endTime: newEnd, status: "RESCHEDULED" },
    });
    await tx.changeRequest.update({
      where: { id: crId },
      data: {
        status: "APPROVED",
        response,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        appliedAppointmentId: existing.id,
      },
    });
  });

  // Notify requester.
  await prisma.notification.create({
    data: {
      type: "CHANGE_REQUEST",
      title: "Reschedule approved",
      message:
        response ??
        `Your reschedule was approved. New time: ${newStart.toLocaleString("en-IN")}.`,
      targetUserId: requesterId,
      metadata: JSON.stringify({ changeRequestId: crId, appointmentId: existing.id }),
    },
  });

  // Audit both sides — the CR review and the underlying state change.
  await createAuditLog({
    action: "UPDATE",
    entity: "ChangeRequest",
    entityId: crId,
    performedById: reviewerId,
    changes: { status: { old: "PENDING", new: "APPROVED" } },
    metadata: { response, appliedAppointmentId: existing.id },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  await createAuditLog({
    action: "UPDATE",
    entity: "Appointment",
    entityId: existing.id,
    performedById: reviewerId,
    changes: {
      startTime: { old: existing.startTime.toISOString(), new: newStart.toISOString() },
      endTime: { old: existing.endTime.toISOString(), new: newEnd.toISOString() },
      status: { old: existing.status, new: "RESCHEDULED" },
    },
    metadata: { source: "change-request-approve", changeRequestId: crId },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ ok: true, applied: { appointmentId: existing.id } });
}

async function approveReassign(
  args: ApproveCommon & { payload: z.infer<typeof reassignPayloadSchema> },
): Promise<NextResponse> {
  const { crId, response, reviewerId, requesterId, payload, meta } = args;

  const oldAssignment = await prisma.clientDoctorAssignment.findUnique({
    where: { id: payload.fromAssignmentId },
    select: {
      id: true,
      clientId: true,
      staffId: true,
      isPrimary: true,
      endedAt: true,
      serviceId: true,
      serviceName: true,
    },
  });
  if (!oldAssignment) {
    return NextResponse.json({ error: "assignment_gone" }, { status: 410 });
  }
  if (oldAssignment.endedAt) {
    return NextResponse.json({ error: "assignment_already_ended" }, { status: 409 });
  }
  if (oldAssignment.clientId !== payload.clientId) {
    return NextResponse.json({ error: "client_mismatch" }, { status: 400 });
  }

  // Verify the new staff exists and is active.
  const newStaff = await prisma.staff.findUnique({
    where: { id: payload.toStaffId },
    select: { id: true, isActive: true, departmentId: true },
  });
  if (!newStaff || !newStaff.isActive) {
    return NextResponse.json({ error: "new_staff_invalid" }, { status: 400 });
  }

  // Refuse if there's already an active assignment to the same staff for the
  // same client (avoid no-op churn or a "duplicate assignment" condition).
  const dup = await prisma.clientDoctorAssignment.findFirst({
    where: {
      clientId: oldAssignment.clientId,
      staffId: payload.toStaffId,
      endedAt: null,
    },
    select: { id: true },
  });
  if (dup) {
    return NextResponse.json({ error: "already_assigned" }, { status: 409 });
  }

  const created = await prisma.$transaction(async (tx) => {
    const newRow = await tx.clientDoctorAssignment.create({
      data: {
        clientId: oldAssignment.clientId,
        staffId: payload.toStaffId,
        // Preserve primary flag + service binding from the prior row so the
        // care plan continues without a manual re-flag from FO.
        isPrimary: oldAssignment.isPrimary,
        serviceId: oldAssignment.serviceId,
        serviceName: oldAssignment.serviceName,
        comment: `Reassigned from ${oldAssignment.staffId} via CR ${crId}`,
      },
    });
    await tx.clientDoctorAssignment.update({
      where: { id: oldAssignment.id },
      data: {
        endedAt: new Date(),
        endedReason: `REASSIGNED_VIA_CHANGE_REQUEST:${crId}`,
        replacedByAssignmentId: newRow.id,
      },
    });
    await tx.changeRequest.update({
      where: { id: crId },
      data: {
        status: "APPROVED",
        response,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        appliedAssignmentId: newRow.id,
      },
    });
    return newRow;
  });

  // Notify requester + new therapist.
  await prisma.notification.createMany({
    data: [
      {
        type: "CHANGE_REQUEST",
        title: "Reassignment approved",
        message:
          response ??
          `Your reassignment was approved by ${reviewerId === requesterId ? "the front office" : "FO"}.`,
        targetUserId: requesterId,
        metadata: JSON.stringify({ changeRequestId: crId, newAssignmentId: created.id }),
      },
      {
        type: "NEW_PATIENT",
        title: "New patient assigned to you",
        message: `Reassigned from a colleague via change request.`,
        targetUserId: payload.toStaffId,
        metadata: JSON.stringify({
          changeRequestId: crId,
          assignmentId: created.id,
          clientId: oldAssignment.clientId,
        }),
      },
    ],
  });

  await createAuditLog({
    action: "UPDATE",
    entity: "ChangeRequest",
    entityId: crId,
    performedById: reviewerId,
    changes: { status: { old: "PENDING", new: "APPROVED" } },
    metadata: { response, appliedAssignmentId: created.id },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  await createAuditLog({
    action: "UPDATE",
    entity: "ClientDoctorAssignment",
    entityId: oldAssignment.id,
    performedById: reviewerId,
    changes: {
      endedAt: { old: null, new: new Date().toISOString() },
      replacedByAssignmentId: { old: null, new: created.id },
    },
    metadata: { source: "change-request-approve", changeRequestId: crId },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  await createAuditLog({
    action: "CREATE",
    entity: "ClientDoctorAssignment",
    entityId: created.id,
    performedById: reviewerId,
    metadata: {
      source: "change-request-approve",
      changeRequestId: crId,
      clientId: oldAssignment.clientId,
      replacesAssignmentId: oldAssignment.id,
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({
    ok: true,
    applied: { newAssignmentId: created.id, oldAssignmentId: oldAssignment.id },
  });
}

async function approveOther(args: ApproveCommon): Promise<NextResponse> {
  const { crId, response, reviewerId, requesterId, meta } = args;
  await prisma.changeRequest.update({
    where: { id: crId },
    data: {
      status: "APPROVED",
      response,
      reviewedById: reviewerId,
      reviewedAt: new Date(),
    },
  });
  await prisma.notification.create({
    data: {
      type: "CHANGE_REQUEST",
      title: "Change request approved",
      message: response ?? "Your request was approved.",
      targetUserId: requesterId,
      metadata: JSON.stringify({ changeRequestId: crId }),
    },
  });
  await createAuditLog({
    action: "UPDATE",
    entity: "ChangeRequest",
    entityId: crId,
    performedById: reviewerId,
    changes: { status: { old: "PENDING", new: "APPROVED" } },
    metadata: { response, type: "OTHER" },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  return NextResponse.json({ ok: true, applied: { type: "OTHER" } });
}

// ───────── helpers ─────────

function parsePayload(json: string | null): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
