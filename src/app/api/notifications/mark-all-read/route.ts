// POST /api/notifications/mark-all-read — clears the bell badge.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";

export async function POST() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const result = await prisma.notification.updateMany({
    where: { targetUserId: auth.user.id, isRead: false },
    data: { isRead: true },
  });

  return NextResponse.json({ ok: true, updated: result.count });
}
