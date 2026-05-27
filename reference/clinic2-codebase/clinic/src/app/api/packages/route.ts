import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (clientId) where.clientId = clientId;
    if (status) where.status = status;

    const packages = await prisma.package.findMany({
      where,
      include: {
        client: true,
        consultation: { include: { consultant: true, service: true } },
        sessions: { include: { therapist: true, service: true } },
        invoices: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(packages);
  } catch (error) {
    console.error("[GET /api/packages]", error);
    return NextResponse.json({ error: "Failed to fetch packages" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { clientId, consultationId, totalSessions, serviceMix, validFrom, validUntil, totalPrice, discountPercent } = body;

    if (!clientId || !totalSessions || !serviceMix || !validFrom || !validUntil || totalPrice === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const pkg = await prisma.package.create({
      data: {
        clientId,
        consultationId: consultationId || null,
        totalSessions: parseInt(totalSessions),
        serviceMix: typeof serviceMix === "string" ? serviceMix : JSON.stringify(serviceMix),
        validFrom: new Date(validFrom),
        validUntil: new Date(validUntil),
        totalPrice: parseFloat(totalPrice),
        discountPercent: parseFloat(discountPercent || "0"),
      },
      include: { client: true },
    });

    return NextResponse.json(pkg, { status: 201 });
  } catch (error) {
    console.error("[POST /api/packages]", error);
    return NextResponse.json({ error: "Failed to create package" }, { status: 500 });
  }
}
