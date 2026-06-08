// Render an Invoice into its template-faithful XLSX (or DOCX→PDF if we
// ever need a printed format — for now XLSX only since the source is
// invoice-template Excel files).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, assertCentreScope } from "@/lib/api-auth";
import { renderInvoice, type InvoiceLineCommon } from "@/lib/templates/xlsx";
import type { InvoiceFlavor } from "@/lib/templates/keys";
import { phiHeaders } from "@/lib/responses";

interface LineItem {
  service?: string;
  product?: string;
  consultantName?: string | null;
  notes?: string;
  hsnSac?: string | null;
  qty: number;
  perAmount: number;
  lineDiscount?: number;
  gstRate?: number;
  lineTotal?: number;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("billing:view_invoices");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: true,
      centre: true,
    },
  });
  if (!invoice) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const scope = await assertCentreScope(auth.user, invoice);
  if (scope) return scope;

  const flavor = invoice.invoiceFlavor.toLowerCase() as InvoiceFlavor;
  const lines = parseLineItems(invoice.lineItems);

  const renderedLines: InvoiceLineCommon[] = lines.map((l) => ({
    description: l.service ?? l.product ?? "—",
    notes: l.notes,
    consultant: l.consultantName ?? undefined,
    hsnSac: l.hsnSac ?? undefined,
    qty: l.qty,
    perAmount: l.perAmount,
    lineDiscountFraction: l.lineDiscount ?? 0,
    gstRate: l.gstRate ?? 0,
    lineAmount: l.lineTotal ?? l.qty * l.perAmount,
  }));

  const buf = await renderInvoice({
    flavor: flavor === "products" ? "products" : flavor === "manual" ? "manual" : invoice.invoiceType === "PROFORMA" ? "proforma" : "services",
    centreName: invoice.centre?.name ?? "Movement By Design",
    clientName: `${invoice.client.firstName} ${invoice.client.lastName}`,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.createdAt,
    validTill: invoice.validTill ?? undefined,
    referredBy: invoice.referredBy ?? undefined,
    lineItems: renderedLines,
    additionalDiscountPercent: invoice.discountPercent || undefined,
    totalPaid: invoice.paidAmount,
  });

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: phiHeaders({
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: `invoice-${invoice.invoiceNumber.replace(/\//g, "-")}.xlsx`,
    }),
  });
}

function parseLineItems(json: string): LineItem[] {
  try {
    const out = JSON.parse(json);
    return Array.isArray(out) ? (out as LineItem[]) : [];
  } catch {
    return [];
  }
}
