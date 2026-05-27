// Staff check-in / check-out (PRD §5 AttendanceLog).
//
// POST  — record own check-in or check-out for today.
// GET   — admin-side: list logs for a date range, grouped by staff (used by
//         /dashboard/admin/attendance).

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePermission, requestMeta } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit";

const postSchema = z.object({
  type: z.enum(["CHECK_IN", "CHECK_OUT"]),
});

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as unknown;
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { type } = parsed.data;

  const today = startOfDay(new Date());
  const tomorrow = new Date(today.getTime() + 24 * 3600_000);

  // Refuse a duplicate of the same type within the same day. Two CHECK_INs
  // in one morning is almost always an accidental double-click.
  const existing = await prisma.attendanceLog.findFirst({
    where: {
      staffId: auth.user.id,
      type,
      date: { gte: today, lt: tomorrow },
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: "already_logged_today", type },
      { status: 409 },
    );
  }

  const log = await prisma.attendanceLog.create({
    data: {
      staffId: auth.user.id,
      type,
      date: new Date(),
    },
  });

  const meta = requestMeta(req);
  await createAuditLog({
    action: "CREATE",
    entity: "AttendanceLog",
    entityId: log.id,
    performedById: auth.user.id,
    metadata: { type, selfService: true },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ ok: true, id: log.id, at: log.date.toISOString() });
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
