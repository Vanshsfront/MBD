"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FileSpreadsheet, Download, ArrowLeft, Search, Building2, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { exportToCSV } from "@/lib/csv-export";
import Link from "next/link";

interface MISRow {
  srNo: number;
  centre: string;
  date: string;
  rawDate: string;
  patientName: string;
  patientType: string;
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

const COLUMNS: Array<{ key: keyof MISRow; label: string; numeric?: boolean; width?: string }> = [
  { key: "srNo", label: "Sr. No.", numeric: true, width: "60px" },
  { key: "centre", label: "Centre", width: "80px" },
  { key: "date", label: "Date", width: "90px" },
  { key: "patientName", label: "Patient Name", width: "150px" },
  { key: "patientType", label: "Patient Type", width: "90px" },
  { key: "consultant", label: "Consultant", width: "120px" },
  { key: "amount", label: "Amount", numeric: true, width: "90px" },
  { key: "discount", label: "Discount", numeric: true, width: "80px" },
  { key: "amountBeforeTax", label: "Amt Before Tax", numeric: true, width: "100px" },
  { key: "gstPercent", label: "GST%", numeric: true, width: "55px" },
  { key: "gst", label: "GST", numeric: true, width: "70px" },
  { key: "netPayableAmount", label: "Net Payable", numeric: true, width: "100px" },
  { key: "paidAmount", label: "Paid Amt", numeric: true, width: "90px" },
  { key: "modeOfPayment", label: "Payment Mode", width: "100px" },
  { key: "balanceAmount", label: "Balance", numeric: true, width: "80px" },
  { key: "previousDues", label: "Prev Dues", numeric: true, width: "80px" },
  { key: "excessAmount", label: "Excess", numeric: true, width: "70px" },
  { key: "previousMonthDues", label: "Prev Month Dues", numeric: true, width: "100px" },
  { key: "perSessionAmount", label: "Per Session", numeric: true, width: "90px" },
  { key: "isBedUsed", label: "Bed Used", width: "70px" },
  { key: "noOfSessions", label: "Sessions", numeric: true, width: "70px" },
  { key: "packageStartDate", label: "Pkg Start", width: "90px" },
  { key: "sessionNo", label: "Session #", numeric: true, width: "70px" },
  { key: "department", label: "Department", width: "100px" },
  { key: "services", label: "Services", width: "140px" },
  { key: "type", label: "Type", width: "80px" },
  { key: "enteredBy", label: "Entered By", width: "100px" },
  { key: "remark1", label: "Remark 1", width: "100px" },
  { key: "remark2", label: "Remark 2", width: "80px" },
  { key: "reference", label: "Reference", width: "100px" },
];

const NUMERIC_KEYS = COLUMNS.filter(c => c.numeric).map(c => c.key);

export default function MISReportPage() {
  const [data, setData] = useState<MISResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"detail" | "summary">("detail");

  // Date range — default to current month
  const now = new Date();
  const [dateFrom, setDateFrom] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  );
  const [dateTo, setDateTo] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, "0")}`
  );

  const fetchReport = () => {
    setLoading(true);
    fetch(`/api/mis?dateFrom=${dateFrom}&dateTo=${dateTo}`)
      .then(r => r.json())
      .then((d: MISResponse) => { setData(d); setLoading(false); })
      .catch(() => { toast.error("Failed to load MIS report"); setLoading(false); });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchReport();
    }, 0);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredRows = useMemo(() => {
    if (!data) return [];
    if (!searchQuery) return data.rows;
    const q = searchQuery.toLowerCase();
    return data.rows.filter(r =>
      r.patientName.toLowerCase().includes(q) ||
      r.consultant.toLowerCase().includes(q) ||
      r.services.toLowerCase().includes(q) ||
      r.invoiceNumber?.toLowerCase().includes(q) ||
      r.centre.toLowerCase().includes(q)
    );
  }, [data, searchQuery]);

  // SUBTOTAL row
  const subtotals = useMemo(() => {
    const result: Record<string, number> = {};
    for (const key of NUMERIC_KEYS) {
      result[key] = filteredRows.reduce((sum, r) => sum + (Number(r[key]) || 0), 0);
    }
    return result;
  }, [filteredRows]);

  const handleExport = () => {
    if (!filteredRows.length) return;
    const csvColumns = COLUMNS.map(col => ({
      header: col.label,
      accessor: (r: MISRow) => r[col.key],
    }));
    exportToCSV(filteredRows, csvColumns, `MBD_MIS_Report_${dateFrom}_to_${dateTo}`);
    toast.success("MIS report exported!");
  };

  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6 pb-12 w-full max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/admin" className="text-text-tertiary hover:text-text-primary transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <FileSpreadsheet className="h-8 w-8 text-indigo-600" />
            <h1 className="text-2xl font-semibold text-text-primary tracking-tight">MIS Report</h1>
          </div>
          <p className="text-text-tertiary font-medium ml-8">Movement By Design — Management Information System</p>
        </div>
        <Button onClick={handleExport} disabled={!filteredRows.length} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-5 h-10 shadow-sm gap-2">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Date Filters */}
      <div className="neumorphic-card p-4 flex flex-col md:flex-row items-end gap-4">
        <div className="flex items-center gap-3 flex-1">
          <CalendarDays className="h-5 w-5 text-indigo-600 shrink-0" />
          <div className="flex items-center gap-2">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">From</label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-surface border-border-light text-text-primary h-9 text-sm w-40" />
            </div>
            <span className="text-text-tertiary font-semibold mt-5">—</span>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">To</label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-surface border-border-light text-text-primary h-9 text-sm w-40" />
            </div>
          </div>
          <Button onClick={fetchReport} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm h-9 px-5 mt-5">
            Generate
          </Button>
        </div>

        <div className="relative w-full md:w-64">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search patient, service..." className="pl-9 bg-surface border-border-light text-text-primary h-9 text-sm" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-surface px-2 py-1.5 rounded-xl border border-border-light shadow-sm w-fit">
        <button onClick={() => setActiveTab("detail")} className={`text-[11px] font-semibold uppercase tracking-wider px-4 py-1.5 rounded-lg transition-all ${activeTab === "detail" ? "bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100" : "text-text-tertiary hover:text-text-primary hover:bg-surface-secondary border border-transparent"}`}>
          Detail View
        </button>
        <button onClick={() => setActiveTab("summary")} className={`text-[11px] font-semibold uppercase tracking-wider px-4 py-1.5 rounded-lg transition-all ${activeTab === "summary" ? "bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100" : "text-text-tertiary hover:text-text-primary hover:bg-surface-secondary border border-transparent"}`}>
          Centre Summary
        </button>
        {data && (
          <Badge className="bg-surface-secondary text-text-secondary font-bold border-none shadow-none text-xs px-2.5 ml-2">
            {filteredRows.length} ROWS
          </Badge>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="bg-surface rounded-xl py-16 text-center flex flex-col items-center gap-4 border border-border-light shadow-sm">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-sm font-semibold tracking-wide text-indigo-700">Generating MIS Report...</p>
        </div>
      ) : activeTab === "detail" ? (
        /* ── Detail Table ── */
        <div className="bg-surface rounded-xl border border-border-light shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                {/* SUBTOTAL row (matching Excel row 2) */}
                <TableRow className="bg-amber-50 border-b-2 border-amber-200">
                  {COLUMNS.map(col => (
                    <TableHead key={`sub-${col.key}`} className={`text-amber-900 font-bold text-xs py-2 whitespace-nowrap ${col.numeric ? "text-right" : ""}`} style={{ minWidth: col.width }}>
                      {col.numeric ? fmt(subtotals[col.key] || 0) : ""}
                    </TableHead>
                  ))}
                </TableRow>
                {/* Header row */}
                <TableRow className="bg-surface-secondary">
                  {COLUMNS.map(col => (
                    <TableHead key={col.key} className={`text-text-tertiary font-semibold text-[10px] tracking-wider uppercase py-3 whitespace-nowrap ${col.numeric ? "text-right" : ""}`} style={{ minWidth: col.width }}>
                      {col.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border-light">
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={COLUMNS.length} className="text-center text-text-tertiary py-12">
                      No data for the selected date range.
                    </TableCell>
                  </TableRow>
                ) : filteredRows.map((row, idx) => (
                  <TableRow key={idx} className="hover:bg-surface-secondary transition-colors">
                    {COLUMNS.map(col => (
                      <TableCell key={col.key} className={`py-2.5 text-sm whitespace-nowrap ${col.numeric ? "text-right font-medium text-text-primary tabular-nums" : "text-text-secondary"}`} style={{ minWidth: col.width }}>
                        {col.numeric ? fmt(Number(row[col.key]) || 0) : String(row[col.key] ?? "—")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        /* ── Centre Summary ── */
        <div className="bg-surface rounded-xl border border-border-light shadow-sm overflow-hidden max-w-xl">
          <Table>
            <TableHeader>
              <TableRow className="bg-surface-secondary">
                <TableHead className="text-text-tertiary font-semibold text-[10px] tracking-wider uppercase py-3 pl-6">Centre</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-[10px] tracking-wider uppercase py-3 text-right pr-6">Sum of Amount Before Tax</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border-light">
              {data?.centreSummary.map((cs) => (
                <TableRow key={cs.centre} className="hover:bg-surface-secondary transition-colors">
                  <TableCell className="py-3 pl-6">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-indigo-500" />
                      <span className="text-sm font-semibold text-text-primary">{cs.centre}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right pr-6 text-sm font-bold text-text-primary tabular-nums py-3">
                    ₹{fmt(cs.sumAmountBeforeTax)}
                  </TableCell>
                </TableRow>
              ))}
              {/* Grand Total */}
              <TableRow className="bg-indigo-50 border-t-2 border-indigo-200">
                <TableCell className="py-3 pl-6">
                  <span className="text-sm font-bold text-indigo-900">Grand Total</span>
                </TableCell>
                <TableCell className="text-right pr-6 text-sm font-bold text-indigo-900 tabular-nums py-3">
                  ₹{fmt(data?.grandTotal || 0)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
