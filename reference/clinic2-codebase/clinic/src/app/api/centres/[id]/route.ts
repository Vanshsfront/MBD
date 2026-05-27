import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { createAuditLog, computeChanges } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const centre = await prisma.centre.findUnique({
    where: { id },
    include: { staff: { select: { id: true, name: true, email: true, role: true, designation: true, isActive: true } } },
  });
  if (!centre) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(centre);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role || "";
  if (!hasPermission(role, "admin:clinics")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const existing = await prisma.centre.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.location !== undefined) updateData.location = body.location;
  if (body.isActive !== undefined) updateData.isActive = !!body.isActive;
  // slug is deliberately NOT editable once set — it's embedded in all patient/invoice codes.

  const centre = await prisma.centre.update({ where: { id }, data: updateData });
  const userId = (session?.user as { id?: string })?.id;
  const changes = computeChanges(existing as Record<string, unknown>, updateData);
  await createAuditLog({
    action: "UPDATE",
    entity: "Centre",
    entityId: id,
    performedById: userId,
    changes,
  });
  return NextResponse.json(centre);
}

// DELETE — hard delete if the clinic has no attached data; otherwise
// deactivate (isActive=false) so history is preserved.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!hasPermission(user?.role || "", "admin:clinics")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.centre.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [staffCount, clientCount, serviceCount, sessionCount, invoiceCount, apptCount] = await Promise.all([
    prisma.staff.count({ where: { centreId: id } }),
    prisma.client.count({ where: { centreId: id } }),
    prisma.service.count({ where: { centreId: id } }),
    prisma.session.count({ where: { centreId: id } }),
    prisma.invoice.count({ where: { centreId: id } }),
    prisma.appointment.count({ where: { centreId: id } }),
  ]);

  const hasData = staffCount + clientCount + serviceCount + sessionCount + invoiceCount + apptCount > 0;

  if (hasData) {
    // Soft-delete — preserves FK integrity for historical records.
    await prisma.centre.update({ where: { id }, data: { isActive: false } });
    await createAuditLog({
      action: "UPDATE",
      entity: "Centre",
      entityId: id,
      performedById: user?.id,
      metadata: {
        name: existing.name,
        slug: existing.slug,
        softDelete: true,
        counts: { staff: staffCount, clients: clientCount, services: serviceCount, sessions: sessionCount, invoices: invoiceCount, appointments: apptCount },
      },
    });
    return NextResponse.json({
      ok: true,
      softDelete: true,
      message: `Clinic deactivated — it still has ${staffCount} staff, ${clientCount} patients and ${serviceCount} services attached. Move them to another clinic and try again to hard-delete.`,
    });
  }

  await prisma.centre.delete({ where: { id } });
  await createAuditLog({
    action: "DELETE",
    entity: "Centre",
    entityId: id,
    performedById: user?.id,
    metadata: { name: existing.name, slug: existing.slug },
  });
  return NextResponse.json({ ok: true });
}
