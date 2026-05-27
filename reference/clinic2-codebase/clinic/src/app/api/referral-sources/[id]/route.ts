import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { createAuditLog, computeChanges } from "@/lib/audit";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role || "";
  if (!hasPermission(role, "admin:referral_sources")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const existing = await prisma.referralSource.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.isActive !== undefined) updateData.isActive = !!body.isActive;
  if (body.sortOrder !== undefined) updateData.sortOrder = Number(body.sortOrder);
  const source = await prisma.referralSource.update({ where: { id }, data: updateData });

  const userId = (session?.user as { id?: string })?.id;
  const changes = computeChanges(existing as Record<string, unknown>, updateData);
  await createAuditLog({
    action: "UPDATE",
    entity: "ReferralSource",
    entityId: id,
    performedById: userId,
    changes,
  });

  return NextResponse.json(source);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role || "";
  if (!hasPermission(role, "admin:referral_sources")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.referralSource.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.referralSource.delete({ where: { id } });

  const userId = (session?.user as { id?: string })?.id;
  await createAuditLog({
    action: "DELETE",
    entity: "ReferralSource",
    entityId: id,
    performedById: userId,
    metadata: { name: existing.name },
  });
  return NextResponse.json({ success: true });
}
