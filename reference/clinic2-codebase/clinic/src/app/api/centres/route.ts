import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";

export async function GET() {
  try {
    const centres = await prisma.centre.findMany({
      orderBy: [{ createdAt: "asc" }],
      include: {
        _count: {
          select: { staff: true, clients: true },
        },
      },
    });
    return NextResponse.json(centres);
  } catch (error) {
    console.error("[GET /api/centres]", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const role = (session?.user as { role?: string })?.role || "";
    if (!hasPermission(role, "admin:clinics")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    if (!body.name || !body.slug) {
      return NextResponse.json({ error: "name and slug are required" }, { status: 400 });
    }
    const slug = String(body.slug).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!slug) {
      return NextResponse.json({ error: "slug must be uppercase alphanumeric" }, { status: 400 });
    }

    const centre = await prisma.centre.create({
      data: {
        name: body.name,
        slug,
        location: body.location || "",
        isActive: body.isActive !== false,
      },
    });

    const userId = (session?.user as { id?: string })?.id;
    await createAuditLog({
      action: "CREATE",
      entity: "Centre",
      entityId: centre.id,
      performedById: userId,
      metadata: { name: centre.name, slug: centre.slug },
    });
    return NextResponse.json(centre, { status: 201 });
  } catch (error) {
    console.error("[POST /api/centres]", error);
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "A clinic with this slug already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
