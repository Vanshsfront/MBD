"use client";

import { useState, useMemo } from "react";
import { useApiCache } from "@/hooks/use-api-cache";
import { exportToCSV } from "@/lib/csv-export";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users, Activity, Download, Calendar, IndianRupee,
  BarChart3, TrendingUp, UserCheck,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, subDays } from "date-fns";

interface StaffReportRow {
  id: string;
  name: string;
  role: string;
  completed: number;
  cancelled: number;
  cancelledByPatient: number;
  cancelledByTherapist: number;
  noShow: number;
  scheduled: number;
  totalSessions: number;
  completionRate: number;
  revenue: number;
}

export default function StaffReportsPage() {
  const [startDate, setStartDate] = useState(() =>
    format(subDays(new Date(), 30), "yyyy-MM-dd")
  );
  const [endDate, setEndDate] = useState(() =>
    format(new Date(), "yyyy-MM-dd")
  );

  const url = `/api/reports/staff?startDate=${startDate}&endDate=${endDate}`;
  const { data, loading, refetch } = useApiCache<StaffReportRow[]>(url, {
    ttl: 2 * 60 * 1000,
  });

  const rows = data ?? [];

  // Summary stats
  const summary = useMemo(() => {
    if (!rows.length) return { totalSessions: 0, totalRevenue: 0, avgSessions: 0, therapistCount: 0 };
    const totalSessions = rows.reduce((s, r) => s + r.completed, 0);
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    return {
      totalSessions,
      totalRevenue,
      avgSessions: rows.length > 0 ? Math.round(totalSessions / rows.length) : 0,
      therapistCount: rows.length,
    };
  }, [rows]);

  // Chart data (top 15 by completed sessions)
  const chartData = useMemo(() => {
    return rows
      .slice(0, 15)
      .map((r) => ({
        name: r.name.length > 14 ? r.name.slice(0, 12) + "..." : r.name,
        Completed: r.completed,
        "Canc. (Patient)": r.cancelledByPatient ?? 0,
        "Canc. (Therapist)": r.cancelledByTherapist ?? 0,
        "No-Show": r.noShow,
      }));
  }, [rows]);

  const handleExport = () => {
    exportToCSV(
      rows,
      [
        { header: "Therapist", accessor: (r) => r.name },
        { header: "Role", accessor: (r) => r.role },
        { header: "Completed", accessor: (r) => r.completed },
        { header: "Cancelled by Patient", accessor: (r) => r.cancelledByPatient ?? 0 },
        { header: "Cancelled by Therapist", accessor: (r) => r.cancelledByTherapist ?? 0 },
        { header: "No-Shows", accessor: (r) => r.noShow },
        { header: "Total Sessions", accessor: (r) => r.totalSessions },
        { header: "Completion Rate %", accessor: (r) => r.completionRate },
        { header: "Revenue", accessor: (r) => r.revenue },
      ],
      `staff-report-${startDate}-to-${endDate}`
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-blue-600 gap-4">
        <Activity className="w-10 h-10 animate-spin" />
        <p className="text-sm font-semibold tracking-wide uppercase">Loading Staff Report...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 w-full max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight flex items-center gap-3">
            <Users className="h-8 w-8 text-blue-600" /> Staff Performance
          </h1>
          <p className="text-text-tertiary font-medium">Session counts, completion rates, and revenue per therapist.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-text-tertiary" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-border-light rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <span className="text-text-tertiary text-sm">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-border-light rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <Button
            onClick={() => refetch()}
            variant="outline"
            size="sm"
            className="text-sm"
          >
            Apply
          </Button>
          <Button
            onClick={handleExport}
            variant="outline"
            size="sm"
            className="text-sm"
            disabled={rows.length === 0}
          >
            <Download className="h-4 w-4 mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: "Total Completed", value: summary.totalSessions.toString(), icon: UserCheck, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100" },
          { title: "Total Revenue", value: `\u20B9${summary.totalRevenue.toLocaleString()}`, icon: IndianRupee, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100" },
          { title: "Avg Sessions / Therapist", value: summary.avgSessions.toString(), icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-100" },
          { title: "Active Therapists", value: summary.therapistCount.toString(), icon: Users, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-100" },
        ].map((card, i) => {
          const Icon = card.icon;
          return (
            <div key={i} className="bg-surface rounded-xl border border-border-light shadow-sm p-6 flex flex-col justify-between transition-all hover:shadow-md">
              <div className="flex justify-between items-start mb-4">
                <span className="text-sm font-semibold text-text-tertiary">{card.title}</span>
                <div className={`size-10 rounded-lg ${card.bg} ${card.border} border flex items-center justify-center`}>
                  <Icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </div>
              <p className="text-3xl font-bold text-text-primary">{card.value}</p>
            </div>
          );
        })}
      </div>

      {/* Bar Chart */}
      <div className="bg-surface rounded-xl border border-border-light shadow-sm overflow-hidden flex flex-col h-[420px]">
        <div className="p-5 border-b border-border-light flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-blue-600" />
          <h3 className="text-base font-bold text-text-primary">Sessions per Therapist</h3>
        </div>
        <div className="flex-1 p-6 relative">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#64748b", fontSize: 11, fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                  dy={10}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tick={{ fill: "#64748b", fontSize: 12, fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: "#f1f5f9" }}
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
                  }}
                  labelStyle={{ color: "#64748b", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}
                />
                <Bar dataKey="Completed" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={30} />
                <Bar dataKey="Canc. (Patient)" fill="#f87171" radius={[4, 4, 0, 0]} maxBarSize={30} />
                <Bar dataKey="Canc. (Therapist)" fill="#b91c1c" radius={[4, 4, 0, 0]} maxBarSize={30} />
                <Bar dataKey="No-Show" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-text-tertiary">
              No session data for selected period
            </div>
          )}
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-surface rounded-xl border border-border-light shadow-sm overflow-hidden">
        <div className="p-5 border-b border-border-light flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-600" />
          <h3 className="text-base font-bold text-text-primary">Therapist Breakdown</h3>
          <span className="ml-auto text-xs text-text-tertiary font-medium">{rows.length} therapist{rows.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-light bg-surface-secondary/50">
                <th className="text-left px-5 py-3 font-semibold text-text-tertiary text-xs uppercase tracking-wider">Therapist</th>
                <th className="text-center px-4 py-3 font-semibold text-text-tertiary text-xs uppercase tracking-wider">Completed</th>
                <th className="text-center px-3 py-3 font-semibold text-text-tertiary text-xs uppercase tracking-wider" title="Cancelled by patient">Canc. (Patient)</th>
                <th className="text-center px-3 py-3 font-semibold text-text-tertiary text-xs uppercase tracking-wider" title="Cancelled by therapist">Canc. (Therapist)</th>
                <th className="text-center px-4 py-3 font-semibold text-text-tertiary text-xs uppercase tracking-wider">No-Shows</th>
                <th className="text-center px-4 py-3 font-semibold text-text-tertiary text-xs uppercase tracking-wider">Completion Rate</th>
                <th className="text-right px-5 py-3 font-semibold text-text-tertiary text-xs uppercase tracking-wider">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? rows.map((row) => (
                <tr key={row.id} className="border-b border-border-light hover:bg-surface-secondary/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div>
                      <span className="font-semibold text-text-primary">{row.name}</span>
                      <span className="ml-2">
                        <Badge
                          className={`text-[10px] px-1.5 py-0 font-semibold uppercase tracking-wider shadow-none border ${
                            row.role === "CONSULTANT"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : "bg-surface-secondary text-text-secondary border-border-light"
                          }`}
                        >
                          {row.role === "FRONT_OFFICE" ? "Front Office" : row.role}
                        </Badge>
                      </span>
                    </div>
                  </td>
                  <td className="text-center px-4 py-3.5 font-semibold text-emerald-700">{row.completed}</td>
                  <td className="text-center px-3 py-3.5 font-semibold text-red-600">{row.cancelledByPatient ?? 0}</td>
                  <td className="text-center px-3 py-3.5 font-semibold text-red-700">{row.cancelledByTherapist ?? 0}</td>
                  <td className="text-center px-4 py-3.5 font-semibold text-amber-600">{row.noShow}</td>
                  <td className="text-center px-4 py-3.5">
                    <Badge
                      className={`text-xs font-bold shadow-none border px-2 py-0.5 ${
                        row.completionRate >= 80
                          ? "bg-green-50 text-green-700 border-green-200"
                          : row.completionRate >= 50
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-red-50 text-red-700 border-red-200"
                      }`}
                    >
                      {row.completionRate}%
                    </Badge>
                  </td>
                  <td className="text-right px-5 py-3.5 font-bold text-text-primary">
                    {row.revenue > 0 ? `\u20B9${row.revenue.toLocaleString()}` : "\u2014"}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-text-tertiary font-semibold">
                    No data for the selected date range
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
