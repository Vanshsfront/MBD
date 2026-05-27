import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveCentreId } from "@/lib/active-centre";

// Reads the MIS report from the MisEntry snapshot table. Each row was written
// at the time its source invoice was created, so the report does not depend on
// later edits to invoices. Payment-derived fields are kept fresh by the
// payments route via applyPaymentToMisEntries.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const activeCentreId = await getActiveCentreId();

    const now = new Date();
    const from = dateFrom
      ? new Date(dateFrom)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = dateTo
      ? new Date(dateTo + "T23:59:59")
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const where: Record<string, unknown> = {
      invoiceDate: { gte: from, lte: to },
    };
    if (activeCentreId) where.centreId = activeCentreId;

    const entries = await prisma.misEntry.findMany({
      where,
      orderBy: [{ invoiceDate: "asc" }, { invoiceLineIndex: "asc" }],
    });

    const rows = entries.map((e, idx) => ({
      srNo: idx + 1,
      centre: e.centreName,
      date: new Date(e.invoiceDate).toLocaleDateString("en-IN"),
      rawDate: e.invoiceDate,
      patientName: e.patientName,
      patientType: e.patientType,
      customerType: e.customerType || "—",
      referralSource: e.referralSourceName || "—",
      consultant: e.consultant || "—",
      amount: e.amount,
      discount: e.discount,
      amountBeforeTax: e.amountBeforeTax,
      gstPercent: e.gstPercent,
      gst: e.gst,
      netPayableAmount: e.netPayableAmount,
      paidAmount: e.paidAmount,
      modeOfPayment: e.modeOfPayment || "—",
      balanceAmount: e.balanceAmount,
      previousDues: e.previousDues,
      excessAmount: e.excessAmount,
      previousMonthDues: e.previousMonthDues,
      perSessionAmount: e.perSessionAmount,
      isBedUsed: e.isBedUsed,
      noOfSessions: e.noOfSessions,
      packageStartDate: e.packageStartDate
        ? new Date(e.packageStartDate).toLocaleDateString("en-IN")
        : "—",
      sessionNo: e.sessionNo,
      department: e.department || "—",
      services: e.service || "—",
      type: e.invoiceType,
      enteredBy: e.enteredByName || "—",
      remark1: e.remark1 || "",
      remark2: e.remark2 || "",
      reference: e.reference || "",
      invoiceNumber: e.invoiceNumber,
      invoiceId: e.invoiceId,
    }));

    const centreMap: Record<string, number> = {};
    for (const row of rows) {
      const centre = String(row.centre);
      centreMap[centre] = (centreMap[centre] || 0) + Number(row.amountBeforeTax || 0);
    }
    const centreSummary = Object.entries(centreMap).map(([centre, total]) => ({
      centre,
      sumAmountBeforeTax: Math.round(total * 100) / 100,
    }));
    const grandTotal = centreSummary.reduce((s, c) => s + c.sumAmountBeforeTax, 0);

    return NextResponse.json({
      rows,
      centreSummary,
      grandTotal: Math.round(grandTotal * 100) / 100,
      totalRows: rows.length,
      dateRange: { from: from.toISOString(), to: to.toISOString() },
    });
  } catch (error) {
    console.error("[GET /api/mis]", error);
    return NextResponse.json({ error: "Failed to generate MIS report" }, { status: 500 });
  }
}
