// Invoice list — Journey D6/D7.
// Layout follows the 2026-05-29 Claude Design handoff
// (mbd/project/mbd/billing.jsx — InvoicesList):
//   - Status tab row (All · Paid · Sent · Partial · Overdue · Draft) above
//     the table (URL-driven via ?status=)
//   - Dense table: # · Date · Patient · Flavor · Total · Paid · Due · Status

import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, ArrowRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatINR } from "@/lib/utils";
import { activeCentreId } from "@/lib/centre";

export const metadata = { title: "Invoices — MBD Clinic OS" };

type InvoiceStatus = "PAID" | "SENT" | "PARTIAL" | "OVERDUE" | "DRAFT" | "CANCELLED";

const STATUS_TABS: ReadonlyArray<{ key: string; label: string; status?: InvoiceStatus }> = [
  { key: "all", label: "All" },
  { key: "paid", label: "Paid", status: "PAID" },
  { key: "sent", label: "Sent", status: "SENT" },
  { key: "partial", label: "Partial", status: "PARTIAL" },
  { key: "overdue", label: "Overdue", status: "OVERDUE" },
  { key: "draft", label: "Draft", status: "DRAFT" },
];

export default async function InvoiceListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "billing:view_invoices")) redirect("/dashboard");

  const params = await searchParams;
  const activeTab = STATUS_TABS.find((t) => t.key === (params.status ?? "all")) ?? STATUS_TABS[0]!;

  const centreId = await activeCentreId();

  // Counts per tab so the tab labels show actual numbers. Single groupBy
  // amortised across all six counters (vs six separate count() queries).
  const [invoices, statusCounts, totalCount] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        ...(centreId ? { centreId } : {}),
        ...(activeTab.status ? { status: activeTab.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        invoiceNumber: true,
        invoiceFlavor: true,
        status: true,
        totalAmount: true,
        paidAmount: true,
        createdAt: true,
        client: { select: { firstName: true, lastName: true, clientCode: true } },
      },
    }),
    prisma.invoice.groupBy({
      by: ["status"],
      where: centreId ? { centreId } : {},
      _count: { _all: true },
    }),
    prisma.invoice.count({ where: centreId ? { centreId } : {} }),
  ]);

  const countByStatus = new Map<string, number>(
    statusCounts.map((s) => [s.status, s._count._all]),
  );

  const canCreate = hasPermission(session.user.role, "billing:create_edit_invoice");

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Billing</p>
          <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Most recent first. Click a row to view + record a payment.
          </p>
        </div>
        {canCreate ? (
          <Button asChild size="sm">
            <Link href="/dashboard/billing/invoices/new">
              <Plus className="h-4 w-4" aria-hidden /> New invoice
            </Link>
          </Button>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-1 border-b border-[color:var(--border-light)]">
        {STATUS_TABS.map((t) => {
          const isActive = activeTab.key === t.key;
          const count = t.status ? (countByStatus.get(t.status) ?? 0) : totalCount;
          return (
            <Link
              key={t.key}
              href={t.key === "all" ? "/dashboard/billing/invoices" : `/dashboard/billing/invoices?status=${t.key}`}
              className={`group -mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? "border-[color:var(--text-primary)] font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                  isActive
                    ? "bg-[rgba(26,26,30,0.08)] text-foreground"
                    : "bg-secondary text-[color:var(--text-tertiary)]"
                }`}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      <Card className="overflow-hidden p-0">
        {invoices.length === 0 ? (
          <EmptyState
            title={activeTab.key === "all" ? "No invoices yet" : `No ${activeTab.label.toLowerCase()} invoices`}
            description={
              activeTab.key === "all"
                ? "Invoices appear here as you create them. Start with the button above."
                : "Try a different status tab."
            }
            action={
              canCreate && activeTab.key === "all" ? (
                <Button asChild size="sm">
                  <Link href="/dashboard/billing/invoices/new">+ New invoice</Link>
                </Button>
              ) : undefined
            }
            className="m-4 border-none p-6"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl tbl-compact">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Date</th>
                  <th>Patient</th>
                  <th>Flavor</th>
                  <th className="num">Total</th>
                  <th className="num">Paid</th>
                  <th className="num">Due</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const due = Math.max(0, inv.totalAmount - inv.paidAmount);
                  return (
                    <tr key={inv.id}>
                      <td className="muted font-mono text-[11.5px]">{inv.invoiceNumber}</td>
                      <td className="muted tabular">{formatDate(inv.createdAt)}</td>
                      <td>
                        {inv.client.firstName} {inv.client.lastName}
                      </td>
                      <td className="muted">{inv.invoiceFlavor.toLowerCase()}</td>
                      <td className="num tabular">{formatINR(inv.totalAmount)}</td>
                      <td className="num tabular">
                        {inv.paidAmount > 0 ? formatINR(inv.paidAmount) : "—"}
                      </td>
                      <td className="num tabular">{due > 0 ? formatINR(due) : "—"}</td>
                      <td>
                        <StatusChip status={inv.status as InvoiceStatus} />
                      </td>
                      <td className="num">
                        <Link
                          href={`/dashboard/billing/invoices/${inv.id}`}
                          aria-label={`Open invoice ${inv.invoiceNumber}`}
                          className="inline-flex items-center gap-1 rounded-md border border-[color:var(--border-light)] px-2.5 py-1 text-xs font-medium hover:bg-secondary"
                        >
                          Open <ArrowRight className="h-3 w-3" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function StatusChip({ status }: { status: InvoiceStatus }) {
  switch (status) {
    case "PAID":
      return <span className="chip chip-success">Paid</span>;
    case "OVERDUE":
      return <span className="chip chip-danger">Overdue</span>;
    case "PARTIAL":
      return <span className="chip chip-warning">Partial</span>;
    case "SENT":
      return <span className="chip chip-primary">Sent</span>;
    case "CANCELLED":
      return <span className="chip">Cancelled</span>;
    default:
      return <span className="chip">Draft</span>;
  }
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
