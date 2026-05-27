"use client";

import { useState } from "react";
import Link from "next/link";
import { useApiCache } from "@/hooks/use-api-cache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exportToCSV } from "@/lib/csv-export";
import { AlertTriangle, Download } from "lucide-react";
import { format, subDays } from "date-fns";

interface DefaulterRow {
  clientId: string;
  clientCode: string;
  name: string;
  phone: string;
  cancelled: number;
  cancelledByPatient: number;
  cancelledByTherapist: number;
  noShow: number;
  total: number;
  lastIncidentAt: string;
}

export default function DefaultersReportPage() {
  const [startDate, setStartDate] = useState(() => format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const url = `/api/reports/defaulters?startDate=${startDate}&endDate=${endDate}`;
  const { data, loading } = useApiCache<{ rows: DefaulterRow[] }>(url);

  const rows = data?.rows ?? [];

  const handleExport = () => {
    exportToCSV(rows, [
      { header: "Code", accessor: r => r.clientCode },
      { header: "Name", accessor: r => r.name },
      { header: "Phone", accessor: r => r.phone },
      { header: "Cancelled by Patient", accessor: r => r.cancelledByPatient },
      { header: "Cancelled by Therapist", accessor: r => r.cancelledByTherapist },
      { header: "No-Show", accessor: r => r.noShow },
      { header: "Total Incidents", accessor: r => r.total },
      { header: "Last Incident", accessor: r => format(new Date(r.lastIncidentAt), "dd MMM yyyy") },
    ], `defaulters-${startDate}-to-${endDate}`);
  };

  return (
    <div className="space-y-6 pb-12 w-full max-w-7xl mx-auto">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary flex items-center gap-3">
          <AlertTriangle className="h-7 w-7 text-amber-600" /> Defaulter Report
        </h1>
        <p className="text-sm text-text-tertiary">Patients ranked by cancellations + no-shows in the selected window.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 bg-surface p-4 rounded-xl border border-border-light">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">From</Label>
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">To</Label>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-9 text-sm" />
        </div>
        <Button onClick={handleExport} variant="outline" size="sm" disabled={rows.length === 0}>
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
      </div>

      <div className="bg-surface rounded-xl border border-border-light shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border-light bg-surface-secondary/50">
              <TableHead className="px-5 py-3 text-xs uppercase">Patient</TableHead>
              <TableHead className="px-3 py-3 text-xs uppercase text-center">Canc. (Patient)</TableHead>
              <TableHead className="px-3 py-3 text-xs uppercase text-center">Canc. (Therapist)</TableHead>
              <TableHead className="px-3 py-3 text-xs uppercase text-center">No-Show</TableHead>
              <TableHead className="px-3 py-3 text-xs uppercase text-center">Total</TableHead>
              <TableHead className="px-5 py-3 text-xs uppercase">Last Incident</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-text-tertiary">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-text-tertiary">No defaulters in this range</TableCell></TableRow>
            ) : rows.map(r => (
              <TableRow key={r.clientId} className="hover:bg-surface-secondary">
                <TableCell className="px-5 py-3">
                  <Link href={`/dashboard/patients/${r.clientId}`} className="font-semibold text-blue-700 hover:underline">{r.name}</Link>
                  <div className="font-mono text-[10px] text-text-tertiary">{r.clientCode} · +91 {r.phone}</div>
                </TableCell>
                <TableCell className="px-3 py-3 text-center font-semibold text-red-600">{r.cancelledByPatient}</TableCell>
                <TableCell className="px-3 py-3 text-center font-semibold text-red-700">{r.cancelledByTherapist}</TableCell>
                <TableCell className="px-3 py-3 text-center font-semibold text-amber-600">{r.noShow}</TableCell>
                <TableCell className="px-3 py-3 text-center">
                  <Badge className={`font-bold ${r.total >= 5 ? "bg-red-50 text-red-700 border border-red-200" : r.total >= 3 ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-yellow-50 text-yellow-700 border border-yellow-200"}`}>
                    {r.total}
                  </Badge>
                </TableCell>
                <TableCell className="px-5 py-3 text-xs">{format(new Date(r.lastIncidentAt), "dd MMM yyyy")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
