import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/change-requests — list change requests with filters
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const requesterId = searchParams.get("requesterId");

    const where: Record<string, unknown> = {};
    if (status && status !== "ALL") where.status = status;
    if (requesterId) where.requesterId = requesterId;

    const changeRequests = await prisma.changeRequest.findMany({
      where,
      include: {
        requester: { select: { id: true, name: true, designation: true, role: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json(changeRequests);
  } catch (error) {
    console.error("[GET /api/change-requests]", error);
    return NextResponse.json({ error: "Failed to fetch change requests" }, { status: 500 });
  }
}

// POST /api/change-requests — doctor submits a change request
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, details, requesterId } = body;

    if (!type || !details || !requesterId) {
      return NextResponse.json({ error: "type, details, and requesterId are required" }, { status: 400 });
    }

    const changeRequest = await prisma.changeRequest.create({
      data: {
        type,
        details,
        status: "PENDING",
        requesterId,
      },
      include: {
        requester: { select: { id: true, name: true, designation: true } },
      },
    });

    // Create notification for all FO users
    const foUsers = await prisma.staff.findMany({
      where: { role: { in: ["FRONT_OFFICE", "ADMIN", "OWNER", "DEV"] }, isActive: true },
      select: { id: true },
    });

    const requesterName = changeRequest.requester.name;
    await prisma.notification.createMany({
      data: foUsers.map(u => ({
        type: "CHANGE_REQUEST",
        title: `New Change Request from ${requesterName}`,
        message: `${requesterName} submitted a ${type.toLowerCase()} request: ${details.slice(0, 100)}`,
        targetUserId: u.id,
        priority: "HIGH",
      })),
    });

    return NextResponse.json(changeRequest, { status: 201 });
  } catch (error) {
    console.error("[POST /api/change-requests]", error);
    return NextResponse.json({ error: "Failed to create change request" }, { status: 500 });
  }
}

// PUT /api/change-requests — FO reviews a change request
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status, response, reviewedById } = body;

    if (!id || !status || !reviewedById) {
      return NextResponse.json({ error: "id, status, and reviewedById are required" }, { status: 400 });
    }

    const changeRequest = await prisma.changeRequest.update({
      where: { id },
      data: {
        status,
        response: response || null,
        reviewedById,
        reviewedAt: new Date(),
      },
      include: {
        requester: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    });

    // Notify the requester of the decision
    await prisma.notification.create({
      data: {
        type: "CHANGE_REQUEST_RESPONSE",
        title: `Change Request ${status === "APPROVED" ? "Approved" : "Rejected"}`,
        message: `Your ${changeRequest.type.toLowerCase()} request was ${status.toLowerCase()} by ${changeRequest.reviewedBy?.name}${response ? `: ${response}` : ""}`,
        targetUserId: changeRequest.requester.id,
        priority: status === "REJECTED" ? "HIGH" : "NORMAL",
      },
    });

    return NextResponse.json(changeRequest);
  } catch (error) {
    console.error("[PUT /api/change-requests]", error);
    return NextResponse.json({ error: "Failed to update change request" }, { status: 500 });
  }
}
