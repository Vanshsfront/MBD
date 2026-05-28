import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatINR } from "@/lib/utils";

export const metadata = { title: "Payments — MBD Clinic OS" };

export default async function PaymentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "billing:view_payments")) redirect("/dashboard");

  const payments = await prisma.payment.findMany({
    orderBy: { paymentDate: "desc" },
    take: 100,
    include: {
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          totalAmount: true,
          client: { select: { firstName: true, lastName: true, clientCode: true } },
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">
          Record payments inside an individual invoice. This is a read-only feed of recent activity.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Recent ({payments.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No payments yet"
                description="Open an invoice and click Record payment to log one. Recent payments will appear here."
              />
            </div>
          ) : (
            <ul className="divide-y">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {p.invoice.client.firstName} {p.invoice.client.lastName}{" "}
                      <span className="text-muted-foreground">({p.invoice.client.clientCode})</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <Link
                        href={`/dashboard/billing/invoices/${p.invoice.id}`}
                        className="font-mono underline-offset-4 hover:underline"
                      >
                        {p.invoice.invoiceNumber}
                      </Link>{" "}
                      · {p.method}
                      {p.reference ? ` · ${p.reference}` : ""} ·{" "}
                      {new Date(p.paymentDate).toLocaleString("en-IN")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums">{formatINR(p.amount)}</span>
                    <Badge variant={p.invoice.status === "PAID" ? "success" : "info"}>
                      {p.invoice.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
