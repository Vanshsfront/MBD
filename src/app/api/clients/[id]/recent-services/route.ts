// Recent billable services for a patient (PRD §6 punchlist #5 — the "Recent"
// tab of the invoice line picker). Pulls service IDs from this patient's past
// invoice line items AND their consultation recommendations, most-recent-first,
// de-duplicated, then resolves them against the live Service catalogue (so the
// price/GST shown is current). Capped at 10.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";

interface RecentSource {
  date: Date;
  serviceIds: string[];
}

function parseServiceIds(json: string | null): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as Array<{ serviceId?: unknown }>;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => (typeof x.serviceId === "string" ? x.serviceId : null))
      .filter((x): x is string => Boolean(x));
  } catch {
    return [];
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("billing:create_edit_invoice");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const [invoices, consultations] = await Promise.all([
    prisma.invoice.findMany({
      where: { clientId: id },
      orderBy: { createdAt: "desc" },
      select: { lineItems: true, createdAt: true },
      take: 30,
    }),
    prisma.consultation.findMany({
      where: { clientId: id, recommendedServicesJson: { not: null } },
      orderBy: { date: "desc" },
      select: { recommendedServicesJson: true, date: true },
      take: 30,
    }),
  ]);

  const sources: RecentSource[] = [
    ...invoices.map((i) => ({ date: i.createdAt, serviceIds: parseServiceIds(i.lineItems) })),
    ...consultations.map((c) => ({ date: c.date, serviceIds: parseServiceIds(c.recommendedServicesJson) })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  // De-dupe, preserving most-recent-first order.
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    for (const sid of s.serviceIds) {
      if (!seen.has(sid)) {
        seen.add(sid);
        ordered.push(sid);
      }
    }
  }
  const top = ordered.slice(0, 10);
  if (top.length === 0) return NextResponse.json({ services: [] });

  const rows = await prisma.service.findMany({
    where: { id: { in: top }, isActive: true },
    select: {
      id: true,
      name: true,
      basePrice: true,
      gstRate: true,
      hsnSacCode: true,
      participantCount: true,
      department: { select: { name: true } },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  // Return in recency order (drop any that are now inactive/deleted).
  const services = top
    .map((sid) => byId.get(sid))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      id: r.id,
      name: r.name,
      basePrice: r.basePrice,
      gstRate: r.gstRate,
      hsnSac: r.hsnSacCode ?? "",
      participantCount: r.participantCount,
      department: r.department?.name ?? null,
    }));

  return NextResponse.json({ services });
}
