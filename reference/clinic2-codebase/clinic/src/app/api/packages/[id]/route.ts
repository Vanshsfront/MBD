import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog, computeChanges } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const pkg = await prisma.package.findUnique({
      where: { id },
      include: {
        client: true,
        consultation: { include: { consultant: true, service: true } },
        sessions: { orderBy: { sessionDate: "desc" }, include: { therapist: true, service: true } },
        invoices: { include: { payments: true } },
      },
    });

    if (!pkg) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

    return NextResponse.json(pkg);
  } catch (error) {
    console.error("[GET /api/packages/:id]", error);
    return NextResponse.json({ error: "Failed to fetch package" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.package.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    if (body.status !== undefined) updateData.status = body.status;
    if (body.totalSessions !== undefined) updateData.totalSessions = body.totalSessions;
    if (body.completedSessions !== undefined) updateData.completedSessions = body.completedSessions;
    if (body.validFrom !== undefined) updateData.validFrom = new Date(body.validFrom);
    if (body.validUntil !== undefined) updateData.validUntil = new Date(body.validUntil);
    if (body.discountPercent !== undefined) updateData.discountPercent = body.discountPercent;
    if (body.discountAmount !== undefined) updateData.discountAmount = body.discountAmount;
    if (body.totalPrice !== undefined) updateData.totalPrice = body.totalPrice;
    if (body.serviceMix !== undefined) updateData.serviceMix = typeof body.serviceMix === "string" ? body.serviceMix : JSON.stringify(body.serviceMix);

    const pkg = await prisma.package.update({
      where: { id },
      data: updateData,
      include: {
        client: true,
        consultation: { include: { consultant: true, service: true } },
        sessions: { orderBy: { sessionDate: "desc" }, include: { therapist: true, service: true } },
      },
    });

    // Audit trail — auto-diff all fields
    const changes = computeChanges(existing as Record<string, unknown>, body);
    await createAuditLog({
      action: "UPDATE",
      entity: "Package",
      entityId: id,
      performedById: body.performedById,
      changes,
      metadata: { clientId: existing.clientId },
    });

    return NextResponse.json(pkg);
  } catch (error) {
    console.error("[PUT /api/packages/:id]", error);
    return NextResponse.json({ error: "Failed to update package" }, { status: 500 });
  }
}
