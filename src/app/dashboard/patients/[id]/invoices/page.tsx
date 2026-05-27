import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/utils";

export const metadata = { title: "Invoices — MBD Clinic OS" };

export default async function PatientInvoicesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "billing:view_invoices")) redirect("/dashboard");

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) notFound();

  const invoices = await prisma.invoice.findMany({
    where: { clientId: id },
    orderBy: { createdAt: "desc" },
    include: { payments: true },
  });

  return (
    <Card>
      <CardContent className="p-0">
        {invoices.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No invoices yet.</p>
        ) : (
          <ul className="divide-y">
            {invoices.map((inv) => (
              <li key={inv.id} className="px-6 py-3">
                <Link
                  href={`/dashboard/billing/invoices/${inv.id}`}
                  className="flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-mono text-sm font-medium">{inv.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {inv.invoiceFlavor} · {new Date(inv.createdAt).toLocaleDateString("en-IN")} ·{" "}
                      {inv.payments.length} payment{inv.payments.length === 1 ? "" : "s"}
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
  );
}
