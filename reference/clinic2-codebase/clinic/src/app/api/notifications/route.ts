import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/notifications — list notifications for a user
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const unreadOnly = searchParams.get("unread") === "true";

    const where: Record<string, unknown> = {};
    if (userId) where.targetUserId = userId;
    if (unreadOnly) where.isRead = false;

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const unreadCount = await prisma.notification.count({
      where: { ...(userId ? { targetUserId: userId } : {}), isRead: false },
    });

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    console.error("[GET /api/notifications]", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

// POST /api/notifications — create notification
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, title, message, targetUserId, clientId, priority, metadata } = body;

    if (!type || !title || !message) {
      return NextResponse.json({ error: "type, title, and message are required" }, { status: 400 });
    }

    const notification = await prisma.notification.create({
      data: {
        type,
        title,
        message,
        targetUserId: targetUserId || null,
        clientId: clientId || null,
        priority: priority || "NORMAL",
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });

    return NextResponse.json(notification, { status: 201 });
  } catch (error) {
    console.error("[POST /api/notifications]", error);
    return NextResponse.json({ error: "Failed to create notification" }, { status: 500 });
  }
}

// PUT /api/notifications — batch mark as read
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { ids, userId } = body;

    if (ids && Array.isArray(ids)) {
      // Mark specific notifications as read
      await prisma.notification.updateMany({
        where: { id: { in: ids } },
        data: { isRead: true },
      });
    } else if (userId) {
      // Mark all notifications for user as read
      await prisma.notification.updateMany({
        where: { targetUserId: userId, isRead: false },
        data: { isRead: true },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PUT /api/notifications]", error);
    return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 });
  }
}
