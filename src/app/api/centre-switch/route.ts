// POST { centreId: string | null } — set or clear the centre override cookie.

import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { canSwitch, CENTRE_COOKIE } from "@/lib/centre";
import type { Role } from "@/lib/permissions";

const schema = z.object({
  centreId: z.string().min(1).nullable(),
});

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  if (!canSwitch(auth.user.role as Role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as unknown;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const jar = await cookies();
  if (parsed.data.centreId === null) {
    jar.delete(CENTRE_COOKIE);
    return NextResponse.json({ ok: true, centreId: auth.user.centreId });
  }

  // Verify the centre exists.
  const centre = await prisma.centre.findUnique({
    where: { id: parsed.data.centreId },
    select: { id: true, slug: true, name: true, isActive: true },
  });
  if (!centre || !centre.isActive) {
    return NextResponse.json({ error: "centre_not_found" }, { status: 404 });
  }

  jar.set(CENTRE_COOKIE, centre.id, {
    httpOnly: false, // readable client-side for the switcher button label
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });

  return NextResponse.json({ ok: true, centreId: centre.id, slug: centre.slug, name: centre.name });
}
