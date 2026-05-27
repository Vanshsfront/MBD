import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog, computeChanges } from "@/lib/audit";
import { canEditClinicalRecord } from "@/lib/clinical-access";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const existingSession = await prisma.session.findUnique({ where: { id } });
    if (!existingSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Access & backdate check
    const authSession = await auth();
    const userRole = (authSession?.user as { role?: string })?.role || "";
    const userId = (authSession?.user as { id?: string })?.id || body.performedById || "";
    const gate = await canEditClinicalRecord({
      userId,
      userRole,
      clientId: existingSession.clientId,
      recordStatus: existingSession.status,
      recordUpdatedAt: existingSession.updatedAt,
    });
    if (!gate.allowed) {
      return NextResponse.json({ error: gate.reason }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};

    if (body.status !== undefined) updateData.status = body.status;
    if (body.treatmentNotes !== undefined) updateData.treatmentNotes = body.treatmentNotes;
    if (body.progressUpdates !== undefined) updateData.progressUpdates = body.progressUpdates;
    if (body.sessionDate !== undefined) updateData.sessionDate = new Date(body.sessionDate);
    if (body.therapistId !== undefined) updateData.therapistId = body.therapistId;
    if (body.serviceId !== undefined) updateData.serviceId = body.serviceId;
    if (body.allotments !== undefined) updateData.allotments = body.allotments ? JSON.stringify(body.allotments) : null;

    const session = await prisma.session.update({
      where: { id },
      data: updateData,
      include: { client: true, therapist: true, service: true },
    });

    // Update package completedSessions if status changed to COMPLETED
    if (body.status === "COMPLETED" && existingSession.status !== "COMPLETED" && existingSession.packageId) {
      await prisma.package.update({
        where: { id: existingSession.packageId },
        data: { completedSessions: { increment: 1 } },
      });

      // Check if package is now fully completed
      const pkg = await prisma.package.findUnique({ where: { id: existingSession.packageId } });
      if (pkg && pkg.completedSessions >= pkg.totalSessions) {
        await prisma.package.update({
          where: { id: existingSession.packageId },
          data: { status: "COMPLETED" },
        });
      }

      // Notify front office if remaining sessions <= 2
      if (pkg) {
        const remaining = pkg.totalSessions - pkg.completedSessions;
        if (remaining <= 2) {
          const foStaff = await prisma.staff.findMany({
            where: { role: "FRONT_OFFICE", isActive: true },
            select: { id: true },
          });
          if (foStaff.length > 0) {
            const clientName = `${session.client.firstName} ${session.client.lastName}`;
            await prisma.notification.createMany({
              data: foStaff.map(s => ({
                targetUserId: s.id,
                type: "SESSION_REMAINING",
                title: `Low sessions remaining for ${clientName}`,
                message: remaining === 0
                  ? `${clientName} has used all ${pkg.totalSessions} sessions in their package. A new package or renewal may be needed.`
                  : `${clientName} has only ${remaining} session${remaining === 1 ? "" : "s"} remaining out of ${pkg.totalSessions}. Consider discussing renewal.`,
                priority: remaining === 0 ? "URGENT" : "HIGH",
                clientId: session.clientId,
              })),
            });
          }
        }
      }
    }

    // Reverse completedSessions if status changed FROM COMPLETED
    if (existingSession.status === "COMPLETED" && body.status && body.status !== "COMPLETED" && existingSession.packageId) {
      await prisma.package.update({
        where: { id: existingSession.packageId },
        data: { completedSessions: { decrement: 1 } },
      });
    }

    // Audit trail — auto-diff all fields
    const changes = computeChanges(existingSession as Record<string, unknown>, body);
    await createAuditLog({
      action: "UPDATE",
      entity: "Session",
      entityId: id,
      performedById: body.performedById,
      changes,
      metadata: { clientId: existingSession.clientId, packageId: existingSession.packageId },
    });

    return NextResponse.json(session);
  } catch (error) {
    console.error("[PUT /api/sessions/:id]", error);
    return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
  }
}
