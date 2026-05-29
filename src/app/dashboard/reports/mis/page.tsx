// MIS dashboard — Journey E2.
// Layout follows the 2026-05-29 Claude Design handoff
// (mbd/project/mbd/reports-misc.jsx — MIS):
//   - Filter bar: From / To / Type / density toggle / Apply / Export
//   - 5-card summary row: Gross billed, GST, Net payable, Paid, Outstanding
//   - Dense .tbl table with density toggle (compact/comfortable rows)
//   - Footer total row with subtotals for each numeric column

import { redirect } from "next/navigation";
import Link from "next/link";
import { Download } from "lucide-react";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { activeCentreId } from "@/lib/centre";
import { Card } from "@/components/ui/card";
import { formatINR } from "@/lib/utils";
import { nativeControlClass } from "@/lib/select-styles";

export const metadata = { title: "MIS dashboard — MBD Clinic OS" };

interface SearchParams {
  from?: string;
  to?: string;
  type?: string;
  density?: string;
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
  const parsedFrom = sp.from ? new Date(sp.from) : fromDefault;
  const parsedTo = sp.to ? new Date(sp.to) : toDefault;
  const safeFrom = Number.isNaN(parsedFrom.getTime()) ? fromDefault : parsedFrom;
  const safeTo = Number.isNaN(parsedTo.getTime()) ? toDefault : parsedTo;
  // 3-year cap covers FY-spanning audits without table scans.
  const MAX_RANGE_DAYS = 3 * 366;
  const rangeMs = safeTo.getTime() - safeFrom.getTime();
  const cappedFrom =
    rangeMs > MAX_RANGE_DAYS * 86_400_000
      ? new Date(safeTo.getTime() - MAX_RANGE_DAYS * 86_400_000)
      : safeFrom;
  const from = cappedFrom;
  const to = safeTo;
  const typeFilter = sp.type && sp.type !== "all" ? sp.type : null;
  const density = sp.density === "comfortable" ? "comfortable" : "compact";

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
      acc.discount += r.discount;
      acc.gst += r.gst;
      acc.netPayable += r.netPayableAmount;
      acc.paid += r.paidAmount;
      acc.balance += r.balanceAmount;
      return acc;
    },
    { amount: 0, discount: 0, gst: 0, netPayable: 0, paid: 0, balance: 0 },
  );

  const fromIso = toLocalIsoDate(from);
  const toIso = toLocalIsoDate(to);
  const csvHref = `/api/reports/mis-csv?from=${fromIso}&to=${toIso}${typeFilter ? `&type=${typeFilter}` : ""}`;
  const switchDensityHref = (next: "compact" | "comfortable") => {
    const params = new URLSearchParams();
    if (sp.from) params.set("from", sp.from);
    if (sp.to) params.set("to", sp.to);
    if (sp.type) params.set("type", sp.type);
    if (next !== "compact") params.set("density", next);
    const q = params.toString();
    return `/dashboard/reports/mis${q ? `?${q}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Reports</p>
          <h1 className="text-2xl font-semibold tracking-tight">MIS dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Daily revenue + payment ledger. {rows.length} row{rows.length === 1 ? "" : "s"} in
            range.
          </p>
        </div>
        {canExport ? (
          <a
            href={csvHref}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[color:var(--border-light)] bg-card px-3 text-sm font-medium hover:bg-secondary"
          >
            <Download className="h-4 w-4" aria-hidden /> Export CSV
          </a>
        ) : null}
      </header>

      <Card>
        <form className="flex flex-wrap items-end gap-3 p-4" method="get">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
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
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              To
            </label>
            <input
              type="date"
              name="to"
              defaultValue={toIso}
              className={nativeControlClass}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Type
            </label>
            <select name="type" defaultValue={typeFilter ?? "all"} className={nativeControlClass}>
              <option value="all">All</option>
              <option value="Clinic">Clinic</option>
              <option value="Gym">Gym</option>
              <option value="Online">Online</option>
              <option value="HomeVisit">Home visit</option>
              <option value="Product">Product</option>
            </select>
          </div>
          {density === "comfortable" ? (
            <input type="hidden" name="density" value="comfortable" />
          ) : null}
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Apply
          </button>
          <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-[color:var(--border)] bg-secondary">
            <Link
              href={switchDensityHref("compact")}
              className={`px-3 py-1.5 text-xs font-medium ${
                density === "compact"
                  ? "bg-card font-semibold text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Compact
            </Link>
            <Link
              href={switchDensityHref("comfortable")}
              className={`px-3 py-1.5 text-xs font-medium ${
                density === "comfortable"
                  ? "bg-card font-semibold text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Comfortable
            </Link>
          </div>
        </form>
      </Card>

      {/* Summary cards — 5-up at lg, 2-up at sm */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard label="Gross billed" value={formatINR(totals.amount)} />
        <SummaryCard label="GST collected" value={formatINR(totals.gst)} muted />
        <SummaryCard label="Net payable" value={formatINR(totals.netPayable)} accent="primary" />
        <SummaryCard label="Paid" value={formatINR(totals.paid)} accent="success" />
        <SummaryCard
          label="Outstanding"
          value={formatINR(Math.max(0, totals.balance))}
          accent={totals.balance > 0 ? "danger" : "muted"}
        />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className={`tbl ${density === "compact" ? "tbl-compact" : ""}`}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice</th>
                <th>Patient</th>
                <th>Service</th>
                <th>Department</th>
                <th>Type</th>
                <th className="num">Amount</th>
                <th className="num">Discount</th>
                <th className="num">GST</th>
                <th className="num">Net</th>
                <th className="num">Paid</th>
                <th className="num">Due</th>
                <th>Mode</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="text-center text-muted-foreground">
                    No MIS rows in range.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="muted tabular">{formatShortDate(r.invoiceDate)}</td>
                    <td className="muted font-mono text-[11.5px]">{r.invoiceNumber}</td>
                    <td>{r.patientName}</td>
                    <td className="muted">{r.service ?? "—"}</td>
                    <td className="muted">{r.department ?? "—"}</td>
                    <td className="muted">{r.type}</td>
                    <td className="num">{formatINR(r.amount)}</td>
                    <td className="num">{r.discount > 0 ? formatINR(r.discount) : "—"}</td>
                    <td className="num">{formatINR(r.gst)}</td>
                    <td className="num">{formatINR(r.netPayableAmount)}</td>
                    <td className="num">
                      {r.paidAmount > 0 ? formatINR(r.paidAmount) : "—"}
                    </td>
                    <td className="num">
                      {r.balanceAmount > 0 ? (
                        <span className="text-[color:var(--danger)]">
                          {formatINR(r.balanceAmount)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="muted">{r.modeOfPayment ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 ? (
              <tfoot>
                <tr style={{ background: "rgba(245,244,242,0.6)", fontWeight: 600 }}>
                  <td colSpan={6}>Total · {rows.length} row{rows.length === 1 ? "" : "s"}</td>
                  <td className="num">{formatINR(totals.amount)}</td>
                  <td className="num">{formatINR(totals.discount)}</td>
                  <td className="num">{formatINR(totals.gst)}</td>
                  <td className="num">{formatINR(totals.netPayable)}</td>
                  <td className="num">{formatINR(totals.paid)}</td>
                  <td className="num">{formatINR(Math.max(0, totals.balance))}</td>
                  <td />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        The 31-column ledger (full PRD §6 columns including session #, package start, previous
        dues, bed-used, remark) is downloaded byte-equivalent via CSV export.
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  muted,
}: {
  label: string;
  value: string;
  accent?: "primary" | "success" | "danger" | "muted";
  muted?: boolean;
}) {
  const valueClass =
    accent === "primary"
      ? "text-[color:var(--primary)]"
      : accent === "success"
        ? "text-[#15683b]"
        : accent === "danger"
          ? "text-[color:var(--danger)]"
          : "text-foreground";
  return (
    <Card>
      <div className="p-4">
        <p className="eyebrow !mb-1">{label}</p>
        <p className={`text-xl font-semibold tabular-nums tracking-tight ${muted ? "text-muted-foreground" : valueClass}`}>
          {value}
        </p>
      </div>
    </Card>
  );
}

function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}
