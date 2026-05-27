import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

// GET — list all shares for a client
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");

    if (!clientId) {
      return NextResponse.json({ error: "clientId is required" }, { status: 400 });
    }

    const shares = await prisma.dashboardShare.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(shares);
  } catch (error) {
    console.error("[GET /api/dashboard-share]", error);
    return NextResponse.json({ error: "Failed to fetch shares" }, { status: 500 });
  }
}

// POST — create a new share link
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clientId, expiresInDays, visibleSections, performedById } = body;

    if (!clientId) {
      return NextResponse.json({ error: "clientId is required" }, { status: 400 });
    }

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const share = await prisma.dashboardShare.create({
      data: {
        clientId,
        expiresAt,
        visibleSections: visibleSections
          ? JSON.stringify(visibleSections)
          : '["overview","packages","sessions","invoices"]',
        createdById: performedById || null,
      },
    });

    // Audit log
    await createAuditLog({
      action: "CREATE",
      entity: "DashboardShare",
      entityId: share.id,
      performedById: performedById || undefined,
      metadata: { clientId, token: share.token, expiresAt },
    });

    return NextResponse.json(share, { status: 201 });
  } catch (error) {
    console.error("[POST /api/dashboard-share]", error);
    return NextResponse.json({ error: "Failed to create share" }, { status: 500 });
  }
}

// DELETE — deactivate a share link
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Fetch existing for audit
    const existing = await prisma.dashboardShare.findUnique({ where: { id } });

    await prisma.dashboardShare.update({
      where: { id },
      data: { isActive: false },
    });

    // Audit log
    await createAuditLog({
      action: "DELETE",
      entity: "DashboardShare",
      entityId: id,
      metadata: existing ? { clientId: existing.clientId, token: existing.token } : undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/dashboard-share]", error);
    return NextResponse.json({ error: "Failed to deactivate share" }, { status: 500 });
  }
}
