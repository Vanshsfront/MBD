import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("active") === "true";
    const where: Record<string, unknown> = {};
    if (activeOnly) where.isActive = true;
    const sources = await prisma.referralSource.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json(sources);
  } catch (error) {
    console.error("[GET /api/referral-sources]", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const role = (session?.user as { role?: string })?.role || "";
    if (!hasPermission(role, "admin:referral_sources")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json();
    if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const source = await prisma.referralSource.create({
      data: {
        name: body.name,
        isActive: body.isActive !== false,
        sortOrder: body.sortOrder ?? 0,
      },
    });
    const userId = (session?.user as { id?: string })?.id;
    await createAuditLog({
      action: "CREATE",
      entity: "ReferralSource",
      entityId: source.id,
      performedById: userId,
      metadata: { name: source.name },
    });
    return NextResponse.json(source, { status: 201 });
  } catch (error) {
    console.error("[POST /api/referral-sources]", error);
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "A source with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
