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
                    <div>
                      <p className="font-mono text-sm font-medium">{inv.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {inv.client.firstName} {inv.client.lastName} ({inv.client.clientCode}) ·{" "}
                        {inv.invoiceFlavor}
                      </p>
                    </div>
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
