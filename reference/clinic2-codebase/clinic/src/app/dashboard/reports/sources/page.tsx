"use client";

import { useState } from "react";
import { useApiCache } from "@/hooks/use-api-cache";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MapPin, Users, Download } from "lucide-react";
import { exportToCSV } from "@/lib/csv-export";
import { format, subDays } from "date-fns";

interface SummaryResult {
  total: number;
  sources: Array<{ name: string; count: number }>;
}

interface DetailResult {
  source: string;
  count: number;
  clients: Array<{
    id: string;
    clientCode: string;
    firstName: string;
    lastName: string;
    phone: string;
    referredBy: string | null;
    createdAt: string;
    status: string;
  }>;
}

export default function SourcesReportPage() {
  const [startDate, setStartDate] = useState(() => format(subDays(new Date(), 90), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [selectedSource, setSelectedSource] = useState<string>("");

  const dateRange = `startDate=${startDate}&endDate=${endDate}`;
  const summaryUrl = `/api/reports/sources?${dateRange}`;
  const detailUrl = selectedSource ? `/api/reports/sources?source=${encodeURIComponent(selectedSource)}&${dateRange}` : null;

  const { data: summary } = useApiCache<SummaryResult>(summaryUrl);
  const { data: detail } = useApiCache<DetailResult>(detailUrl);

  const handleExportSummary = () => {
    if (!summary) return;
    exportToCSV(summary.sources, [
      { header: "Source", accessor: r => r.name },
      { header: "Patients", accessor: r => r.count },
    ], `patients-by-source-${startDate}-to-${endDate}`);
  };

  const handleExportDetail = () => {
    if (!detail) return;
    exportToCSV(detail.clients, [
      { header: "Code", accessor: r => r.clientCode },
      { header: "First Name", accessor: r => r.firstName },
      { header: "Last Name", accessor: r => r.lastName },
      { header: "Phone", accessor: r => r.phone },
      { header: "Status", accessor: r => r.status },
      { header: "Registered", accessor: r => format(new Date(r.createdAt), "dd MMM yyyy") },
    ], `source-${selectedSource}-${startDate}-to-${endDate}`);
  };

  return (
    <div className="space-y-6 pb-12 w-full max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary flex items-center gap-3">
            <MapPin className="h-7 w-7 text-blue-600" /> Patients by Source
          </h1>
          <p className="text-sm text-text-tertiary">How patients discovered the clinic, grouped by the &ldquo;Referred By&rdquo; field.</p>
        </div>
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
        <Button onClick={handleExportSummary} variant="outline" size="sm" disabled={!summary}>
          <Download className="h-4 w-4 mr-1" /> Export Summary
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface rounded-xl border border-border-light shadow-sm overflow-hidden">
          <div className="p-5 border-b border-border-light flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            <h3 className="text-base font-bold">All Sources</h3>
            <span className="ml-auto text-xs text-text-tertiary">{summary?.total ?? 0} patients total</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border-light bg-surface-secondary/50">
                <TableHead className="text-left px-5 py-3 text-xs uppercase">Source</TableHead>
                <TableHead className="text-right px-5 py-3 text-xs uppercase">Patients</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(summary?.sources || []).map(s => (
                <TableRow key={s.name} onClick={() => setSelectedSource(s.name === "Unknown / Unassigned" ? "__unassigned__" : s.name)} className="cursor-pointer hover:bg-surface-secondary">
                  <TableCell className="px-5 py-3 font-semibold">{s.name}</TableCell>
                  <TableCell className="px-5 py-3 text-right font-bold">{s.count}</TableCell>
                </TableRow>
              ))}
              {!summary?.sources.length && (
                <TableRow><TableCell colSpan={2} className="text-center py-8 text-text-tertiary text-sm">No patients in this range</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="bg-surface rounded-xl border border-border-light shadow-sm overflow-hidden">
          <div className="p-5 border-b border-border-light flex items-center gap-2">
            <h3 className="text-base font-bold">Patient List</h3>
            <Select value={selectedSource} onValueChange={(v: string | null) => setSelectedSource(v && v !== "__pick__" ? v : "")}>
              <SelectTrigger className="h-9 text-xs max-w-xs ml-auto">
                <SelectValue placeholder="Pick a source">{selectedSource === "__unassigned__" ? "Unknown / Unassigned" : selectedSource || "Pick a source"}</SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-surface max-h-64">
                <SelectItem value="__pick__">Pick a source…</SelectItem>
                {(summary?.sources || []).map(s => (
                  <SelectItem key={s.name} value={s.name === "Unknown / Unassigned" ? "__unassigned__" : s.name}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleExportDetail} variant="outline" size="sm" disabled={!detail}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
          <div className="max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border-light bg-surface-secondary/50">
                  <TableHead className="px-5 py-3 text-xs uppercase">Code</TableHead>
                  <TableHead className="px-5 py-3 text-xs uppercase">Name</TableHead>
                  <TableHead className="px-5 py-3 text-xs uppercase">Phone</TableHead>
                  <TableHead className="px-5 py-3 text-xs uppercase">Status</TableHead>
                  <TableHead className="px-5 py-3 text-xs uppercase">Registered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail?.clients.map(c => (
                  <TableRow key={c.id} className="hover:bg-surface-secondary">
                    <TableCell className="px-5 py-3 font-mono text-xs">{c.clientCode}</TableCell>
                    <TableCell className="px-5 py-3 text-sm font-semibold">{c.firstName} {c.lastName}</TableCell>
                    <TableCell className="px-5 py-3 text-sm font-mono">+91 {c.phone}</TableCell>
                    <TableCell className="px-5 py-3"><Badge className="text-[10px]">{c.status}</Badge></TableCell>
                    <TableCell className="px-5 py-3 text-xs">{format(new Date(c.createdAt), "dd MMM yyyy")}</TableCell>
                  </TableRow>
                ))}
                {selectedSource && detail && detail.clients.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-text-tertiary text-sm">No patients for this source</TableCell></TableRow>
                )}
                {!selectedSource && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-text-tertiary text-sm">Pick a source from the summary on the left, or the dropdown above.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
