import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { activeCentreId } from "@/lib/centre";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/utils";
import { nativeControlClass } from "@/lib/select-styles";

export const metadata = { title: "MIS dashboard — MBD Clinic OS" };

interface SearchParams {
  from?: string;
  to?: string;
  type?: string;
}

export default async function MisReportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "reports:mis")) redirect("/dashboard");
  const canExport = hasPermission(session.user.role, "reports:export_csv");

  const sp = await searchParams;
  const now = new Date();
  const fromDefault = new Date(now.getFullYear(), now.getMonth(), 1);
  const toDefault = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  // Validate URL params — a malformed ?from=garbage produces Invalid Date and
  // silently returns nothing; an absurd range like ?from=1900 would scan the
  // table. Both classes are bounded here.
  const parsedFrom = sp.from ? new Date(sp.from) : fromDefault;
  const parsedTo = sp.to ? new Date(sp.to) : toDefault;
  const safeFrom = Number.isNaN(parsedFrom.getTime()) ? fromDefault : parsedFrom;
  const safeTo = Number.isNaN(parsedTo.getTime()) ? toDefault : parsedTo;
  // Cap the range at 3 years (covers FY-spanning audits without table scans).
  const MAX_RANGE_DAYS = 3 * 366;
  const rangeMs = safeTo.getTime() - safeFrom.getTime();
  const cappedFrom =
    rangeMs > MAX_RANGE_DAYS * 86_400_000
      ? new Date(safeTo.getTime() - MAX_RANGE_DAYS * 86_400_000)
      : safeFrom;
  const from = cappedFrom;
  const to = safeTo;
  const typeFilter = sp.type && sp.type !== "all" ? sp.type : null;

  // Honor the centre-switcher cookie (PRD §6.10) for OWNER/DEV; falls back to
  // session.user.centreId for everyone else.
  const centreId = await activeCentreId();

  const rows = await prisma.misEntry.findMany({
    where: {
      ...(centreId ? { centreId } : {}),
      invoiceDate: { gte: from, lte: to },
      ...(typeFilter ? { type: typeFilter } : {}),
    },
    orderBy: { invoiceDate: "desc" },
    take: 500,
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.amount += r.amount;
      acc.gst += r.gst;
      acc.netPayable += r.netPayableAmount;
      acc.paid += r.paidAmount;
      acc.balance += r.balanceAmount;
      return acc;
    },
    { amount: 0, gst: 0, netPayable: 0, paid: 0, balance: 0 },
  );

  const byType = new Map<string, { count: number; net: number; paid: number }>();
  for (const r of rows) {
    const t = r.type ?? "Clinic";
    const cur = byType.get(t) ?? { count: 0, net: 0, paid: 0 };
    cur.count += 1;
    cur.net += r.netPayableAmount;
    cur.paid += r.paidAmount;
    byType.set(t, cur);
  }

  const fromIso = toLocalIsoDate(from);
  const toIso = toLocalIsoDate(to);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">MIS dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Daily revenue + payment ledger. {rows.length} row{rows.length === 1 ? "" : "s"} in range.
        </p>
      </header>

      <Card>
        <CardContent className="p-4">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">
                From
              </label>
              <input
                type="date"
                name="from"
                defaultValue={fromIso}
                className={nativeControlClass}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">To</label>
              <input
                type="date"
                name="to"
                defaultValue={toIso}
                className={nativeControlClass}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">Type</label>
              <select
                name="type"
                defaultValue={typeFilter ?? "all"}
                className={nativeControlClass}
              >
                <option value="all">All</option>
                <option value="Clinic">Clinic</option>
                <option value="Gym">Gym</option>
                <option value="Online">Online</option>
                <option value="HomeVisit">Home visit</option>
                <option value="Product">Product</option>
              </select>
            </div>
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Apply
            </button>
            {canExport ? (
              <a
                href={`/api/reports/mis-csv?from=${fromIso}&to=${toIso}${typeFilter ? `&type=${typeFilter}` : ""}`}
                className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-accent"
              >
                Export CSV
              </a>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Type summary (Sheet 2)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-right">Rows</th>
                  <th className="px-4 py-2 text-right">Net payable</th>
                  <th className="px-4 py-2 text-right">Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {byType.size === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-center text-muted-foreground">
                      No rows in range.
                    </td>
                  </tr>
                ) : (
                  Array.from(byType.entries()).map(([t, agg]) => (
                    <tr key={t}>
                      <td className="px-4 py-2">{t}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{agg.count}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatINR(agg.net)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatINR(agg.paid)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-muted/30 font-medium">
                <tr>
                  <td className="px-4 py-2">Total</td>
                  <td className="px-4 py-2 text-right tabular-nums">{rows.length}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatINR(totals.netPayable)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatINR(totals.paid)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sheet 1 — line items (31 columns)</CardTitle>
          <p className="text-xs text-muted-foreground">
            Scroll horizontally for the full set. CSV export is byte-equivalent.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/40 uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Centre</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Invoice #</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Inv. type</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Date</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Patient</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Pat. type</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Customer</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Referral</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Consultant</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Service</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Department</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Type</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Amount</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Discount</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Pre-tax</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">GST %</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">GST</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Net</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Per-session</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Sessions</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Session #</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Pkg start</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Prev. dues</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Prev. mo. dues</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Paid</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Balance</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Excess</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Mode</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Reference</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Bed?</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={31} className="px-3 py-4 text-center text-muted-foreground">
                      No MIS rows in range.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap px-3 py-2">{r.centreName}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono">{r.invoiceNumber}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.invoiceType}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {r.invoiceDate.toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                        })}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{r.patientName}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.patientType}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.customerType ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.referralSourceName ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.consultant ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.service ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.department ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.type}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatINR(r.amount)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatINR(r.discount)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatINR(r.amountBeforeTax)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{r.gstPercent}%</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatINR(r.gst)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatINR(r.netPayableAmount)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatINR(r.perSessionAmount)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{r.noOfSessions}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{r.sessionNo}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {r.packageStartDate
                          ? r.packageStartDate.toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                            })
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatINR(r.previousDues)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatINR(r.previousMonthDues)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatINR(r.paidAmount)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatINR(r.balanceAmount)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatINR(r.excessAmount)}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.modeOfPayment ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px]">{r.reference ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.isBedUsed}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.remark1 ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
