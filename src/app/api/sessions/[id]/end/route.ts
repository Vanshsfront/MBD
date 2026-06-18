// End a live session — therapist clicks "End session" on the clinical record.
// Computes duration from startedAt → now, flips status to COMPLETED, and
// atomically decrements the linked Package's session counters if any.
//
// Idempotent against double-ends (returns 409 if already COMPLETED).

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requestMeta, assertCentreScope } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit";

const endSchema = z.object({
  // Optional: tie the just-ended session to the consultation row the
  // therapist was filling. One Session → at most one Consultation.
  consultationId: z.string().min(1).optional(),
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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as unknown;
  const parsed = endSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;

  const existing = await prisma.session.findUnique({
    where: { id },
    select: {
      id: true,
      therapistId: true,
      startedAt: true,
      status: true,
      packageId: true,
      serviceId: true,
      clientId: true,
      appointmentId: true,
    },
  });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Only the session's own therapist can end it (OWNER/ADMIN can force-end
  // someone else's stuck session — useful when a therapist forgets to end).
  const isOwner = existing.therapistId === auth.user.id;
  const isManagement = auth.user.role === "OWNER" || auth.user.role === "ADMIN";
  if (!isOwner && !isManagement) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Centre-scope guard (audit parity): scope by the patient's centre.
  const scopeClient = await prisma.client.findUnique({
    where: { id: existing.clientId },
    select: { centreId: true },
  });
  const scope = await assertCentreScope(auth.user, scopeClient);
  if (scope) return scope;

  if (existing.status !== "IN_PROGRESS") {
    return NextResponse.json(
      { error: "session_not_in_progress", currentStatus: existing.status },
      { status: 409 },
    );
  }

  const now = new Date();
  const durationMin = existing.startedAt
    ? Math.max(0, Math.round((now.getTime() - existing.startedAt.getTime()) / 60_000))
    : 0;

  // Atomic: end the session + decrement the linked package + flip package
  // to COMPLETED at cap. Package decrement only fires once (we only ever
  // end an IN_PROGRESS session); the IN_PROGRESS guard above prevents
  // double-consumption.
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.session.update({
      where: { id },
      data: {
        status: "COMPLETED",
        endedAt: now,
        recordedDurationMin: durationMin,
        ...(f.consultationId ? { consultationId: f.consultationId } : {}),
      },
      select: { id: true, endedAt: true, recordedDurationMin: true, sessionFormType: true },
    });

    // Propagate to the linked Appointment so the therapist's "Today's day"
    // strip + the calendar both stop tagging it as Next/upcoming. Idempotent —
    // re-ending an already-COMPLETED appointment is a no-op semantically.
    let appointmentCompleted = false;
    if (existing.appointmentId) {
      const appt = await tx.appointment.update({
        where: { id: existing.appointmentId },
        data: { status: "COMPLETED" },
        select: { status: true },
      });
      appointmentCompleted = appt.status === "COMPLETED";
    }

    let packageDecremented = false;
    let serviceMixMatched = false;
    if (existing.packageId) {
      const pkg = await tx.package.findUnique({
        where: { id: existing.packageId },
        select: { totalSessions: true, completedSessions: true, serviceMix: true, status: true },
      });
      if (pkg && pkg.status === "ACTIVE") {
        const newCompleted = pkg.completedSessions + 1;
        // Update the matching per-service consumed counter in serviceMix.
        // Walk-in case: serviceId may be null (FO deferred service at booking).
        // In that case Package.completedSessions still bumps (so the total
        // doesn't drift), but no per-service counter changes — the package
        // detail UI will show "1 session of unspecified service consumed"
        // via the metadata flag and the audit log.
        const mix = parseMix(pkg.serviceMix);
        if (existing.serviceId) {
          const entry = mix.find((m) => m.serviceId === existing.serviceId);
          if (entry) {
            entry.consumed = (entry.consumed ?? 0) + 1;
            serviceMixMatched = true;
          }
        }
        await tx.package.update({
          where: { id: existing.packageId },
          data: {
            completedSessions: newCompleted,
            serviceMix: JSON.stringify(mix),
            status: newCompleted >= pkg.totalSessions ? "COMPLETED" : "ACTIVE",
          },
        });
        packageDecremented = true;
      }
    }

    return { updated, packageDecremented, serviceMixMatched, appointmentCompleted };
  });

  const meta = requestMeta(req);
  await createAuditLog({
    action: "UPDATE",
    entity: "Session",
    entityId: id,
    performedById: auth.user.id,
    metadata: {
      kind: "end_session",
      durationMin,
      packageDecremented: result.packageDecremented,
      packageId: existing.packageId ?? null,
      consultationId: f.consultationId ?? null,
      appointmentId: existing.appointmentId ?? null,
      appointmentCompleted: result.appointmentCompleted,
      // Flag for ops: the package counter was bumped but per-service consumed
      // wasn't (because session.serviceId was null — walk-in case). The
      // total still adds up; the per-service mix display will be slightly off.
      serviceMixUnmatched:
        result.packageDecremented && !result.serviceMixMatched
          ? { serviceId: existing.serviceId, reason: "session_service_null" }
          : undefined,
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({
    session: result.updated,
    durationMin,
    packageDecremented: result.packageDecremented,
  });
}
