import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    // Build session date filter
    const sessionDateFilter: Record<string, unknown> = {};
    if (dateFrom) sessionDateFilter.gte = new Date(dateFrom);
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      sessionDateFilter.lte = to;
    }

    const sessionWhere: Record<string, unknown> = {
      status: "COMPLETED",
    };
    if (dateFrom || dateTo) {
      sessionWhere.sessionDate = sessionDateFilter;
    }

    // Fetch all completed sessions in range with client and centre
    const sessions = await prisma.session.findMany({
      where: sessionWhere,
      include: {
        client: {
          include: {
            invoices: {
              include: { payments: true },
            },
            centre: true,
          },
        },
        centre: true,
      },
      orderBy: { sessionDate: "desc" },
    });

    // Determine the reference date for "New" vs "Old" patient
    const referenceDate = dateTo ? new Date(dateTo) : new Date();
    const twelveMonthsAgo = new Date(referenceDate);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    // Group sessions by client
    const clientMap = new Map<
      string,
      {
        clientId: string;
        patientName: string;
        centre: string;
        date: string; // Latest session date in range
        patientType: "New" | "Old";
        sessionCount: number;
        amount: number;
        gst: number;
        balance: number;
        previousDues: number;
        clientCreatedAt: Date;
      }
    >();

    for (const s of sessions) {
      const client = s.client;
      const clientId = client.id;
      const centreName =
        s.centre?.name || client.centre?.name || "—";

      if (!clientMap.has(clientId)) {
        // Calculate invoice-level financials for this client
        const invoices = client.invoices || [];

        // Filter invoices relevant to the date range
        const invoiceFilter = dateFrom || dateTo;
        const rangeInvoices = invoiceFilter
          ? invoices.filter((inv) => {
              const invDate = new Date(inv.createdAt);
              if (dateFrom && invDate < new Date(dateFrom)) return false;
              if (dateTo) {
                const to = new Date(dateTo);
                to.setHours(23, 59, 59, 999);
                if (invDate > to) return false;
              }
              return true;
            })
          : invoices;

        // Previous dues: unpaid amount from invoices BEFORE the date range
        const previousInvoices = dateFrom
          ? invoices.filter(
              (inv) => new Date(inv.createdAt) < new Date(dateFrom)
            )
          : [];
        const previousDues = previousInvoices.reduce(
          (sum, inv) => sum + (inv.totalAmount - inv.paidAmount),
          0
        );

        const totalAmount = rangeInvoices.reduce(
          (sum, inv) => sum + inv.subtotal,
          0
        );
        const totalGst = rangeInvoices.reduce(
          (sum, inv) => sum + inv.totalGst,
          0
        );
        const balance = rangeInvoices.reduce(
          (sum, inv) => sum + (inv.totalAmount - inv.paidAmount),
          0
        );

        const patientType =
          new Date(client.createdAt) >= twelveMonthsAgo ? "New" : "Old";

        clientMap.set(clientId, {
          clientId,
          patientName: `${client.firstName} ${client.lastName}`,
          centre: centreName,
          date: new Date(s.sessionDate).toISOString(),
          patientType,
          sessionCount: 0,
          amount: Math.round(totalAmount * 100) / 100,
          gst: Math.round(totalGst * 100) / 100,
          balance: Math.max(0, Math.round(balance * 100) / 100),
          previousDues: Math.max(
            0,
            Math.round(previousDues * 100) / 100
          ),
          clientCreatedAt: client.createdAt,
        });
      }

      const entry = clientMap.get(clientId)!;
      entry.sessionCount += 1;

      // Keep the latest session date
      if (new Date(s.sessionDate) > new Date(entry.date)) {
        entry.date = new Date(s.sessionDate).toISOString();
      }
    }

    const rows = Array.from(clientMap.values()).map(
      ({ clientCreatedAt, ...rest }) => rest
    );

    // Sort by patient name
    rows.sort((a, b) => a.patientName.localeCompare(b.patientName));

    return NextResponse.json(rows);
  } catch (error) {
    console.error("[GET /api/reports/mis]", error);
    return NextResponse.json(
      { error: "Failed to generate MIS report" },
      { status: 500 }
    );
  }
}
