import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { activeCentreId } from "@/lib/centre";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/utils";
import { nativeControlClass } from "@/lib/select-styles";

export const metadata = { title: "By referral source — MBD Clinic OS" };

export default async function SourcesReport({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "reports:view")) redirect("/dashboard");

  const sp = await searchParams;
  const now = new Date();
  const from = sp.from ? new Date(sp.from) : new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const to = sp.to ? new Date(sp.to) : now;

  const centreId = await activeCentreId();

  // Sum revenue per referral source by joining MisEntry → Client → ReferralSource.
  const sources = await prisma.referralSource.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      clients: {
        select: { id: true },
      },
    },
  });

  const rows = await Promise.all(
    sources.map(async (s) => {
      const clientIds = s.clients.map((c) => c.id);
      if (clientIds.length === 0) {
        return {
          name: s.name,
          patients: 0,
          revenue: 0,
          paid: 0,
          balance: 0,
        };
      }
      const agg = await prisma.misEntry.aggregate({
        where: {
          ...(centreId ? { centreId } : {}),
          clientId: { in: clientIds },
          invoiceDate: { gte: from, lte: to },
        },
        _sum: { netPayableAmount: true, paidAmount: true, balanceAmount: true },
      });
      return {
        name: s.name,
        patients: clientIds.length,
        revenue: agg._sum.netPayableAmount ?? 0,
        paid: agg._sum.paidAmount ?? 0,
        balance: agg._sum.balanceAmount ?? 0,
      };
    }),
  );

  const totals = rows.reduce(
    (acc, r) => {
      acc.patients += r.patients;
      acc.revenue += r.revenue;
      acc.paid += r.paid;
      return acc;
    },
    { patients: 0, revenue: 0, paid: 0 },
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Revenue by referral source</h1>
        <p className="text-sm text-muted-foreground">
          Where the money is coming from. Helps decide which channels to invest in.
        </p>
      </header>

      <Card>
        <CardContent className="p-4">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <DateInput name="from" defaultValue={toIsoOnly(from)} label="From" />
            <DateInput name="to" defaultValue={toIsoOnly(to)} label="To" />
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
          <CardTitle>By source</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-right">Patients</th>
                  <th className="px-3 py-2 text-right">Revenue</th>
                  <th className="px-3 py-2 text-right">Paid</th>
                  <th className="px-3 py-2 text-right">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.name}>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.patients}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(r.revenue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(r.paid)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {totals.revenue > 0
                        ? `${((r.revenue / totals.revenue) * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30 font-medium">
                <tr>
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.patients}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatINR(totals.revenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatINR(totals.paid)}</td>
                  <td className="px-3 py-2 text-right">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DateInput({
  name,
  defaultValue,
  label,
}: {
  name: string;
  defaultValue: string;
  label: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</label>
      <input
        type="date"
        name={name}
        defaultValue={defaultValue}
        className={nativeControlClass}
      />
    </div>
  );
}

function toIsoOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
