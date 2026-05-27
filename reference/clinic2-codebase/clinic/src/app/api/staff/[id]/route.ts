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
    if (!hasPermission(user?.role || "", "admin:staff")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();

    const existing = await prisma.staff.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (typeof body.name === "string") data.name = body.name;
    if (typeof body.role === "string") data.role = body.role;
    if (typeof body.designation === "string" || body.designation === null) data.designation = body.designation;
    if (typeof body.departmentId === "string" || body.departmentId === null) data.departmentId = body.departmentId || null;
    if (typeof body.centreId === "string" || body.centreId === null) data.centreId = body.centreId || null;
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;

    const staff = await prisma.staff.update({
      where: { id },
      data,
      include: { department: true, centre: true },
    });

    const changes = computeChanges(existing as Record<string, unknown>, data);
    await createAuditLog({
      action: "UPDATE",
      entity: "Staff",
      entityId: id,
      performedById: user?.id,
      changes,
      metadata: { staffName: existing.name, email: existing.email },
    });

    const { passwordHash: _ph, ...sanitized } = staff;
    void _ph;
    return NextResponse.json(sanitized);
  } catch (error) {
    console.error("[PUT /api/staff/:id]", error);
    return NextResponse.json({ error: "Failed to update staff" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await auth();
    const user = session?.user as { id?: string; role?: string } | undefined;
    if (!hasPermission(user?.role || "", "admin:staff")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await prisma.staff.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (existing.role === "OWNER") {
      return NextResponse.json({ error: "The OWNER cannot be removed" }, { status: 400 });
    }
    if (existing.role === "DEV") {
      return NextResponse.json({ error: "The DEV account cannot be removed" }, { status: 400 });
    }

    // If the staff has historical references (audits, sessions, consultations,
    // assignments), soft-delete by deactivating rather than hard-delete.
    const [audits, sessions, consultations, appts, assigns] = await Promise.all([
      prisma.auditLog.count({ where: { performedById: id } }),
      prisma.session.count({ where: { therapistId: id } }),
      prisma.consultation.count({ where: { consultantId: id } }),
      prisma.appointment.count({ where: { therapistId: id } }),
      prisma.clientDoctorAssignment.count({ where: { staffId: id } }),
    ]);
    const hasHistory = audits + sessions + consultations + appts + assigns > 0;

    if (hasHistory) {
      await prisma.staff.update({ where: { id }, data: { isActive: false } });
      await createAuditLog({
        action: "UPDATE",
        entity: "Staff",
        entityId: id,
        performedById: user?.id,
        metadata: { name: existing.name, softDelete: true, reason: "has_history" },
      });
      return NextResponse.json({ ok: true, softDelete: true });
    }

    await prisma.staff.delete({ where: { id } });
    await createAuditLog({
      action: "DELETE",
      entity: "Staff",
      entityId: id,
      performedById: user?.id,
      metadata: { name: existing.name, email: existing.email },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/staff/:id]", error);
    return NextResponse.json({ error: "Failed to delete staff" }, { status: 500 });
  }
}
