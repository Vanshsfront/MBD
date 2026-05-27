/**
 * POST /api/active-centre
 *   Body: { centreId: string }
 *   Sets the `activeCentreId` cookie for the current session.
 *   Only OWNER / ADMIN may switch clinics.
 *
 * GET /api/active-centre
 *   Returns { activeCentreId, canSwitch, centre } for the current user.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ACTIVE_CENTRE_COOKIE, getActiveCentreId, canSwitchCentre } from "@/lib/active-centre";

export async function GET() {
  const activeCentreId = await getActiveCentreId();
  const canSwitch = await canSwitchCentre();
  const centre = activeCentreId
    ? await prisma.centre.findUnique({
        where: { id: activeCentreId },
        select: { id: true, name: true, slug: true, location: true },
      })
    : null;
  return NextResponse.json({ activeCentreId, canSwitch, centre });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role || "";
  if (!(role === "OWNER" || role === "ADMIN" || role === "DEV")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const centreId = typeof body.centreId === "string" ? body.centreId : null;
  if (!centreId) {
    return NextResponse.json({ error: "centreId required" }, { status: 400 });
  }

  const centre = await prisma.centre.findUnique({ where: { id: centreId } });
  if (!centre) return NextResponse.json({ error: "Unknown centre" }, { status: 404 });

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_CENTRE_COOKIE, centreId, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return NextResponse.json({ ok: true, activeCentreId: centreId });
}
