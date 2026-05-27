import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const staff = await prisma.staff.findUnique({
    where: { id: userId },
    select: { signatureDataUrl: true },
  });
  return NextResponse.json({ signatureDataUrl: staff?.signatureDataUrl || null });
}

export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    const userId = (session?.user as { id?: string })?.id;
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { signatureDataUrl } = await req.json();
    if (signatureDataUrl !== null && typeof signatureDataUrl !== "string") {
      return NextResponse.json({ error: "signatureDataUrl must be a string or null" }, { status: 400 });
    }
    if (signatureDataUrl && !signatureDataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "Expected an image data URL" }, { status: 400 });
    }
    if (signatureDataUrl && signatureDataUrl.length > 500_000) {
      return NextResponse.json({ error: "Signature image is too large" }, { status: 413 });
    }

    await prisma.staff.update({
      where: { id: userId },
      data: { signatureDataUrl: signatureDataUrl || null },
    });

    await createAuditLog({
      action: "UPDATE",
      entity: "Staff",
      entityId: userId,
      performedById: userId,
      metadata: { event: signatureDataUrl ? "signature_set" : "signature_cleared" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PUT /api/staff/me/signature]", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
