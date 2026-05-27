"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { hasPermission } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  FileSpreadsheet,
  Download,
  Search,
  Building2,
  CalendarDays,
  Lock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { exportToCSV } from "@/lib/csv-export";

interface MISRow {
  srNo: number;
  centre: string;
  date: string;
  rawDate: string;
  patientName: string;
  patientType: string;
  customerType: string;
  referralSource: string;
  consultant: string;
  amount: number;
  discount: number;
  amountBeforeTax: number;
  gstPercent: number;
  gst: number;
  netPayableAmount: number;
  paidAmount: number;
  modeOfPayment: string;
  balanceAmount: number;
  previousDues: number;
  excessAmount: number;
  previousMonthDues: number;
  perSessionAmount: number;
  isBedUsed: string;
  noOfSessions: number;
  packageStartDate: string;
  sessionNo: number;
  department: string;
  services: string;
  type: string;
  enteredBy: string;
  remark1: string;
  remark2: string;
  reference: string;
  invoiceNumber: string;
}

interface CentreSummary {
  centre: string;
  sumAmountBeforeTax: number;
}

interface MISResponse {
  rows: MISRow[];
  centreSummary: CentreSummary[];
  grandTotal: number;
  totalRows: number;
  dateRange: { from: string; to: string };
}

const COLUMNS: Array<{ key: keyof MISRow; label: string; numeric?: boolean; width: number }> = [
  { key: "srNo", label: "Sr. No.", numeric: true, width: 60 },
  { key: "centre", label: "Centre", width: 90 },
  { key: "date", label: "Date", width: 90 },
  { key: "patientName", label: "Patient Name", width: 160 },
  { key: "patientType", label: "Patient", width: 80 },
  { key: "customerType", label: "Source Type", width: 100 },
  { key: "referralSource", label: "Referral", width: 110 },
  { key: "consultant", label: "Consultant", width: 130 },
  { key: "amount", label: "Amount", numeric: true, width: 95 },
  { key: "discount", label: "Discount", numeric: true, width: 85 },
  { key: "amountBeforeTax", label: "Before Tax", numeric: true, width: 100 },
  { key: "gstPercent", label: "GST%", numeric: true, width: 60 },
  { key: "gst", label: "GST", numeric: true, width: 75 },
  { key: "netPayableAmount", label: "Net Payable", numeric: true, width: 100 },
  { key: "paidAmount", label: "Paid", numeric: true, width: 90 },
  { key: "modeOfPayment", label: "Mode", width: 100 },
  { key: "balanceAmount", label: "Balance", numeric: true, width: 85 },
  { key: "previousDues", label: "Prev Dues", numeric: true, width: 90 },
  { key: "excessAmount", label: "Excess", numeric: true, width: 75 },
  { key: "previousMonthDues", label: "Prev Mo Dues", numeric: true, width: 100 },
  { key: "perSessionAmount", label: "Per Sess.", numeric: true, width: 90 },
  { key: "noOfSessions", label: "# Sess.", numeric: true, width: 70 },
  { key: "packageStartDate", label: "Pkg Start", width: 95 },
  { key: "sessionNo", label: "Sess #", numeric: true, width: 65 },
  { key: "department", label: "Department", width: 110 },
  { key: "services", label: "Services", width: 150 },
  { key: "type", label: "Type", width: 80 },
  { key: "enteredBy", label: "Entered By", width: 110 },
  { key: "invoiceNumber", label: "Invoice #", width: 110 },
  { key: "reference", label: "Reference", width: 100 },
];

const NUMERIC_KEYS = COLUMNS.filter((c) => c.numeric).map((c) => c.key);
const PAGE_SIZE = 50;

const fmt = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

export default function MISReportPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role ?? "THERAPIST";

  const [data, setData] = useState<MISResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"detail" | "summary">("detail");
  const [page, setPage] = useState(1);

  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(today());

  const allowed = hasPermission(userRole, "reports:mis");

  const fetchReport = () => {
    setLoading(true);
    fetch(`/api/mis?dateFrom=${dateFrom}&dateTo=${dateTo}`)
      .then((r) => r.json())
      .then((d: MISResponse) => {
        setData(d);
        setPage(1);
        setLoading(false);
      })
      .catch(() => {
        toast.error("Failed to load MIS report");
        setLoading(false);
      });
  };

  useEffect(() => {
    if (allowed) fetchReport();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    if (!searchQuery) return data.rows;
    const q = searchQuery.toLowerCase();
    return data.rows.filter(
      (r) =>
        r.patientName.toLowerCase().includes(q) ||
        r.consultant.toLowerCase().includes(q) ||
        r.services.toLowerCase().includes(q) ||
        r.invoiceNumber?.toLowerCase().includes(q) ||
        r.centre.toLowerCase().includes(q) ||
        r.referralSource.toLowerCase().includes(q)
    );
  }, [data, searchQuery]);

  const totals = useMemo(() => {
    const result: Record<string, number> = {};
    for (const key of NUMERIC_KEYS) {
      result[key] = filteredRows.reduce(
        (sum, r) => sum + (Number(r[key]) || 0),
        0
      );
    }
    return result;
  }, [filteredRows]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredRows, page]
  );

  const handleExport = () => {
    if (!filteredRows.length) return;
    const csvColumns = COLUMNS.map((col) => ({
      header: col.label,
      accessor: (r: MISRow) => r[col.key],
    }));
    exportToCSV(filteredRows, csvColumns, `MBD_MIS_Report_${dateFrom}_to_${dateTo}`);
    toast.success("MIS report exported");
  };

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-text-tertiary">
        <Lock className="h-12 w-12 mb-4" />
        <p className="text-lg font-semibold">Access Restricted</p>
        <p className="text-sm">MIS reports are available to Admin and Owner only.</p>
      </div>
    );
  }

  const totalTableWidth = COLUMNS.reduce((s, c) => s + c.width, 0);

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] max-w-[1600px] mx-auto w-full gap-4">
      {/* Sticky header */}
      <div className="flex flex-col gap-3 shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-text-primary tracking-tight flex items-center gap-3">
              <FileSpreadsheet className="h-7 w-7 text-indigo-600" /> MIS Report
            </h1>
            <p className="text-sm text-text-tertiary">
              Live snapshot — one row per invoice line item, written at billing time.
            </p>
          </div>
          <Button
            onClick={handleExport}
            disabled={!filteredRows.length}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-5 h-10 gap-2"
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>

        {/* Filter row */}
        <div className="bg-surface rounded-xl border border-border-light p-3 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-indigo-600 shrink-0" />
            <div className="flex items-center gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
                  From
                </label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="bg-surface border-border-light text-text-primary h-9 text-sm w-40"
                />
              </div>
              <span className="text-text-tertiary mt-5">—</span>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
                  To
                </label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="bg-surface border-border-light text-text-primary h-9 text-sm w-40"
                />
              </div>
              <Button
                onClick={fetchReport}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm h-9 px-5 mt-5"
              >
                Generate
              </Button>
            </div>
          </div>

          <div className="relative flex-1 md:max-w-md md:ml-auto">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search patient, service, consultant, source..."
              className="pl-9 bg-surface border-border-light text-text-primary h-9 text-sm"
            />
          </div>
        </div>

        {/* Summary chips + tabs */}
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex items-center gap-1 bg-surface px-2 py-1.5 rounded-xl border border-border-light w-fit">
            <button
              onClick={() => setActiveTab("detail")}
              className={`text-[11px] font-semibold uppercase tracking-wider px-4 py-1.5 rounded-lg transition-all ${
                activeTab === "detail"
                  ? "bg-indigo-50 text-indigo-700 border border-indigo-100"
                  : "text-text-tertiary hover:text-text-primary hover:bg-surface-secondary border border-transparent"
              }`}
            >
              Detail
            </button>
            <button
              onClick={() => setActiveTab("summary")}
              className={`text-[11px] font-semibold uppercase tracking-wider px-4 py-1.5 rounded-lg transition-all ${
                activeTab === "summary"
                  ? "bg-indigo-50 text-indigo-700 border border-indigo-100"
                  : "text-text-tertiary hover:text-text-primary hover:bg-surface-secondary border border-transparent"
              }`}
            >
              Centre Summary
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="bg-surface border-border-light text-text-secondary text-xs px-3">
              {filteredRows.length} rows
            </Badge>
            <Badge variant="outline" className="bg-surface border-border-light text-text-secondary text-xs px-3">
              ₹{fmt(totals.amountBeforeTax || 0)} before tax
            </Badge>
            <Badge variant="outline" className="bg-emerald-50 border-emerald-200 text-emerald-700 text-xs px-3">
              ₹{fmt(totals.paidAmount || 0)} paid
            </Badge>
            {totals.balanceAmount > 0 && (
              <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-700 text-xs px-3">
                ₹{fmt(totals.balanceAmount || 0)} outstanding
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="bg-surface rounded-xl flex-1 flex flex-col items-center justify-center gap-4 border border-border-light">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-sm font-semibold text-indigo-700">Loading MIS report...</p>
        </div>
      ) : activeTab === "detail" ? (
        <div className="bg-surface rounded-xl border border-border-light overflow-hidden flex flex-col flex-1 min-h-0">
          {/* Scroll region: vertical scroll for rows, horizontal scroll for columns. Header sticks to top. */}
          <div className="flex-1 overflow-auto">
            <table
              className="text-sm border-collapse"
              style={{ width: totalTableWidth, tableLayout: "fixed" }}
            >
              <thead className="sticky top-0 z-20 bg-surface-secondary shadow-[0_1px_0_0_rgb(229,231,235)]">
                <tr className="bg-amber-50 border-b border-amber-200">
                  {COLUMNS.map((col) => (
                    <th
                      key={`sub-${col.key}`}
                      className={`text-amber-900 font-bold text-[11px] py-2 px-2 whitespace-nowrap ${
                        col.numeric ? "text-right" : "text-left"
                      }`}
                      style={{ width: col.width }}
                    >
                      {col.numeric ? fmt(totals[col.key] || 0) : ""}
                    </th>
                  ))}
                </tr>
                <tr className="bg-surface-secondary border-b border-border-light">
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={`text-text-tertiary font-semibold text-[10px] tracking-wider uppercase py-2.5 px-2 whitespace-nowrap ${
                        col.numeric ? "text-right" : "text-left"
                      }`}
                      style={{ width: col.width }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {pagedRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={COLUMNS.length}
                      className="text-center text-text-tertiary py-16 text-sm"
                    >
                      No data for the selected date range.
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((row, idx) => (
                    <tr
                      key={`${row.invoiceNumber}-${row.srNo}-${idx}`}
                      className="hover:bg-surface-secondary/50 transition-colors"
                    >
                      {COLUMNS.map((col) => (
                        <td
                          key={col.key}
                          className={`py-2 px-2 text-[12px] whitespace-nowrap overflow-hidden text-ellipsis ${
                            col.numeric
                              ? "text-right tabular-nums text-text-primary font-medium"
                              : "text-text-secondary"
                          }`}
                          style={{ width: col.width, maxWidth: col.width }}
                          title={String(row[col.key] ?? "")}
                        >
                          {col.numeric
                            ? fmt(Number(row[col.key]) || 0)
                            : String(row[col.key] ?? "—")}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          <div className="border-t border-border-light bg-surface-secondary/40 px-4 py-2.5 flex items-center justify-between text-xs shrink-0">
            <span className="text-text-tertiary">
              Showing{" "}
              <span className="font-semibold text-text-primary">
                {filteredRows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}
              </span>
              –
              <span className="font-semibold text-text-primary">
                {Math.min(page * PAGE_SIZE, filteredRows.length)}
              </span>{" "}
              of <span className="font-semibold text-text-primary">{filteredRows.length}</span>
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-7 px-2 text-xs"
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <span className="px-3 font-medium text-text-secondary">
                {page} / {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                className="h-7 px-2 text-xs"
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* Centre summary tab */
        <div className="bg-surface rounded-xl border border-border-light overflow-hidden max-w-2xl flex-1">
          <table className="w-full text-sm">
            <thead className="bg-surface-secondary border-b border-border-light">
              <tr>
                <th className="text-left py-3 pl-6 font-semibold text-text-tertiary text-[10px] uppercase tracking-wider">
                  Centre
                </th>
                <th className="text-right py-3 pr-6 font-semibold text-text-tertiary text-[10px] uppercase tracking-wider">
                  Sum of Amount Before Tax
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {data?.centreSummary.map((cs) => (
                <tr
                  key={cs.centre}
                  className="hover:bg-surface-secondary/50 transition-colors"
                >
                  <td className="py-3 pl-6">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-indigo-500" />
                      <span className="text-sm font-semibold text-text-primary">
                        {cs.centre}
                      </span>
                    </div>
                  </td>
                  <td className="text-right pr-6 text-sm font-bold text-text-primary tabular-nums py-3">
                    ₹{fmt(cs.sumAmountBeforeTax)}
                  </td>
                </tr>
              ))}
              <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                <td className="py-3 pl-6">
                  <span className="text-sm font-bold text-indigo-900">Grand Total</span>
                </td>
                <td className="text-right pr-6 text-sm font-bold text-indigo-900 tabular-nums py-3">
                  ₹{fmt(data?.grandTotal || 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
