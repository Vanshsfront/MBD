import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatINR } from "@/lib/utils";
import { activeCentreId } from "@/lib/centre";

export const metadata = { title: "Invoices — MBD Clinic OS" };

// Pull a human summary out of an invoice's lineItems JSON: the service/product
// name (with "+N" when there are more lines) and the first consultant on it.
function invoiceSummary(
  lineItemsJson: string,
  flavor: string,
): { item: string; consultant: string | null } {
  try {
    const lines = JSON.parse(lineItemsJson) as Array<{
      service?: string;
      product?: string;
      consultantName?: string;
    }>;
    if (!Array.isArray(lines) || lines.length === 0) {
      return { item: flavor, consultant: null };
    }
    const names = lines
      .map((l) => l.service ?? l.product)
      .filter((n): n is string => Boolean(n));
    const consultant = lines.map((l) => l.consultantName).find(Boolean) ?? null;
    const item =
      names.length === 0
        ? flavor
        : names.length === 1
          ? names[0]
          : `${names[0]} +${names.length - 1}`;
    return { item, consultant };
  } catch {
    return { item: flavor, consultant: null };
  }
}

function formatInvoiceDate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function InvoiceListPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "billing:view_invoices")) redirect("/dashboard");

  const centreId = await activeCentreId();
  const invoices = await prisma.invoice.findMany({
    where: centreId ? { centreId } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      client: { select: { firstName: true, lastName: true, clientCode: true } },
    },
  });

  const canCreate = hasPermission(session.user.role, "billing:create_edit_invoice");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Most recent first. Click a row to view + record a payment.
          </p>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href="/dashboard/billing/invoices/new">+ New invoice</Link>
          </Button>
        ) : null}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Recent ({invoices.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No invoices yet"
                description="Invoices appear here as you create them. Start with the button above."
                action={
                  canCreate ? (
                    <Button asChild size="sm">
                      <Link href="/dashboard/billing/invoices/new">+ New invoice</Link>
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <ul className="divide-y">
              {invoices.map((inv) => (
                <li key={inv.id}>
                  <Link
                    href={`/dashboard/billing/invoices/${inv.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 transition-colors hover:bg-accent"
                  >
                    {(() => {
                      const { item, consultant } = invoiceSummary(inv.lineItems, inv.invoiceFlavor);
                      return (
                        <div className="min-w-0">
                          {/* Patient / therapist — service is the headline; the
                             invoice number + date are secondary. */}
                          <p className="text-sm font-semibold">
                            {inv.client.firstName} {inv.client.lastName}
                            {consultant ? ` / ${consultant}` : ""}
                            {item ? <span className="font-normal text-muted-foreground"> — {item}</span> : null}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">{inv.invoiceNumber}</p>
                          <p className="text-[11px] text-muted-foreground">{formatInvoiceDate(inv.createdAt)}</p>
                        </div>
                      );
                    })()}
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums">{formatINR(inv.totalAmount)}</span>
                      <Badge
                        variant={
                          inv.status === "PAID"
                            ? "success"
                            : inv.status === "OVERDUE"
                              ? "danger"
                              : inv.status === "PARTIAL"
                                ? "warning"
                                : "info"
                        }
                      >
                        {inv.status}
                      </Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
