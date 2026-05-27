import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog, getSessionUserId } from "@/lib/audit";

// POST — generate a new intake token for patient-side form
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = body.createdById || await getSessionUserId();
    
    // Token expires in 48 hours
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const intakeToken = await prisma.intakeToken.create({
      data: {
        expiresAt,
        createdById: userId || null,
      },
    });

    // Build the public URL
    const host = req.headers.get("host") || "localhost:3000";
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const url = `${protocol}://${host}/intake/${intakeToken.token}`;

    // Audit log
    await createAuditLog({
      action: "CREATE",
      entity: "IntakeToken",
      entityId: intakeToken.id,
      performedById: userId,
      metadata: { token: intakeToken.token, expiresAt: expiresAt.toISOString() },
    });

    return NextResponse.json({ 
      token: intakeToken.token, 
      url,
      expiresAt: intakeToken.expiresAt,
    }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/intake-token]", error);
    return NextResponse.json({ error: "Failed to create intake token" }, { status: 500 });
  }
}
