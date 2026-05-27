// Package management — PRD §8 / Phase 7. Centre-scoped list with
// expiring-soon highlight + status filter.

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { activeCentreId } from "@/lib/centre";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/utils";
import { nativeControlClass } from "@/lib/select-styles";

export const metadata = { title: "Packages — MBD Clinic OS" };

const EXPIRING_SOON_DAYS = 14;

interface SearchParams {
  status?: string;
  expiringOnly?: string;
}

export default async function PackagesListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "billing:view_packages")) redirect("/dashboard");

  const sp = await searchParams;
  const statusFilter = sp.status && sp.status !== "all" ? sp.status : null;
  const expiringOnly = sp.expiringOnly === "1";

  const centreId = await activeCentreId();
  const today = new Date();
  const soonCutoff = new Date(today.getTime() + EXPIRING_SOON_DAYS * 24 * 3600_000);

  const packages = await prisma.package.findMany({
    where: {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(expiringOnly
        ? {
            status: "ACTIVE",
            validUntil: { gte: today, lte: soonCutoff },
          }
        : {}),
      // Centre via the client. Package itself doesn't carry centreId; scope
      // via Client.centreId so a multi-clinic OWNER sees the right list.
      client: centreId ? { centreId } : undefined,
    },
    orderBy: [{ status: "asc" }, { validUntil: "asc" }],
    take: 200,
    include: {
      client: {
        select: { id: true, firstName: true, lastName: true, clientCode: true },
      },
      invoices: {
        select: { id: true, invoiceNumber: true, status: true, totalAmount: true },
      },
    },
  });

  const expiringCount = packages.filter(
    (p) => p.status === "ACTIVE" && p.validUntil <= soonCutoff && p.validUntil >= today,
  ).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Packages</h1>
          <p className="text-sm text-muted-foreground">
            {packages.length} package{packages.length === 1 ? "" : "s"} in this centre.{" "}
            {expiringCount > 0 ? (
              <span className="text-amber-600 dark:text-amber-400">
                {expiringCount} expiring within {EXPIRING_SOON_DAYS} days.
              </span>
            ) : null}
          </p>
        </div>
      </header>

      <Card>
        <CardContent className="p-4">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">Status</label>
              <select
                name="status"
                defaultValue={sp.status ?? "all"}
                className={nativeControlClass}
              >
                <option value="all">All</option>
                <option value="ACTIVE">Active</option>
                <option value="EXPIRED">Expired</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="expiringOnly"
                value="1"
                defaultChecked={expiringOnly}
              />
              Expiring within {EXPIRING_SOON_DAYS} days
            </label>
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Apply
            </button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Packages</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {packages.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">No packages match.</p>
          ) : (
            <ul className="divide-y">
              {packages.map((p) => {
                const remaining = p.totalSessions - p.completedSessions;
                const daysLeft = Math.round(
                  (p.validUntil.getTime() - today.getTime()) / (24 * 3600_000),
                );
                const expiringSoon =
                  p.status === "ACTIVE" && daysLeft >= 0 && daysLeft <= EXPIRING_SOON_DAYS;
                return (
                  <li key={p.id} className="px-6 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
                      <div>
                        <p className="font-medium">
                          <Link
                            href={`/dashboard/patients/${p.client.id}/packages`}
                            className="hover:underline"
                          >
                            {p.client.firstName} {p.client.lastName}
                          </Link>{" "}
                          <span className="text-muted-foreground">
                            ({p.client.clientCode})
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.completedSessions}/{p.totalSessions} sessions used
                          {remaining > 0 ? ` · ${remaining} remaining` : ""} · valid till{" "}
                          {p.validUntil.toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                          {p.status === "ACTIVE" && daysLeft >= 0
                            ? ` · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums text-xs">
                          {formatINR(p.totalPrice)}
                        </span>
                        {expiringSoon ? (
                          <Badge variant="warning">expiring soon</Badge>
                        ) : null}
                        <Badge variant={p.status === "ACTIVE" ? "success" : "default"}>
                          {p.status}
                        </Badge>
                        {p.invoices.length > 0 ? (
                          <Link
                            href={`/dashboard/billing/invoices/${p.invoices[0]!.id}`}
                            className="rounded-md border px-2 py-1 text-[11px] hover:bg-accent"
                          >
                            {p.invoices[0]!.invoiceNumber}
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
