import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

// POST /api/clients/[id]/handover
// Body: { fromStaffId, toStaffId, serviceId?, reason?, performedById }
// Ends the outgoing therapist's assignment, creates a new one for the incoming
// therapist, and locks any prior consultations authored by the outgoing therapist
// for this client so they become read-only history.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await params;
    const body = await req.json();
    const { fromStaffId, toStaffId, serviceId, reason, performedById } = body as {
      fromStaffId: string; toStaffId: string; serviceId?: string; reason?: string; performedById?: string;
    };

    if (!fromStaffId || !toStaffId) {
      return NextResponse.json({ error: "fromStaffId and toStaffId are required" }, { status: 400 });
    }
    if (fromStaffId === toStaffId) {
      return NextResponse.json({ error: "Cannot hand over to the same therapist" }, { status: 400 });
    }

    const existing = await prisma.clientDoctorAssignment.findUnique({
      where: { clientId_staffId: { clientId, staffId: fromStaffId } },
    });
    if (!existing || existing.endedAt) {
      return NextResponse.json({ error: "Outgoing assignment not found or already ended" }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create or revive the new assignment
      const incoming = await tx.clientDoctorAssignment.upsert({
        where: { clientId_staffId: { clientId, staffId: toStaffId } },
        update: { endedAt: null, endedReason: null, isPrimary: existing.isPrimary, comment: serviceId || existing.comment },
        create: { clientId, staffId: toStaffId, isPrimary: existing.isPrimary, comment: serviceId || null },
      });

      // 2. End the outgoing assignment, point it at the replacement
      await tx.clientDoctorAssignment.update({
        where: { id: existing.id },
        data: {
          endedAt: new Date(),
          endedReason: reason || null,
          replacedByAssignmentId: incoming.id,
          isPrimary: false,
        },
      });

      // 3. Lock all prior consultations from the outgoing therapist for this client
      await tx.consultation.updateMany({
        where: { clientId, consultantId: fromStaffId, isLocked: false },
        data: { isLocked: true, lockedAt: new Date() },
      });

      // 4. If outgoing was primary, promote incoming as preferredTherapist
      if (existing.isPrimary) {
        await tx.client.update({
          where: { id: clientId },
          data: { preferredTherapistId: toStaffId },
        });
      }

      return incoming;
    });

    await createAuditLog({
      action: "UPDATE",
      entity: "ClientDoctorAssignment",
      entityId: existing.id,
      performedById,
      changes: { staffId: { old: fromStaffId, new: toStaffId } },
      metadata: { clientId, reason: reason || null, replacementAssignmentId: result.id },
    });

    return NextResponse.json({ success: true, assignment: result });
  } catch (error) {
    console.error("[POST /api/clients/[id]/handover]", error);
    return NextResponse.json({ error: "Failed to hand over" }, { status: 500 });
  }
}
