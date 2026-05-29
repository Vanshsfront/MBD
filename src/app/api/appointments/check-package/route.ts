// POST — Given { clientId, serviceId }, return any active Package(s) for
// that patient whose serviceMix includes the service AND still has
// sessions remaining. The booking dialog uses this to surface the
// "Use 1 session from package?" prompt.
//
// Active = status=ACTIVE, validFrom <= now < validUntil, and
// remainingForService > 0 (count - consumed for the matching serviceMix
// entry; legacy rows without `consumed` default-coalesce to 0).

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, type Role } from "@/lib/permissions";

const bodySchema = z.object({
  clientId: z.string().min(1),
  serviceId: z.string().min(1),
});

interface ServiceMixEntry {
  serviceId?: string;
  serviceName?: string;
  count: number;
  consumed?: number;
}

function parseMix(json: string | null | undefined): ServiceMixEntry[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (e): e is ServiceMixEntry => e && typeof e === "object" && typeof e.count === "number",
    );
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role as Role;
  if (!hasPermission(role, "billing:view_packages")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { clientId, serviceId } = parsed.data;

  const now = new Date();
  const candidates = await prisma.package.findMany({
    where: {
      clientId,
      status: "ACTIVE",
      validFrom: { lte: now },
      validUntil: { gte: now },
    },
    select: {
      id: true,
      totalSessions: true,
      completedSessions: true,
      validUntil: true,
      serviceMix: true,
    },
  });

  const activePackages = candidates
    .map((pkg) => {
      const mix = parseMix(pkg.serviceMix);
      const match = mix.find((e) => e.serviceId === serviceId);
      if (!match) return null;
      const consumed = match.consumed ?? 0;
      const remainingForService = Math.max(0, match.count - consumed);
      if (remainingForService === 0) return null;
      return {
        id: pkg.id,
        totalSessions: pkg.totalSessions,
        completedSessions: pkg.completedSessions,
        remainingForService,
        validUntil: pkg.validUntil.toISOString(),
        serviceName: match.serviceName ?? null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({ activePackages });
}
