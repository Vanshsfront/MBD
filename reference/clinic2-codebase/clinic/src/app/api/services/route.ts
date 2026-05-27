import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getActiveCentreId } from "@/lib/active-centre";
import { createAuditLog } from "@/lib/audit";

// Map a staff designation to a Department name when departmentId is missing.
function inferDepartmentName(designation: string | null | undefined): string | null {
  const d = (designation || "").toLowerCase();
  if (d.includes("massage")) return "Massage";
  if (d.includes("physiotherapist") || d.includes("physio")) return "Physiotherapy";
  if (d.includes("medical") || d.includes("doctor")) return "Medical";
  if (d.includes("nutrition")) return "Nutrition";
  if (d.includes("yoga")) return "Yoga";
  if (d.includes("counsel")) return "Counselling";
  if (d.includes("strength") || d.includes("s&c")) return "Strength & Conditioning";
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const staffId = req.nextUrl.searchParams.get("staffId");
    const centreIdParam = req.nextUrl.searchParams.get("centreId");
    const allCentres = req.nextUrl.searchParams.get("allCentres") === "true";

    const where: {
      isActive: boolean;
      departmentId?: string;
      centreId?: string | null;
    } = { isActive: true };

    // Resolve centre scope: explicit param → active-centre cookie → null.
    // `allCentres=true` bypasses the filter (used by admin dashboards that
    // intentionally want the global picture).
    if (!allCentres) {
      const centreId = centreIdParam || (await getActiveCentreId());
      if (centreId) where.centreId = centreId;
    }

    if (staffId) {
      const staff = await prisma.staff.findUnique({
        where: { id: staffId },
        select: { departmentId: true, designation: true },
      });

      let departmentId = staff?.departmentId || null;
      if (!departmentId) {
        const inferred = inferDepartmentName(staff?.designation);
        if (inferred) {
          const dept = await prisma.department.findFirst({
            where: { name: { contains: inferred, mode: "insensitive" } },
            select: { id: true },
          });
          departmentId = dept?.id || null;
        }
      }
      if (departmentId) where.departmentId = departmentId;
      else return NextResponse.json([]);
    }

    const services = await prisma.service.findMany({
      where,
      include: { department: true, centre: true },
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
    });

    return NextResponse.json(services);
  } catch (error) {
    console.error("[GET /api/services]", error);
    return NextResponse.json({ error: "Failed to fetch services" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; role?: string } | undefined;
    if (!hasPermission(user?.role || "", "admin:services")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { name, departmentId, basePrice, gstRate, hsnSacCode, participantCount } = body;
    let { centreId } = body as { centreId?: string };

    if (!name || !departmentId || typeof basePrice !== "number") {
      return NextResponse.json({ error: "name, departmentId, basePrice are required" }, { status: 400 });
    }

    // Default to the currently active centre if client didn't pass one.
    if (!centreId) centreId = (await getActiveCentreId()) ?? undefined;
    if (!centreId) {
      return NextResponse.json({ error: "No active clinic — pick one first" }, { status: 400 });
    }

    const service = await prisma.service.create({
      data: {
        name: name.trim(),
        departmentId,
        centreId,
        basePrice,
        gstRate: typeof gstRate === "number" ? gstRate : 0,
        hsnSacCode: hsnSacCode || null,
        participantCount: typeof participantCount === "number" ? participantCount : 1,
      },
      include: { department: true, centre: true },
    });

    await createAuditLog({
      action: "CREATE",
      entity: "Service",
      entityId: service.id,
      performedById: user?.id,
      metadata: { name: service.name, centreId, basePrice },
    });

    return NextResponse.json(service, { status: 201 });
  } catch (error) {
    console.error("[POST /api/services]", error);
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "A service with this name already exists in this department + clinic" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create service" }, { status: 500 });
  }
}
