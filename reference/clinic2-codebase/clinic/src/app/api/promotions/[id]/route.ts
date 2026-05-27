import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { createAuditLog, computeChanges } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const promo = await prisma.promotion.findUnique({ where: { id } });
  if (!promo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(promo);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const role = (session?.user as { role?: string })?.role || "";
    if (!hasPermission(role, "promotions:edit")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const existing = await prisma.promotion.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.code !== undefined) updateData.code = String(body.code).toUpperCase().trim();
    if (body.description !== undefined) updateData.description = body.description || null;
    if (body.discountType !== undefined) updateData.discountType = body.discountType;
    if (body.discountValue !== undefined) updateData.discountValue = Number(body.discountValue);
    if (body.maxDiscount !== undefined)
      updateData.maxDiscount = body.maxDiscount != null ? Number(body.maxDiscount) : null;
    if (body.validFrom !== undefined)
      updateData.validFrom = body.validFrom ? new Date(body.validFrom) : null;
    if (body.validUntil !== undefined)
      updateData.validUntil = body.validUntil ? new Date(body.validUntil) : null;
    if (body.maxUses !== undefined)
      updateData.maxUses = body.maxUses != null ? Number(body.maxUses) : null;
    if (body.isActive !== undefined) updateData.isActive = !!body.isActive;

    const promo = await prisma.promotion.update({ where: { id }, data: updateData });

    const userId = (session?.user as { id?: string })?.id;
    const changes = computeChanges(existing as Record<string, unknown>, updateData);
    await createAuditLog({
      action: "UPDATE",
      entity: "Promotion",
      entityId: id,
      performedById: userId,
      changes,
      metadata: { code: promo.code },
    });

    return NextResponse.json(promo);
  } catch (error) {
    console.error("[PUT /api/promotions/:id]", error);
    return NextResponse.json({ error: "Failed to update promotion" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const role = (session?.user as { role?: string })?.role || "";
    if (!hasPermission(role, "promotions:edit")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await prisma.promotion.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.promotion.delete({ where: { id } });

    const userId = (session?.user as { id?: string })?.id;
    await createAuditLog({
      action: "DELETE",
      entity: "Promotion",
      entityId: id,
      performedById: userId,
      metadata: { code: existing.code, name: existing.name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/promotions/:id]", error);
    return NextResponse.json({ error: "Failed to delete promotion" }, { status: 500 });
  }
}
