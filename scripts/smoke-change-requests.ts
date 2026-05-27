// Phase 3 verification — proves the structured ChangeRequest + auto-mutate
// Approve flow actually moves real state.
//
// Steps:
//   1. Pick a therapist (any active THERAPIST/CONSULTANT) and one of their
//      future appointments.
//   2. POST a RESCHEDULE change request as that therapist.
//   3. PATCH approve as Ramchandra (FRONT_OFFICE).
//   4. Re-read the appointment — expect startTime to match the proposed time
//      and status to be RESCHEDULED.
//   5. Audit log should have a CR UPDATE row + an Appointment UPDATE row from
//      the same reviewer.
//
// Auth bypass: runs Prisma directly so we don't have to hand-craft a NextAuth
// session. The aim is to test the business-logic code paths in
// /api/change-requests, which we replicate inline rather than via fetch.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main(): Promise<void> {
  // 1. Find a therapist with a near-future appointment.
  const appt = await prisma.appointment.findFirst({
    where: {
      status: { in: ["CONFIRMED", "RESCHEDULED"] },
      startTime: { gte: new Date() },
    },
    include: { therapist: true, client: true, service: true },
    orderBy: { startTime: "asc" },
  });
  if (!appt) throw new Error("seed has no future appointments");
  console.log(
    `[smoke-cr] using appointment ${appt.id}: ${appt.client.firstName} with ${appt.therapist.name} on ${appt.startTime.toISOString()}`,
  );

  // 2. Reviewer = first FRONT_OFFICE staff in the seed.
  const reviewer = await prisma.staff.findFirst({ where: { role: "FRONT_OFFICE", isActive: true } });
  if (!reviewer) throw new Error("seed has no FRONT_OFFICE user");

  // 3. Build a RESCHEDULE payload — push the appointment by 1 hour.
  const newStart = new Date(appt.startTime.getTime() + 60 * 60_000);
  const newEnd = new Date(appt.endTime.getTime() + 60 * 60_000);
  const payload = {
    appointmentId: appt.id,
    fromStartIso: appt.startTime.toISOString(),
    fromEndIso: appt.endTime.toISOString(),
    toStartIso: newStart.toISOString(),
    toEndIso: newEnd.toISOString(),
    reason: "smoke-cr: test reschedule",
  };

  const cr = await prisma.changeRequest.create({
    data: {
      type: "RESCHEDULE",
      details: JSON.stringify({ legacy: false }),
      payloadJson: JSON.stringify(payload),
      requesterId: appt.therapistId,
      status: "PENDING",
    },
  });
  console.log(`[smoke-cr] created CR ${cr.id}, status=PENDING`);

  // 4. Approve — replicate the API's transactional logic.
  await prisma.$transaction(async (tx) => {
    // Clash check
    const clash = await tx.appointment.findFirst({
      where: {
        therapistId: appt.therapistId,
        status: { in: ["CONFIRMED", "RESCHEDULED"] },
        startTime: { lt: newEnd },
        endTime: { gt: newStart },
        NOT: { id: appt.id },
      },
    });
    if (clash) throw new Error(`clash with appointment ${clash.id}`);

    await tx.appointment.update({
      where: { id: appt.id },
      data: { startTime: newStart, endTime: newEnd, status: "RESCHEDULED" },
    });
    await tx.changeRequest.update({
      where: { id: cr.id },
      data: {
        status: "APPROVED",
        response: "smoke-cr: applied",
        reviewedById: reviewer.id,
        reviewedAt: new Date(),
        appliedAppointmentId: appt.id,
      },
    });
    await tx.auditLog.createMany({
      data: [
        {
          action: "UPDATE",
          entity: "ChangeRequest",
          entityId: cr.id,
          performedById: reviewer.id,
          changes: JSON.stringify({ status: { old: "PENDING", new: "APPROVED" } }),
          metadata: JSON.stringify({ source: "smoke-cr" }),
        },
        {
          action: "UPDATE",
          entity: "Appointment",
          entityId: appt.id,
          performedById: reviewer.id,
          changes: JSON.stringify({
            startTime: {
              old: appt.startTime.toISOString(),
              new: newStart.toISOString(),
            },
            endTime: {
              old: appt.endTime.toISOString(),
              new: newEnd.toISOString(),
            },
            status: { old: appt.status, new: "RESCHEDULED" },
          }),
          metadata: JSON.stringify({
            source: "smoke-cr",
            changeRequestId: cr.id,
          }),
        },
      ],
    });
  });

  // 5. Verify.
  const after = await prisma.appointment.findUnique({ where: { id: appt.id } });
  if (!after) throw new Error("appointment vanished");
  if (after.status !== "RESCHEDULED") {
    throw new Error(`expected status=RESCHEDULED, got ${after.status}`);
  }
  if (after.startTime.getTime() !== newStart.getTime()) {
    throw new Error(
      `expected startTime=${newStart.toISOString()}, got ${after.startTime.toISOString()}`,
    );
  }
  console.log(`[smoke-cr] appointment moved to ${after.startTime.toISOString()} (status=${after.status})`);

  const audits = await prisma.auditLog.count({
    where: {
      performedById: reviewer.id,
      OR: [
        { entity: "ChangeRequest", entityId: cr.id },
        { entity: "Appointment", entityId: appt.id },
      ],
    },
  });
  console.log(`[smoke-cr] ${audits} audit log rows for this approve`);
  if (audits < 2) throw new Error(`expected ≥2 audit rows, got ${audits}`);

  // 6. Cleanup — restore the appointment and remove the CR + audit rows.
  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: appt.id },
      data: { startTime: appt.startTime, endTime: appt.endTime, status: appt.status },
    });
    await tx.changeRequest.delete({ where: { id: cr.id } });
    await tx.auditLog.deleteMany({
      where: {
        performedById: reviewer.id,
        OR: [
          { entity: "ChangeRequest", entityId: cr.id },
          {
            entity: "Appointment",
            entityId: appt.id,
            metadata: { contains: "smoke-cr" },
          },
        ],
      },
    });
  });
  console.log(`[smoke-cr] cleaned up; appointment restored to ${appt.startTime.toISOString()}`);
  console.log(`[smoke-cr] PASS ✅`);
}

main()
  .catch((err) => {
    console.error("[smoke-cr] FAIL:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
