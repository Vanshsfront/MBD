// GET /api/notifications — recent (50) notifications for the current user.
// PATCH /api/notifications — { ids: string[] } marks the given ids as read.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";

const patchSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
});

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const onlyUnread = url.searchParams.get("unread") === "1";

  const notifications = await prisma.notification.findMany({
    where: {
      targetUserId: auth.user.id,
      ...(onlyUnread ? { isRead: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const unreadCount = await prisma.notification.count({
    where: { targetUserId: auth.user.id, isRead: false },
  });

  return NextResponse.json({
    unreadCount,
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      isRead: n.isRead,
      priority: n.priority,
      createdAt: n.createdAt.toISOString(),
      metadata: n.metadata,
    })),
  });
}

export async function PATCH(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as unknown;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await prisma.notification.updateMany({
    where: { id: { in: parsed.data.ids }, targetUserId: auth.user.id },
    data: { isRead: true },
  });

  return NextResponse.json({ ok: true, updated: result.count });
}
