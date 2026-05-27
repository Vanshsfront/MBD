// CSV export of MIS rows. OWNER + DEV only (PRD §3.1 reports:export_csv).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit";
import { activeCentreId } from "@/lib/centre";

const COLS: Array<{ header: string; pick: (r: Record<string, unknown>) => string }> = [
  { header: "Centre", pick: (r) => str(r.centreName) },
  { header: "Invoice #", pick: (r) => str(r.invoiceNumber) },
  { header: "Invoice type", pick: (r) => str(r.invoiceType) },
  { header: "Invoice date", pick: (r) => toIso(r.invoiceDate as Date) },
  { header: "Patient", pick: (r) => str(r.patientName) },
  { header: "Patient type", pick: (r) => str(r.patientType) },
  { header: "Customer type", pick: (r) => str(r.customerType) },
  { header: "Referral source", pick: (r) => str(r.referralSourceName) },
  { header: "Consultant", pick: (r) => str(r.consultant) },
  { header: "Service", pick: (r) => str(r.service) },
  { header: "Department", pick: (r) => str(r.department) },
  { header: "Type", pick: (r) => str(r.type) },
  { header: "Amount", pick: (r) => num(r.amount) },
  { header: "Discount", pick: (r) => num(r.discount) },
  { header: "Amount before tax", pick: (r) => num(r.amountBeforeTax) },
  { header: "GST %", pick: (r) => num(r.gstPercent) },
  { header: "GST", pick: (r) => num(r.gst) },
  { header: "Net payable", pick: (r) => num(r.netPayableAmount) },
  { header: "Per session", pick: (r) => num(r.perSessionAmount) },
  { header: "Sessions", pick: (r) => num(r.noOfSessions) },
  { header: "Session #", pick: (r) => num(r.sessionNo) },
  { header: "Package start", pick: (r) => toIso(r.packageStartDate as Date | null) },
  { header: "Previous dues", pick: (r) => num(r.previousDues) },
  { header: "Previous month dues", pick: (r) => num(r.previousMonthDues) },
  { header: "Paid amount", pick: (r) => num(r.paidAmount) },
  { header: "Balance amount", pick: (r) => num(r.balanceAmount) },
  { header: "Excess amount", pick: (r) => num(r.excessAmount) },
  { header: "Mode of payment", pick: (r) => str(r.modeOfPayment) },
  { header: "Reference", pick: (r) => str(r.reference) },
  { header: "Bed used", pick: (r) => str(r.isBedUsed) },
  { header: "Remark 1", pick: (r) => str(r.remark1) },
];

export async function GET(req: Request) {
  const auth = await requirePermission("reports:export_csv");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");
  const typeFilter = url.searchParams.get("type");

  const now = new Date();
  const fromDefault = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = fromStr ? new Date(fromStr) : fromDefault;
  const to = toStr ? new Date(toStr) : new Date();

  const centreId = await activeCentreId();
  const rows = await prisma.misEntry.findMany({
    where: {
      ...(centreId ? { centreId } : {}),
      invoiceDate: { gte: from, lte: to },
      ...(typeFilter && typeFilter !== "all" ? { type: typeFilter } : {}),
    },
    orderBy: { invoiceDate: "asc" },
  });

  const csv = [
    COLS.map((c) => csvEscape(c.header)).join(","),
    ...rows.map((r) =>
      COLS.map((c) => csvEscape(c.pick(r as unknown as Record<string, unknown>))).join(","),
    ),
  ].join("\n");

  await createAuditLog({
    action: "EXPORT",
    entity: "Client",
    entityId: "mis-csv",
    performedById: auth.user.id,
    metadata: { from: from.toISOString(), to: to.toISOString(), rows: rows.length, type: typeFilter },
  });

  const filename = `mis-${toIsoOnly(from)}-to-${toIsoOnly(to)}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function str(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function num(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

function toIso(d: Date | null): string {
  if (!d) return "";
  return d.toISOString();
}

function toIsoOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
