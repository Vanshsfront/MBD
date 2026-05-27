import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";

// GET — list promotions. Optional ?active=true filters to currently-applicable ones.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("active") === "true";

    const where: Record<string, unknown> = {};
    if (activeOnly) {
      const now = new Date();
      where.isActive = true;
      where.OR = [{ validFrom: null }, { validFrom: { lte: now } }];
      where.AND = [
        {
          OR: [{ validUntil: null }, { validUntil: { gte: now } }],
        },
      ];
    }

    const promos = await prisma.promotion.findMany({ where, orderBy: { createdAt: "desc" } });
    return NextResponse.json(promos);
  } catch (error) {
    console.error("[GET /api/promotions]", error);
    return NextResponse.json({ error: "Failed to fetch promotions" }, { status: 500 });
  }
}

// POST — create a new promotion
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const role = (session?.user as { role?: string })?.role || "";
    if (!hasPermission(role, "promotions:edit")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const {
      name,
      code,
      description,
      discountType,
      discountValue,
      maxDiscount,
      validFrom,
      validUntil,
      maxUses,
      isActive,
    } = body;

    if (!name || !code || !discountType || discountValue === undefined) {
      return NextResponse.json(
        { error: "name, code, discountType, and discountValue are required" },
        { status: 400 }
      );
    }
    if (!["PERCENT", "FLAT"].includes(discountType)) {
      return NextResponse.json({ error: "discountType must be PERCENT or FLAT" }, { status: 400 });
    }

    const promo = await prisma.promotion.create({
      data: {
        name,
        code: String(code).toUpperCase().trim(),
        description: description || null,
        discountType,
        discountValue: Number(discountValue),
        maxDiscount: maxDiscount != null ? Number(maxDiscount) : null,
        validFrom: validFrom ? new Date(validFrom) : null,
        validUntil: validUntil ? new Date(validUntil) : null,
        maxUses: maxUses != null ? Number(maxUses) : null,
        isActive: isActive !== false,
      },
    });

    const userId = (session?.user as { id?: string })?.id;
    await createAuditLog({
      action: "CREATE",
      entity: "Promotion",
      entityId: promo.id,
      performedById: userId,
      metadata: { code: promo.code, name: promo.name },
    });

    return NextResponse.json(promo, { status: 201 });
  } catch (error) {
    console.error("[POST /api/promotions]", error);
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "A promotion with this code already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create promotion" }, { status: 500 });
  }
}
