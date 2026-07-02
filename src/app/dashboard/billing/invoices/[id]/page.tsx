import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/utils";
import { RecordPaymentForm } from "./record-payment-form";
import { SharePortalButton } from "@/app/dashboard/patients/[id]/share-portal-button";

export const metadata = { title: "Invoice — MBD Clinic OS" };

interface LineItem {
  service?: string;
  product?: string;
  consultantName?: string | null;
  hsnSac?: string | null;
  qty: number;
  perAmount: number;
  lineDiscount?: number;
  gstRate?: number;
  lineTotal?: number;
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "billing:view_invoices")) redirect("/dashboard");

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: true,
      payments: { orderBy: { paymentDate: "desc" } },
      promotion: { select: { code: true, name: true } },
    },
  });
  if (!invoice) notFound();

  const lineItems = parseLineItems(invoice.lineItems);
  const canRecordPayment =
    hasPermission(session.user.role, "billing:record_payment") &&
    invoice.status !== "CANCELLED" &&
    invoice.paidAmount < invoice.totalAmount;

  const remaining = Math.max(0, invoice.totalAmount - invoice.paidAmount);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold">{invoice.invoiceNumber}</h1>
          <p className="text-sm text-muted-foreground">
            <Link
              href={`/dashboard/patients/${invoice.clientId}`}
              className="underline-offset-4 hover:underline"
            >
              {invoice.client.firstName} {invoice.client.lastName} ({invoice.client.clientCode})
            </Link>{" "}
            · {invoice.invoiceFlavor} · {new Date(invoice.createdAt).toLocaleString("en-IN")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={
              invoice.status === "PAID"
                ? "success"
                : invoice.status === "OVERDUE"
                  ? "danger"
                  : invoice.status === "PARTIAL"
                    ? "warning"
                    : "info"
            }
          >
            {invoice.status}
          </Badge>
          {invoice.invoiceType === "PROFORMA" && (
            <SharePortalButton clientId={invoice.clientId} />
          )}
          <a
            href={`/api/invoices/${invoice.id}/render`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
          >
            Download XLSX
          </a>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Line items</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Service / Product</th>
                    <th className="px-4 py-2 text-left">Consultant</th>
                    <th className="px-4 py-2 text-right">Qty</th>
                    <th className="px-4 py-2 text-right">Rate</th>
                    <th className="px-4 py-2 text-right">GST</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lineItems.map((li, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2">{li.service ?? li.product ?? "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{li.consultantName ?? "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{li.qty}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatINR(li.perAmount)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {((li.gstRate ?? 0) * 100).toFixed(0)}%
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatINR(li.lineTotal ?? li.qty * li.perAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30">
                  <tr>
                    <td colSpan={5} className="px-4 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                      Subtotal
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatINR(invoice.subtotal)}</td>
                  </tr>
                  {invoice.discountAmount > 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                        Discount ({invoice.discountPercent}%)
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        − {formatINR(invoice.discountAmount)}
                      </td>
                    </tr>
                  ) : null}
                  {invoice.promotion ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                        Promo {invoice.promotion.code}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        − {formatINR(invoice.promotionDiscount)}
                      </td>
                    </tr>
                  ) : null}
                  <tr>
                    <td colSpan={5} className="px-4 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                      GST
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatINR(invoice.totalGst)}</td>
                  </tr>
                  <tr className="font-medium">
                    <td colSpan={5} className="px-4 py-3 text-right">
                      Total
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatINR(invoice.totalAmount)}
                    </td>
                  </tr>
                  {invoice.paidAmount > 0 ? (
                    <tr className="text-green-700">
                      <td colSpan={5} className="px-4 py-2 text-right">
                        Paid
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatINR(invoice.paidAmount)}
                      </td>
                    </tr>
                  ) : null}
                  {remaining > 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                        Balance
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatINR(remaining)}</td>
                    </tr>
                  ) : null}
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {canRecordPayment ? (
            <RecordPaymentForm invoiceId={invoice.id} remaining={remaining} />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {invoice.payments.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No payments recorded yet.</p>
              ) : (
                <ul className="divide-y">
                  {invoice.payments.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 text-sm">
                      <div>
                        <p>{p.method}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(p.paymentDate).toLocaleString("en-IN")}
                          {p.reference ? ` · ${p.reference}` : ""}
                        </p>
                      </div>
                      <span className="tabular-nums">{formatINR(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function parseLineItems(json: string): LineItem[] {
  try {
    const out = JSON.parse(json);
    return Array.isArray(out) ? (out as LineItem[]) : [];
  } catch {
    return [];
  }
}
