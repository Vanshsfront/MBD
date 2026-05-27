import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { createAuditLog, computeChanges } from "@/lib/audit";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await auth();
    const user = session?.user as { id?: string; role?: string } | undefined;
    if (!hasPermission(user?.role || "", "admin:services")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await prisma.service.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string") data.name = body.name.trim();
    if (typeof body.basePrice === "number") data.basePrice = body.basePrice;
    if (typeof body.gstRate === "number") data.gstRate = body.gstRate;
    if (typeof body.hsnSacCode === "string" || body.hsnSacCode === null) data.hsnSacCode = body.hsnSacCode;
    if (typeof body.participantCount === "number") data.participantCount = body.participantCount;
    if (typeof body.departmentId === "string") data.departmentId = body.departmentId;
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;

    const service = await prisma.service.update({ where: { id }, data, include: { department: true, centre: true } });

    const changes = computeChanges(existing as Record<string, unknown>, data);
    await createAuditLog({
      action: "UPDATE",
      entity: "Service",
      entityId: id,
      performedById: user?.id,
      changes,
      metadata: { name: existing.name },
    });

    return NextResponse.json(service);
  } catch (error) {
    console.error("[PUT /api/services/:id]", error);
    return NextResponse.json({ error: "Failed to update service" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await auth();
    const user = session?.user as { id?: string; role?: string } | undefined;
    if (!hasPermission(user?.role || "", "admin:services")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await prisma.service.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Soft-delete if the service has any usage; hard-delete otherwise.
    const [consultations, sessions, appts, histories, inv] = await Promise.all([
      prisma.consultation.count({ where: { serviceId: id } }),
      prisma.session.count({ where: { serviceId: id } }),
      prisma.appointment.count({ where: { serviceId: id } }),
      prisma.medicalHistory.count({ where: { serviceId: id } }),
      prisma.inventoryItem.count({ where: { serviceId: id } }),
    ]);
    const inUse = consultations + sessions + appts + histories + inv > 0;

    if (inUse) {
      await prisma.service.update({ where: { id }, data: { isActive: false } });
      await createAuditLog({
        action: "UPDATE",
        entity: "Service",
        entityId: id,
        performedById: user?.id,
        metadata: { name: existing.name, softDelete: true, reason: "in_use" },
      });
      return NextResponse.json({ ok: true, softDelete: true });
    }

    await prisma.service.delete({ where: { id } });
    await createAuditLog({
      action: "DELETE",
      entity: "Service",
      entityId: id,
      performedById: user?.id,
      metadata: { name: existing.name },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/services/:id]", error);
    return NextResponse.json({ error: "Failed to delete service" }, { status: 500 });
  }
}
