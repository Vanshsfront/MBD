import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";

// POST — assigned therapist chooses the service for their ClientDoctorAssignment row
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id: clientId } = await params;
    const body = await req.json();
    const { serviceId, staffId } = body;

    if (!serviceId) {
      return NextResponse.json({ error: "serviceId is required" }, { status: 400 });
    }

    const user = session.user as { id: string; role: string };

    // The staffId on the assignment being edited: default to the caller unless an OWNER/ADMIN/FO passes one explicitly
    const targetStaffId =
      staffId && ["OWNER", "ADMIN", "FRONT_OFFICE", "DEV"].includes(user.role) ? staffId : user.id;

    const existing = await prisma.clientDoctorAssignment.findUnique({
      where: { clientId_staffId: { clientId, staffId: targetStaffId } },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "You are not assigned to this patient" },
        { status: 403 }
      );
    }

    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }

    const updated = await prisma.clientDoctorAssignment.update({
      where: { clientId_staffId: { clientId, staffId: targetStaffId } },
      data: { serviceId, serviceName: service.name },
    });

    await createAuditLog({
      action: "UPDATE",
      entity: "ClientDoctorAssignment",
      entityId: updated.id,
      performedById: user.id,
      changes: {
        serviceId: { old: existing.serviceId, new: serviceId },
        serviceName: { old: existing.serviceName, new: service.name },
      },
      metadata: { clientId, staffId: targetStaffId },
    });

    return NextResponse.json({ success: true, assignment: updated });
  } catch (error) {
    console.error("[POST /api/clients/:id/assign-service]", error);
    return NextResponse.json({ error: "Failed to assign service" }, { status: 500 });
  }
}
