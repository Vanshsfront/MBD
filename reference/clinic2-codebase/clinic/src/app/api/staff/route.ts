import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getActiveCentreId } from "@/lib/active-centre";
import { createAuditLog } from "@/lib/audit";
import bcrypt from "bcryptjs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const role = searchParams.get("role");
    const departmentId = searchParams.get("departmentId");
    const centreIdParam = searchParams.get("centreId");
    const allCentres = searchParams.get("allCentres") === "true";

    const where: Record<string, unknown> = {};
    if (role) where.role = role;
    if (departmentId) where.departmentId = departmentId;

    if (!allCentres) {
      const centreId = centreIdParam || (await getActiveCentreId());
      if (centreId) {
        // OWNER / DEV are global — always visible. Everyone else is filtered by centre.
        where.OR = [
          { centreId },
          { role: "OWNER" },
          { role: "DEV" },
        ];
      }
    }

    const staff = await prisma.staff.findMany({
      where,
      include: { department: true, centre: true },
      orderBy: { name: "asc" },
    });

    const sanitized = staff.map((s) => {
      const { passwordHash: _ph, ...rest } = s;
      void _ph;
      return rest;
    });
    return NextResponse.json(sanitized);
  } catch (error) {
    console.error("[GET /api/staff]", error);
    return NextResponse.json({ error: "Failed to fetch staff" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; role?: string } | undefined;
    if (!hasPermission(user?.role || "", "admin:staff")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { name, email, password, role, departmentId, designation } = body;
    let { centreId } = body as { centreId?: string };

    if (!name || !email || !password || !role) {
      return NextResponse.json({ error: "name, email, password, and role are required" }, { status: 400 });
    }

    const existing = await prisma.staff.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }

    // Default to the active clinic so admin doesn't have to pick every time.
    if (!centreId && role !== "OWNER" && role !== "DEV") {
      centreId = (await getActiveCentreId()) ?? undefined;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const staff = await prisma.staff.create({
      data: {
        name,
        email,
        passwordHash,
        role,
        departmentId: departmentId || null,
        designation: designation || null,
        centreId: centreId || null,
      },
      include: { department: true, centre: true },
    });

    await createAuditLog({
      action: "CREATE",
      entity: "Staff",
      entityId: staff.id,
      performedById: user?.id,
      metadata: { name, email, role, designation, centreId },
    });

    const { passwordHash: _ph, ...sanitized } = staff;
    void _ph;
    return NextResponse.json(sanitized, { status: 201 });
  } catch (error) {
    console.error("[POST /api/staff]", error);
    return NextResponse.json({ error: "Failed to create staff" }, { status: 500 });
  }
}
