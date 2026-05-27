import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — patients grouped by referredBy source.
// Query params:
//   source=<name> to filter to one source (returns full client list)
//   otherwise returns counts per source + counts of unassigned
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sourceFilter = searchParams.get("source");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Record<string, unknown> = {};
    if (sourceFilter) {
      where.referredBy = sourceFilter === "__unassigned__" ? null : sourceFilter;
    }
    if (startDate || endDate) {
      const dateFilter: Record<string, unknown> = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
      where.createdAt = dateFilter;
    }

    if (sourceFilter) {
      const clients = await prisma.client.findMany({
        where,
        select: {
          id: true,
          clientCode: true,
          firstName: true,
          lastName: true,
          phone: true,
          referredBy: true,
          createdAt: true,
          status: true,
        },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ source: sourceFilter, count: clients.length, clients });
    }

    // Aggregate counts per source
    const allClients = await prisma.client.findMany({
      where,
      select: { referredBy: true },
    });
    const counts = new Map<string, number>();
    for (const c of allClients) {
      const key = c.referredBy || "Unknown / Unassigned";
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const sources = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ total: allClients.length, sources });
  } catch (error) {
    console.error("[GET /api/reports/sources]", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
