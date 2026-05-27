import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/attendance — list attendance logs with filters
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const staffId = searchParams.get("staffId");

    const where: Record<string, unknown> = {};

    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      where.date = { gte: start, lte: end };
    }

    if (staffId) where.staffId = staffId;

    const logs = await prisma.attendanceLog.findMany({
      where,
      orderBy: { date: "desc" },
      take: 200,
    });

    // Enrich with staff names (AttendanceLog has no relation in schema, do manual lookup)
    const staffIds = [...new Set(logs.map(l => l.staffId).filter(Boolean))];
    const staffList = staffIds.length > 0
      ? await prisma.staff.findMany({ where: { id: { in: staffIds as string[] } }, select: { id: true, name: true, designation: true } })
      : [];
    const staffMap = Object.fromEntries(staffList.map(s => [s.id, s]));

    const enriched = logs.map(log => ({
      ...log,
      staff: log.staffId ? staffMap[log.staffId] || null : null,
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("[GET /api/attendance]", error);
    return NextResponse.json({ error: "Failed to fetch attendance" }, { status: 500 });
  }
}

// POST /api/attendance — clock in/out
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { staffId, type } = body;

    if (!staffId || !type) {
      return NextResponse.json({ error: "staffId and type (CHECK_IN / CHECK_OUT) are required" }, { status: 400 });
    }

    // Prevent duplicate check-ins on the same day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const existingToday = await prisma.attendanceLog.findFirst({
      where: {
        staffId,
        type,
        date: { gte: today, lt: tomorrow },
      },
    });

    if (existingToday) {
      return NextResponse.json({
        error: "DUPLICATE",
        message: `Already ${type === "CHECK_IN" ? "checked in" : "checked out"} today`,
      }, { status: 409 });
    }

    const log = await prisma.attendanceLog.create({
      data: {
        staffId,
        type,
        date: new Date(),
      },
    });

    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    console.error("[POST /api/attendance]", error);
    return NextResponse.json({ error: "Failed to log attendance" }, { status: 500 });
  }
}
