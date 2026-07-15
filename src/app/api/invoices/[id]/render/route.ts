// Render an Invoice into its template-faithful XLSX (or DOCX→PDF if we
// ever need a printed format — for now XLSX only since the source is
// invoice-template Excel files).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, assertCentreScope } from "@/lib/api-auth";
import {
  INVOICE_TEMPLATE_LINE_LIMIT,
  renderInvoice,
  type InvoiceLineCommon,
} from "@/lib/templates/xlsx";
import type { InvoiceFlavor } from "@/lib/templates/keys";
import { phiHeaders } from "@/lib/responses";
import { formatAddress, parseAddress } from "@/lib/address";
import { amountInWordsInr } from "@/lib/revenue/amount-in-words";
import { formatPatientName } from "@/lib/patient-display";

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
      payments: { orderBy: { paymentDate: "desc" } },
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

  const paymentDisplay = paymentSummary(
    invoice.payments.map((p) => ({ method: p.method, reference: p.reference })),
  );

  let buf: Buffer;
  try {
    buf = await renderInvoice({
      flavor:
        flavor === "products"
          ? "products"
          : flavor === "manual"
            ? "manual"
            : invoice.invoiceType === "PROFORMA"
              ? "proforma"
              : "services",
      centreName: invoice.centre?.name ?? "Movement By Design",
      centreAddress: formatAddress(parseAddress(invoice.centre?.address)),
      centrePhone: invoice.centre?.contactPhone,
      centreGstNumber: invoice.centre?.gstNumber,
      centrePanNumber: invoice.centre?.panNumber,
      clientName: formatPatientName(invoice.client),
      clientAddress: formatAddress(parseAddress(invoice.client.address)),
      clientGstNumber: invoice.client.gstNumber,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.createdAt,
      validTill: invoice.validTill ?? undefined,
      referredBy: invoice.referredBy ?? undefined,
      lineItems: renderedLines,
      additionalDiscountPercent: invoice.discountPercent || undefined,
      totalGst: invoice.totalGst,
      cgstAmount: invoice.cgstAmount,
      sgstAmount: invoice.sgstAmount,
      igstAmount: invoice.igstAmount,
      totalAmount: invoice.totalAmount,
      amountInWords: amountInWordsInr(invoice.totalAmount),
      paidBy: paymentDisplay.method,
      txnId: paymentDisplay.reference,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("line items") && message.includes("template only supports")) {
      return NextResponse.json(
        {
          error: "invoice_template_line_limit",
          message: `This invoice has too many line items to fit the template. Split it into invoices with ${INVOICE_TEMPLATE_LINE_LIMIT} or fewer lines.`,
        },
        { status: 400 },
      );
    }
    throw err;
  }

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: phiHeaders({
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: `invoice-${invoice.invoiceNumber.replace(/\//g, "-")}.xlsx`,
    }),
  });
}

function paymentSummary(payments: Array<{ method: string; reference: string | null }>): {
  method?: string;
  reference?: string;
} {
  if (payments.length === 0) return {};
  const methods = Array.from(new Set(payments.map((p) => p.method).filter(Boolean)));
  const refs = Array.from(new Set(payments.map((p) => p.reference).filter(Boolean))) as string[];
  return {
    method: methods.length === 1 ? methods[0]! : "Multiple",
    reference: refs.length === 0 ? undefined : refs.length === 1 ? refs[0]! : "Multiple",
  };
}

function parseLineItems(json: string): LineItem[] {
  try {
    const out = JSON.parse(json);
    return Array.isArray(out) ? (out as LineItem[]) : [];
  } catch {
    return [];
  }
}
