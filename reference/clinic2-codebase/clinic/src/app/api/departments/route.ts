import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";

export async function GET() {
  try {
    const departments = await prisma.department.findMany({
      where: { isActive: true },
      include: { _count: { select: { services: true, staff: true } } },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(departments);
  } catch (error) {
    console.error("[GET /api/departments]", error);
    return NextResponse.json({ error: "Failed to fetch departments" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; role?: string } | undefined;
    // Staff OR services admins can create departments — both need to reference them.
    if (!hasPermission(user?.role || "", "admin:staff") && !hasPermission(user?.role || "", "admin:services")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

    const defaultGstRate = typeof body.defaultGstRate === "number" ? body.defaultGstRate : 0;

    const dept = await prisma.department.create({
      data: { name, defaultGstRate },
      include: { _count: { select: { services: true, staff: true } } },
    });

    await createAuditLog({
      action: "CREATE",
      entity: "Department",
      entityId: dept.id,
      performedById: user?.id,
      metadata: { name, defaultGstRate },
    });

    return NextResponse.json(dept, { status: 201 });
  } catch (error) {
    console.error("[POST /api/departments]", error);
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "A department with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create department" }, { status: 500 });
  }
}
