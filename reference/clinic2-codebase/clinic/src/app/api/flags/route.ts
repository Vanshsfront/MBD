import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");

    const where: Record<string, unknown> = {};
    if (clientId) where.clientId = clientId;

    const flags = await prisma.clientFlag.findMany({
      where,
      include: {
        client: { select: { id: true, firstName: true, lastName: true, clientCode: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(flags);
  } catch (error) {
    console.error("[GET /api/flags]", error);
    return NextResponse.json({ error: "Failed to fetch flags" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clientId, type, label, color, notes, createdBy, performedById } = body;

    if (!clientId || !type || !label) {
      return NextResponse.json({ error: "clientId, type, and label are required" }, { status: 400 });
    }

    const flag = await prisma.clientFlag.create({
      data: {
        clientId,
        type,
        label,
        color: color || "yellow",
        notes: notes || null,
        createdBy: createdBy || null,
      },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, clientCode: true } },
      },
    });

    // Audit log
    await createAuditLog({
      action: "CREATE",
      entity: "ClientFlag",
      entityId: flag.id,
      performedById: performedById,
      metadata: { clientId, type, label, color: color || "yellow" },
    });

    return NextResponse.json(flag, { status: 201 });
  } catch (error) {
    console.error("[POST /api/flags]", error);
    return NextResponse.json({ error: "Failed to create flag" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const performedById = searchParams.get("performedById");

    if (!id) {
      return NextResponse.json({ error: "Flag ID is required" }, { status: 400 });
    }

    // Fetch existing for audit
    const existing = await prisma.clientFlag.findUnique({ where: { id } });

    await prisma.clientFlag.update({
      where: { id },
      data: { isActive: false },
    });

    // Audit log
    await createAuditLog({
      action: "DELETE",
      entity: "ClientFlag",
      entityId: id,
      performedById: performedById || undefined,
      metadata: existing ? { clientId: existing.clientId, type: existing.type, label: existing.label } : undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/flags]", error);
    return NextResponse.json({ error: "Failed to deactivate flag" }, { status: 500 });
  }
}
