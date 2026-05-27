"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Users, Package, CalendarDays, FileText, ArrowRight,
  UserPlus, Activity, Stethoscope, Clock, AlertTriangle,
  BarChart3,
} from "lucide-react";
import Link from "next/link";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { useApiCache } from "@/hooks/use-api-cache";
import { hasPermission, isManagementRole } from "@/lib/permissions";
import { format, isToday, addDays, startOfWeek } from "date-fns";

interface DashboardStats {
  totalClients: number;
  activePackages: number;
  todaySessions: number;
  pendingInvoices: number;
  weeklySessionCounts?: { name: string; sessions: number }[];
  expiringPackages?: number;
  todayAppointmentsList?: Array<{
    id: string;
    startTime: string;
    endTime: string;
    status: string;
    client: { id: string; firstName: string; lastName: string; clientCode: string; phone: string };
    service: { id: string; name: string };
  }>;
}

// ── Role-specific quick actions ──────────────────────────────────────────
function getQuickActions(role: string) {
  const actions = [];

  if (hasPermission(role, "patients:intake")) {
    actions.push({ label: "Register Patient", href: "/dashboard/patients/intake", icon: UserPlus, desc: "Start new patient intake", color: "blue" });
  }
  if (hasPermission(role, "appointments:edit")) {
    actions.push({ label: "Book Appointment", href: "/dashboard/appointments/calendar", icon: CalendarDays, desc: "Schedule a new appointment", color: "indigo" });
  }
  if (hasPermission(role, "sessions:view")) {
    actions.push({ label: "View Sessions", href: "/dashboard/sessions", icon: Activity, desc: "Manage therapy sessions", color: "emerald" });
  }
  if (hasPermission(role, "consultations:edit_own")) {
    actions.push({ label: "Log Consultation", href: "/dashboard/sessions/consultations", icon: Stethoscope, desc: "Document clinical notes", color: "purple" });
  }
  if (hasPermission(role, "invoices:edit")) {
    actions.push({ label: "Generate Invoice", href: "/dashboard/billing/invoices", icon: FileText, desc: "Create billing invoice", color: "amber" });
  }
  if (hasPermission(role, "reports:view")) {
    actions.push({ label: "View Reports", href: "/dashboard/reports", icon: BarChart3, desc: "Clinical and financial analytics", color: "sky" });
  }

  return actions.slice(0, 4);
}

function getDoctorQuickActions() {
  return [
    { label: "My Patients", href: "/dashboard/patients", icon: Users, desc: "View your patient directory", color: "blue" },
    { label: "Log Consultation", href: "/dashboard/sessions/consultations", icon: Stethoscope, desc: "Document clinical notes", color: "purple" },
    { label: "View Schedule", href: "/dashboard/appointments/calendar", icon: CalendarDays, desc: "See your full calendar", color: "indigo" },
  ];
}

// ── Icon background color map ────────────────────────────────────────────
const iconBgMap: Record<string, string> = {
  blue: "bg-blue-50 text-blue-600",
  indigo: "bg-indigo-50 text-indigo-600",
  emerald: "bg-emerald-50 text-emerald-600",
  purple: "bg-purple-50 text-purple-600",
  amber: "bg-amber-50 text-amber-600",
  sky: "bg-sky-50 text-sky-600",
};

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const userName = session?.user?.name?.split(" ")[0] || "User";
  const fullName = session?.user?.name || "User";
  const userRole = ((session?.user as { role?: string })?.role || "THERAPIST");
  const userId = (session?.user as { id?: string })?.id || "";
  const designation = (session?.user as { designation?: string })?.designation || userRole.replace(/_/g, " ");

  const isDoctorView = ["THERAPIST", "CONSULTANT"].includes(userRole);
  const isAdminView = ["OWNER", "ADMIN", "DEV"].includes(userRole);

  // Doctor-specific stats or general stats
  const statsUrl = isDoctorView && userId ? `/api/dashboard/stats?staffId=${userId}` : "/api/dashboard/stats";
  const { data: stats, loading } = useApiCache<DashboardStats>(statsUrl);

  // For now OWNER / ADMIN / MANAGER land straight on the admin console —
  // everything else is hidden until those modules are re-enabled.
  // DEV is exempt: the developer account is supposed to land on the overview
  // so every page is reachable from one place.
  useEffect(() => {
    if (["OWNER", "ADMIN", "MANAGER"].includes(userRole)) {
      router.replace("/dashboard/admin");
    }
  }, [userRole, router]);
  if (["OWNER", "ADMIN", "MANAGER"].includes(userRole)) return null;

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";

  // For doctor view: build mini week calendar from today's appointments
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const todayAppts = stats?.todayAppointmentsList || [];

  // Doctor / Therapist / Consultant view
  if (isDoctorView) {
    return (
      <div className="space-y-6 pb-12">
        {/* Personalized Greeting */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-text-primary tracking-tight">
              {greeting}, {userName}
            </h1>
            <p className="text-text-secondary font-medium">{designation} &middot; Movement By Design</p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold uppercase tracking-wider border border-emerald-200/60">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-subtle-pulse"></span>
            Online
          </span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <StatCard icon={Users} color="blue" label="My Patients" value={stats?.totalClients ?? "—"} loading={loading} />
          <StatCard icon={CalendarDays} color="indigo" label="Today's Appointments" value={stats?.todaySessions ?? "—"} loading={loading} />
          <StatCard icon={Package} color="emerald" label="Active Packages" value={stats?.activePackages ?? "—"} loading={loading} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Today's Schedule — mini calendar */}
          <div className="lg:col-span-2 neumorphic-card overflow-hidden flex flex-col">
            <div className="p-5 border-b border-border-light flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-text-primary">Today&apos;s Schedule</h2>
                <p className="text-xs text-text-tertiary">{format(today, "EEEE, dd MMMM yyyy")}</p>
              </div>
              <Link href="/dashboard/appointments/calendar" className="text-xs font-medium text-text-primary hover:opacity-80 bg-surface-secondary hover:bg-surface px-3 py-1.5 rounded-lg transition-all duration-200 border border-border-light">
                Full Calendar
              </Link>
            </div>
            <div className="flex-1">
              {/* Mini week strip */}
              <div className="flex border-b border-border-light">
                {weekDays.map(day => (
                  <div
                    key={day.toISOString()}
                    className={`flex-1 py-3 text-center border-r last:border-r-0 border-border-light ${
                      isToday(day) ? "bg-blue-50" : ""
                    }`}
                  >
                    <p className="text-[10px] font-semibold text-text-tertiary uppercase">{format(day, "EEE")}</p>
                    <p className={`text-lg font-bold ${isToday(day) ? "text-blue-700" : "text-text-secondary"}`}>
                      {format(day, "d")}
                    </p>
                    {isToday(day) && (
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-600 mx-auto mt-1" />
                    )}
                  </div>
                ))}
              </div>

              {/* Today's appointment list */}
              <div className="p-4 space-y-2">
                {todayAppts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="h-12 w-12 rounded-full bg-surface-secondary flex items-center justify-center border border-border-light mb-3">
                      <CalendarDays className="h-5 w-5 text-text-tertiary" />
                    </div>
                    <p className="text-sm font-medium text-text-secondary">No appointments today</p>
                    <p className="text-xs text-text-tertiary mt-1">Your schedule is clear for the day</p>
                  </div>
                ) : (
                  todayAppts.map((apt) => {
                    const statusColor =
                      apt.status === "COMPLETED" ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
                      apt.status === "CHECKED_IN" || apt.status === "IN_PROGRESS" ? "bg-purple-50 border-purple-200 text-purple-700" :
                      apt.status === "CANCELLED" ? "bg-red-50 border-red-200 text-red-700" :
                      "bg-blue-50 border-blue-200 text-blue-700";

                    return (
                      <div key={apt.id} className={`flex items-center gap-4 p-3.5 rounded-xl border ${statusColor} transition-all`}>
                        <div className="flex flex-col items-center text-xs font-bold min-w-[52px]">
                          <span>{format(new Date(apt.startTime), "HH:mm")}</span>
                          <span className="text-[10px] font-normal opacity-60">to</span>
                          <span>{format(new Date(apt.endTime), "HH:mm")}</span>
                        </div>
                        <div className="h-8 w-px bg-current opacity-20" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{apt.client.firstName} {apt.client.lastName}</p>
                          <p className="text-xs opacity-75 truncate">{apt.service.name}</p>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-70 shrink-0">{apt.status.replace(/_/g, " ")}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="neumorphic-card flex flex-col">
            <div className="p-5 border-b border-border-light">
              <h2 className="text-base font-bold text-text-primary">Quick Actions</h2>
              <p className="text-xs text-text-tertiary">Common workflows</p>
            </div>
            <div className="p-3 flex-1 space-y-1">
              {getDoctorQuickActions().map((action) => {
                const Icon = action.icon;
                const colorClass = iconBgMap[action.color] || "bg-surface-secondary text-text-secondary";
                return (
                  <Link href={action.href} key={action.label} className="flex items-center justify-between p-3 rounded-xl hover:bg-surface-secondary transition-all duration-200 border border-transparent hover:border-border-light group press-scale">
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 rounded-xl ${colorClass} flex items-center justify-center`}>
                        <Icon strokeWidth={2} className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{action.label}</p>
                        <p className="text-[11px] text-text-tertiary">{action.desc}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-text-tertiary group-hover:text-text-primary group-hover:translate-x-1 transition-all duration-200" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // FO / Admin / Owner view
  const quickActions = getQuickActions(userRole);
  const canSeeFinancials = hasPermission(userRole, "reports:mis") || hasPermission(userRole, "invoices:view");

  return (
    <div className="space-y-8 pb-12">
      {/* Header section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight">{greeting}, {userName}</h1>
          <p className="text-text-secondary font-medium">
            Movement By Design &middot; {
              userRole === "DEV" ? "Developer Dashboard" :
              userRole === "OWNER" ? "Founder Dashboard" :
              userRole === "ADMIN" ? "Admin Dashboard" :
              userRole === "FRONT_OFFICE" ? "Front Office" :
              "Dashboard"
            }
          </p>
        </div>
        <div className="flex items-center gap-3">
           <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">{designation}</span>
           <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold uppercase tracking-wider border border-emerald-200/60">
             <span className="w-2 h-2 rounded-full bg-emerald-500 animate-subtle-pulse"></span>
             Online
           </span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {hasPermission(userRole, "patients:view") && (
          <StatCard icon={Users} color="blue" label="Total Patients" value={stats?.totalClients ?? "—"} loading={loading} />
        )}
        <StatCard icon={CalendarDays} color="indigo" label="Today's Sessions" value={stats?.todaySessions ?? "—"} loading={loading} />
        {hasPermission(userRole, "packages:view") && (
          <StatCard icon={Package} color="emerald" label="Active Packages" value={stats?.activePackages ?? "—"} loading={loading} />
        )}
        {canSeeFinancials && (
          <StatCard icon={FileText} color="amber" label="Pending Invoices" value={stats?.pendingInvoices ?? "—"} loading={loading} />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart — visible to management & admin roles */}
        {(isManagementRole(userRole) || isAdminView) && (
          <div className="lg:col-span-2 neumorphic-card overflow-hidden flex flex-col">
            <div className="p-5 border-b border-border-light flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-text-primary">Weekly Patient Flow</h2>
                <p className="text-xs text-text-tertiary">Appointments over the last 7 days</p>
              </div>
              <Link href="/dashboard/reports" className="text-xs font-medium text-text-primary hover:opacity-80 bg-surface-secondary hover:bg-surface px-3 py-1.5 rounded-lg transition-all duration-200 border border-border-light">
                Full Report
              </Link>
            </div>
            <div className="p-5 flex-1 min-h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats?.weeklySessionCounts ?? []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorClients" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2a7db8" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#2a7db8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'var(--text-tertiary)', fontSize: 11}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--text-tertiary)', fontSize: 11}} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--surface)',
                      borderRadius: '12px',
                      border: '1px solid var(--border-light)',
                      boxShadow: '0 4px 16px -4px var(--shadow-color)',
                      fontSize: '12px',
                    }}
                    itemStyle={{ color: 'var(--text-primary)', fontWeight: '500' }}
                  />
                  <Area type="monotone" dataKey="sessions" stroke="#2a7db8" strokeWidth={2.5} fillOpacity={1} fill="url(#colorClients)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* FO view: placeholder for non-admin/non-management */}
        {!isManagementRole(userRole) && !isAdminView && (
          <div className="lg:col-span-2 neumorphic-card overflow-hidden flex flex-col">
            <div className="p-5 border-b border-border-light flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-text-primary">Today&apos;s Schedule</h2>
                <p className="text-xs text-text-tertiary">Appointments and sessions for today</p>
              </div>
              <Link href="/dashboard/appointments/calendar" className="text-xs font-medium text-text-primary hover:opacity-80 bg-surface-secondary hover:bg-surface px-3 py-1.5 rounded-lg transition-all duration-200 border border-border-light">
                Full Calendar
              </Link>
            </div>
            <div className="p-5 flex-1">
              <div className="flex items-center gap-4 p-4 rounded-xl bg-surface-secondary border border-border-light">
                <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <Clock className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-text-primary">View the full calendar for today&apos;s appointments</p>
                  <p className="text-xs text-text-tertiary">Navigate to Calendar for scheduling details</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className={`neumorphic-card flex flex-col ${!isManagementRole(userRole) && !isAdminView ? '' : ''}`}>
          <div className="p-5 border-b border-border-light">
            <h2 className="text-base font-bold text-text-primary">Quick Actions</h2>
            <p className="text-xs text-text-tertiary">Common workflows for your role</p>
          </div>
          <div className="p-3 flex-1 space-y-1">
            {quickActions.map((action) => {
              const Icon = action.icon;
              const colorClass = iconBgMap[action.color] || "bg-surface-secondary text-text-secondary";
              return (
                <Link href={action.href} key={action.label} className="flex items-center justify-between p-3 rounded-xl hover:bg-surface-secondary transition-all duration-200 border border-transparent hover:border-border-light group press-scale">
                  <div className="flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-xl ${colorClass} flex items-center justify-center`}>
                      <Icon strokeWidth={2} className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{action.label}</p>
                      <p className="text-[11px] text-text-tertiary">{action.desc}</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-text-tertiary group-hover:text-text-primary group-hover:translate-x-1 transition-all duration-200" />
                </Link>
              );
            })}

            {/* Alerts section for management */}
            {isManagementRole(userRole) && (
              <div className="pt-4 px-3 pb-2">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-3 flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3" />
                  Attention Required
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                    <span className="text-text-secondary">Packages expiring this week</span>
                    <span className="ml-auto text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-lg">{stats?.expiringPackages ?? 0}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    <span className="text-text-secondary">Overdue invoices</span>
                    <span className="ml-auto text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg">{stats?.pendingInvoices ?? 0}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Stat Card Component ──────────────────────────────────────────────────
function StatCard({
  icon: Icon,
  color,
  label,
  value,
  loading,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  color: string;
  label: string;
  value: number | string;
  loading: boolean;
}) {
  const colorClass = iconBgMap[color] || "bg-surface-secondary text-text-secondary";

  return (
    <div className="neumorphic-card-sm p-5 flex flex-col justify-between hover-lift">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-2.5 rounded-xl ${colorClass}`}>
          <Icon className="w-5 h-5" strokeWidth={2} />
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-text-tertiary mb-1">{label}</p>
        <h3 className="text-2xl font-bold text-text-primary">
          {loading ? <span className="animate-shimmer text-transparent rounded">000</span> : value}
        </h3>
      </div>
    </div>
  );
}
