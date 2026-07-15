// Staff check-in / check-out (PRD §5 AttendanceLog).
//
// POST  — disabled; attendance must come from biometric/admin ingestion.
// GET   — admin-side: list logs for a date range, grouped by staff (used by
//         /dashboard/admin/attendance).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";

export async function POST(req: Request) {
  await req.arrayBuffer().catch(() => null);
  return NextResponse.json(
    { error: "attendance_self_service_disabled" },
    { status: 410 },
  );
}

export async function GET(req: Request) {
  const auth = await requirePermission("admin:attendance");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");

  const now = new Date();
  const from = fromStr ? new Date(fromStr) : startOfDay(new Date(now.getTime() - 7 * 24 * 3600_000));
  const to = toStr ? endOfDay(new Date(toStr)) : endOfDay(now);

  const logs = await prisma.attendanceLog.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: [{ staffId: "asc" }, { date: "asc" }],
  });

  return NextResponse.json(
    logs.map((l) => ({
      id: l.id,
      staffId: l.staffId,
      type: l.type,
      date: l.date.toISOString(),
    })),
  );
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
function endOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}
