import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";

export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    const userId = (session?.user as { id?: string })?.id;
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { currentPassword, newPassword } = await req.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "currentPassword and newPassword required" }, { status: 400 });
    }
    if (String(newPassword).length < 6) {
      return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
    }

    const staff = await prisma.staff.findUnique({ where: { id: userId } });
    if (!staff) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const ok = await bcrypt.compare(currentPassword, staff.passwordHash);
    if (!ok) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });

    const newHash = await bcrypt.hash(newPassword, 10);
    await prisma.staff.update({ where: { id: userId }, data: { passwordHash: newHash } });

    await createAuditLog({
      action: "UPDATE",
      entity: "Staff",
      entityId: userId,
      performedById: userId,
      metadata: { event: "password_change" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PUT /api/staff/me/password]", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
