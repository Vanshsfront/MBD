import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionSchema } from "@/lib/validators";
import { createAuditLog } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const therapistId = searchParams.get("therapistId");
    const therapistName = searchParams.get("therapistName");
    const clientId = searchParams.get("clientId");
    const status = searchParams.get("status");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const date = searchParams.get("date");

    const where: Record<string, unknown> = {};
    if (therapistId) where.therapistId = therapistId;
    if (clientId) where.clientId = clientId;
    if (status) where.status = status;

    // Search by therapist name
    if (therapistName) {
      where.therapist = {
        name: { contains: therapistName, mode: "insensitive" },
      };
    }

    if (date) {
      const d = new Date(date);
      where.sessionDate = {
        gte: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
        lt: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1),
      };
    } else if (dateFrom || dateTo) {
      where.sessionDate = {};
      if (dateFrom) (where.sessionDate as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where.sessionDate as Record<string, unknown>).lte = new Date(dateTo);
    }

    const sessions = await prisma.session.findMany({
      where,
      include: {
        client: true,
        therapist: true,
        service: true,
        package: true,
      },
      orderBy: { sessionDate: "desc" },
    });

    return NextResponse.json(sessions);
  } catch (error) {
    console.error("[GET /api/sessions]", error);
    return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = sessionSchema.parse(body);

    const session = await prisma.session.create({
      data: {
        clientId: data.clientId,
        therapistId: data.therapistId,
        serviceId: data.serviceId,
        packageId: data.packageId || null,
        sessionDate: new Date(data.sessionDate),
        treatmentNotes: data.treatmentNotes || null,
        progressUpdates: data.progressUpdates || null,
        status: data.status,
        centreId: body.centreId || null,
        allotments: body.allotments ? JSON.stringify(body.allotments) : null,
      },
      include: { client: true, therapist: true, service: true },
    });

    // Update package completed sessions count
    if (data.packageId && data.status === "COMPLETED") {
      await prisma.package.update({
        where: { id: data.packageId },
        data: { completedSessions: { increment: 1 } },
      });
    }

    // Audit log
    await createAuditLog({
      action: "CREATE",
      entity: "Session",
      entityId: session.id,
      performedById: body.performedById,
      metadata: { clientId: data.clientId, therapistId: data.therapistId, serviceId: data.serviceId, status: data.status },
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error("[POST /api/sessions]", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Validation failed", details: error }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}
