"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, Users, CalendarDays, DollarSign, Package, Activity } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { format } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface DashboardStats {
  totalClients: number;
  activePackages: number;
  todaySessions: number;
  pendingInvoices: number;
  totalRevenue: number;
  revenueByMonth: Record<string, number>;
  sessionStats: Array<{ status: string; _count: number }>;
  recentClients: Array<{ id: string; clientCode: string; firstName: string; lastName: string; createdAt: string }>;
  recentSessions: Array<{ id: string; client: { firstName: string; lastName: string }; therapist: { name: string }; service: { name: string }; sessionDate: string; status: string }>;
}

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function ReportsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((r) => r.json())
      .then((data) => { setStats(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-blue-600 gap-4">
         <Activity className="w-10 h-10 animate-spin" />
         <p className="text-sm font-semibold tracking-wide uppercase">Aggregating Data...</p>
      </div>
    );
  }

  if (!stats) {
    return <div className="flex items-center justify-center min-h-[60vh] text-text-tertiary font-medium">Failed to load analytics data.</div>;
  }

  // Prepare chart data
  const revenueData = Object.entries(stats.revenueByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({
      month: month.split("-").reverse().join("/"),
      revenue: Math.round(amount),
    }));

  const sessionPieData = stats.sessionStats.map((s) => ({
    name: s.status,
    value: s._count,
  }));

  const sessionStatusColors: Record<string, string> = {
    SCHEDULED: "#3b82f6", // blue-500
    COMPLETED: "#10b981", // emerald-500
    CANCELLED: "#ef4444", // red-500
    NO_SHOW: "#f59e0b",   // ambar-500
  };

  return (
    <div className="space-y-6 pb-12 w-full max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight flex items-center gap-3">
             <BarChart3 className="h-8 w-8 text-blue-600" /> Analytics & Reports
          </h1>
          <p className="text-text-tertiary font-medium">Clinic performance overview and analytics.</p>
        </div>
      </div>

      {/* Summary Matrix */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: "Total Revenue", value: `₹${stats.totalRevenue.toLocaleString()}`, icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100" },
          { title: "Total Patients", value: stats.totalClients.toString(), icon: Users, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100" },
          { title: "Active Packages", value: stats.activePackages.toString(), icon: Package, color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-100" },
          { title: "Today's Sessions", value: stats.todaySessions.toString(), icon: CalendarDays, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-100" },
        ].map((card, i) => {
          const Icon = card.icon;
          return (
            <div key={i} className={`bg-surface rounded-xl border border-border-light shadow-sm p-6 flex flex-col justify-between transition-all hover:shadow-md`}>
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

      {/* Analytics Boards Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue Chart */}
        <div className="bg-surface rounded-xl border border-border-light shadow-sm overflow-hidden flex flex-col h-[420px]">
          <div className="p-5 border-b border-border-light flex items-center gap-2">
             <TrendingUp className="h-5 w-5 text-emerald-600" />
            <h3 className="text-base font-bold text-text-primary">Monthly Revenue</h3>
          </div>
          <div className="flex-1 p-6 relative">
            {revenueData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 12, fontWeight: 500 }} axisLine={false} tickLine={false} dy={10} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 12, fontWeight: 500 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    cursor={{ fill: '#f1f5f9' }}
                    contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)" }}
                    labelStyle={{ color: "#64748b", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}
                    itemStyle={{ color: "#0f172a", fontWeight: "bold", fontSize: "14px" }}
                    formatter={(value: number) => [`₹${value.toLocaleString()}`, "Revenue"]}
                  />
                  <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-text-tertiary">Not enough revenue data</div>
            )}
          </div>
        </div>

        {/* Session Distribution */}
        <div className="bg-surface rounded-xl border border-border-light shadow-sm overflow-hidden flex flex-col h-[420px]">
          <div className="p-5 border-b border-border-light flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            <h3 className="text-base font-bold text-text-primary">Session Distribution</h3>
          </div>
          <div className="flex-1 p-6 relative flex items-center justify-center">
            {sessionPieData.length > 0 ? (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-8 w-full h-full">
                <div className="w-[200px] h-[200px]">
                   <ResponsiveContainer width="100%" height="100%">
                     <PieChart>
                       <Pie data={sessionPieData} cx="50%" cy="50%" innerRadius={65} outerRadius={90} paddingAngle={2} dataKey="value" stroke="none">
                         {sessionPieData.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={sessionStatusColors[entry.name] || COLORS[index % COLORS.length]} />
                         ))}
                       </Pie>
                       <Tooltip 
                         contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                         itemStyle={{ color: "#0f172a", fontWeight: "bold", fontSize: "14px" }}
                       />
                     </PieChart>
                   </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {sessionPieData.map((entry, i) => {
                     const color = sessionStatusColors[entry.name] || COLORS[i % COLORS.length];
                     return (
                      <div key={i} className="flex items-center gap-3 bg-surface-secondary px-4 py-2.5 rounded-lg border border-border-light">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-sm font-semibold text-text-secondary w-24">{entry.name.replace("_", " ")}</span>
                        <span className="text-sm font-bold text-text-primary">{entry.value}</span>
                      </div>
                     );
                  })}
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-text-tertiary">Not enough session data</div>
            )}
          </div>
        </div>
      </div>

      {/* Activity Streams Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Clients */}
        <div className="bg-surface rounded-xl border border-border-light shadow-sm overflow-hidden flex flex-col h-[380px]">
          <div className="p-5 border-b border-border-light">
            <h3 className="text-base font-bold text-text-primary">Recent Patients</h3>
          </div>
          <div className="p-2 space-y-1 flex-1 overflow-y-auto custom-scrollbar">
            {stats.recentClients.length > 0 ? stats.recentClients.map((c) => (
              <div key={c.id} className="flex items-center justify-between hover:bg-surface-secondary transition-colors rounded-lg p-3">
                <div className="flex items-center gap-3">
                   <Avatar className="h-10 w-10 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 flex items-center justify-center text-sm">
                      <AvatarFallback className="bg-transparent">{c.firstName[0]}{c.lastName[0]}</AvatarFallback>
                   </Avatar>
                   <div>
                     <span className="block text-text-primary text-sm font-bold">{c.firstName} {c.lastName}</span>
                     <span className="text-xs text-text-tertiary font-medium">{c.clientCode}</span>
                   </div>
                </div>
                <div className="text-right">
                   <p className="text-sm font-medium text-text-secondary">{format(new Date(c.createdAt), "dd MMM yyyy")}</p>
                   <p className="text-xs text-text-tertiary">{format(new Date(c.createdAt), "hh:mm a")}</p>
                </div>
              </div>
            )) : (
              <div className="h-full flex items-center justify-center text-sm font-semibold text-text-tertiary">No recent clients found</div>
            )}
          </div>
        </div>

        {/* Today's Sessions */}
        <div className="bg-surface rounded-xl border border-border-light shadow-sm overflow-hidden flex flex-col h-[380px]">
          <div className="p-5 border-b border-border-light">
            <h3 className="text-base font-bold text-text-primary">Today&apos;s Sessions</h3>
          </div>
          <div className="p-2 space-y-1 flex-1 overflow-y-auto custom-scrollbar">
            {stats.recentSessions.length > 0 ? stats.recentSessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between hover:bg-surface-secondary transition-colors rounded-lg p-3">
                <div>
                  <span className="block text-text-primary text-sm font-bold">{s.client.firstName} {s.client.lastName}</span>
                  <span className="text-xs font-semibold text-text-tertiary truncate max-w-[200px] inline-block mt-0.5">{s.service.name}</span>
                </div>
                <div className="flex items-center gap-3">
                   <div className="text-right mr-2 hidden sm:block">
                     <p className="text-xs font-bold text-text-secondary">{s.therapist.name}</p>
                     <p className="text-xs text-text-tertiary">{format(new Date(s.sessionDate), "hh:mm a")}</p>
                   </div>
                   <Badge className={`border px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase shadow-none ${s.status === "COMPLETED" ? "bg-green-50 text-green-700 border-green-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>{s.status.substring(0, 4)}</Badge>
                </div>
              </div>
            )) : (
              <div className="h-full flex items-center justify-center text-sm font-semibold text-text-tertiary">No sessions assigned for today</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
