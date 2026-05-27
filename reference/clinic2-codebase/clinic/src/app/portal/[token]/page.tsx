"use client";

import { useState, useEffect, use } from "react";
import { Badge } from "@/components/ui/badge";
import { Activity, Package, Calendar, FileText, CheckCircle2, Clock, XCircle, AlertTriangle, IndianRupee, ArrowUpRight, Heart, Loader2, ShieldAlert } from "lucide-react";
import { format } from "date-fns";

interface OverviewData {
  totalPackages: number; totalSessions: number; completedSessions: number;
  upcomingSessions: number; totalInvoiced: number; totalPaid: number;
}

interface PackageData { totalSessions: number; completedSessions: number; status: string; validFrom: string; validUntil: string; }
interface SessionData { date: string; status: string; therapist: string; service: string; progressUpdates: string | null; }
interface InvoiceData { invoiceNumber: string; totalAmount: number; paidAmount: number; status: string; createdAt: string; }

interface PortalData {
  firstName: string; lastName: string; clientCode: string;
  visibleSections: string[];
  overview?: OverviewData;
  packages?: PackageData[];
  sessions?: SessionData[];
  invoices?: InvoiceData[];
}

export default function ClientPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = use(params);
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/client-portal/${resolvedParams.token}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to load dashboard");
        }
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [resolvedParams.token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          <p className="text-slate-500 font-medium text-sm">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 max-w-md w-full text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-50 flex items-center justify-center border border-red-100 mb-6">
            <ShieldAlert className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">Dashboard Unavailable</h2>
          <p className="text-slate-500 text-sm leading-relaxed">{error || "This dashboard link is invalid or has expired."}</p>
        </div>
      </div>
    );
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case "COMPLETED": return <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />;
      case "CANCELLED": return <XCircle className="h-3.5 w-3.5 text-rose-600" />;
      case "NO_SHOW": return <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />;
      default: return <Clock className="h-3.5 w-3.5 text-blue-600" />;
    }
  };

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      SCHEDULED: "bg-blue-50 text-blue-700 border-blue-200",
      COMPLETED: "bg-green-50 text-green-700 border-green-200",
      CANCELLED: "bg-rose-50 text-rose-700 border-rose-200",
      NO_SHOW: "bg-yellow-50 text-yellow-700 border-yellow-200",
      ACTIVE: "bg-green-50 text-green-700 border-green-200",
      EXPIRED: "bg-red-50 text-red-700 border-red-200",
      PAID: "bg-green-50 text-green-700 border-green-200",
      PARTIAL: "bg-orange-50 text-orange-700 border-orange-200",
      DRAFT: "bg-slate-50 text-slate-700 border-slate-200",
      OVERDUE: "bg-red-50 text-red-700 border-red-200",
    };
    return map[status] || "bg-slate-50 text-slate-700 border-slate-200";
  };

  const sections = data.visibleSections || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-2xl font-bold shadow-lg shadow-blue-200">
                {data.firstName[0]}{data.lastName[0]}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">Client Portal</span>
                </div>
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                  {data.firstName} {data.lastName}
                </h1>
                <p className="text-sm text-slate-500 mt-0.5 font-medium">{data.clientCode}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <Heart className="h-3.5 w-3.5 text-rose-400" />
              Powered by Movement by Design
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Overview Cards */}
        {sections.includes("overview") && data.overview && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 group hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-blue-600" />
                </div>
                <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{data.overview.completedSessions}</p>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Sessions Done</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 group hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-amber-500 transition-colors" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{data.overview.upcomingSessions}</p>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Upcoming</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 group hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
                  <IndianRupee className="h-5 w-5 text-green-600" />
                </div>
                <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-green-500 transition-colors" />
              </div>
              <p className="text-2xl font-bold text-slate-900">₹{data.overview.totalPaid.toLocaleString()}</p>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Total Paid</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 group hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
                  <Package className="h-5 w-5 text-purple-600" />
                </div>
                <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-purple-500 transition-colors" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{data.overview.totalPackages}</p>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Packages</p>
            </div>
          </div>
        )}

        {/* Packages */}
        {sections.includes("packages") && data.packages && data.packages.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 flex items-center gap-3">
              <Package className="h-5 w-5 text-purple-600" />
              <h2 className="text-base font-bold text-slate-900">Your Packages</h2>
            </div>
            <div className="p-6 space-y-4">
              {data.packages.map((pkg, i) => (
                <div key={i} className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                  <div className="flex items-center justify-between mb-4">
                    <Badge className={`${statusColor(pkg.status)} border px-2 py-0.5 text-xs font-semibold uppercase tracking-wider shadow-none`}>{pkg.status}</Badge>
                    <span className="text-xs text-slate-500 font-medium">
                      Valid: {format(new Date(pkg.validFrom), "dd MMM")} — {format(new Date(pkg.validUntil), "dd MMM yyyy")}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 font-medium">Sessions Progress</span>
                      <span className="text-slate-900 font-bold">{pkg.completedSessions} / {pkg.totalSessions}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, (pkg.completedSessions / pkg.totalSessions) * 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500 text-right">
                      {pkg.totalSessions - pkg.completedSessions} sessions remaining
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sessions */}
        {sections.includes("sessions") && data.sessions && data.sessions.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Activity className="h-5 w-5 text-blue-600" />
                <h2 className="text-base font-bold text-slate-900">Session History</h2>
              </div>
              <Badge className="bg-slate-100 text-slate-600 border border-slate-200 shadow-none text-xs">{data.sessions.length} sessions</Badge>
            </div>
            <div className="divide-y divide-slate-100">
              {data.sessions.map((session, i) => (
                <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center w-14 shrink-0">
                      <span className="text-lg font-bold text-slate-900">{format(new Date(session.date), "dd")}</span>
                      <span className="text-[10px] font-semibold text-slate-500 uppercase">{format(new Date(session.date), "MMM")}</span>
                    </div>
                    <div className="h-10 border-l border-slate-200" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{session.service}</p>
                      <p className="text-xs text-slate-500 mt-0.5">with {session.therapist}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {session.progressUpdates && (
                      <span className="text-xs text-blue-600 font-medium max-w-48 truncate hidden md:block">{session.progressUpdates}</span>
                    )}
                    <Badge className={`${statusColor(session.status)} border px-2 py-0.5 text-xs font-semibold gap-1.5 shadow-none`}>
                      {statusIcon(session.status)} {session.status.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Invoices */}
        {sections.includes("invoices") && data.invoices && data.invoices.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 flex items-center gap-3">
              <FileText className="h-5 w-5 text-green-600" />
              <h2 className="text-base font-bold text-slate-900">Invoices & Payments</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {data.invoices.map((inv, i) => (
                <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{inv.invoiceNumber}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{format(new Date(inv.createdAt), "dd MMM yyyy")}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">₹{inv.totalAmount.toLocaleString()}</p>
                      {inv.paidAmount > 0 && inv.paidAmount < inv.totalAmount && (
                        <p className="text-[10px] text-green-600 font-semibold">₹{inv.paidAmount.toLocaleString()} paid</p>
                      )}
                    </div>
                    <Badge className={`${statusColor(inv.status)} border px-2 py-0.5 text-xs font-semibold uppercase tracking-wider shadow-none`}>{inv.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-6 text-xs text-slate-400">
          <p className="font-medium">This is a secure, read-only view of your treatment progress.</p>
          <p className="mt-1">For changes or queries, please contact the clinic directly.</p>
        </div>
      </main>
    </div>
  );
}
