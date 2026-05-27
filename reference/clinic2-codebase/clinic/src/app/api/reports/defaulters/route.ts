import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — patients ranked by count of cancelled/no-show appointments in a date range.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Record<string, unknown> = {
      status: { in: ["CANCELLED", "NO_SHOW"] },
    };
    if (startDate || endDate) {
      const dateFilter: Record<string, unknown> = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
      where.startTime = dateFilter;
    }

    const appointments = await prisma.appointment.findMany({
      where,
      select: {
        id: true,
        status: true,
        cancelledBy: true,
        clientId: true,
        startTime: true,
        client: { select: { id: true, clientCode: true, firstName: true, lastName: true, phone: true } },
        therapist: { select: { id: true, name: true } },
        service: { select: { name: true } },
      },
      orderBy: { startTime: "desc" },
    });

    // Aggregate per client
    interface Row {
      clientId: string;
      clientCode: string;
      name: string;
      phone: string;
      cancelled: number;
      cancelledByPatient: number;
      cancelledByTherapist: number;
      noShow: number;
      total: number;
      lastIncidentAt: string;
    }
    const map = new Map<string, Row>();
    for (const a of appointments) {
      const existing = map.get(a.clientId);
      const row: Row = existing || {
        clientId: a.clientId,
        clientCode: a.client.clientCode,
        name: `${a.client.firstName} ${a.client.lastName}`,
        phone: a.client.phone,
        cancelled: 0,
        cancelledByPatient: 0,
        cancelledByTherapist: 0,
        noShow: 0,
        total: 0,
        lastIncidentAt: a.startTime.toISOString(),
      };
      if (a.status === "CANCELLED") {
        row.cancelled++;
        if (a.cancelledBy === "PATIENT") row.cancelledByPatient++;
        else if (a.cancelledBy === "THERAPIST") row.cancelledByTherapist++;
      } else if (a.status === "NO_SHOW") {
        row.noShow++;
      }
      row.total++;
      if (new Date(a.startTime) > new Date(row.lastIncidentAt)) row.lastIncidentAt = a.startTime.toISOString();
      map.set(a.clientId, row);
    }

    const rows = Array.from(map.values()).sort((a, b) => b.total - a.total);
    return NextResponse.json({ rows, appointments });
  } catch (error) {
    console.error("[GET /api/reports/defaulters]", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
