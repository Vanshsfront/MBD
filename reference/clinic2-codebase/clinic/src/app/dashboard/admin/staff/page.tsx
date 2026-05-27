"use client";

import { Fragment } from "react";
import Link from "next/link";
import { useApiCache } from "@/hooks/use-api-cache";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users, Loader2, Building2, GitBranch, ArrowRight } from "lucide-react";

// View-only roster. All add / edit / remove actions live on the Hierarchy page.

interface Staff {
  id: string;
  name: string;
  email: string;
  role: string;
  designation: string | null;
  isActive: boolean;
  departmentId: string | null;
  centreId: string | null;
  department: { name: string } | null;
  centre: { name: string; slug: string } | null;
}
interface ActiveCentreInfo {
  activeCentreId: string | null;
  canSwitch: boolean;
  centre: { id: string; name: string; slug: string; location: string } | null;
}

const ROLE_TINT: Record<string, string> = {
  OWNER:        "bg-amber-50 text-amber-700 border-amber-200",
  DEV:          "bg-slate-900 text-slate-50 border-slate-700",
  ADMIN:        "bg-purple-50 text-purple-700 border-purple-200",
  CONSULTANT:   "bg-blue-50 text-blue-700 border-blue-200",
  THERAPIST:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  FRONT_OFFICE: "bg-sky-50 text-sky-700 border-sky-200",
  MANAGER:      "bg-slate-50 text-slate-700 border-slate-200",
};

export default function StaffAdminPage() {
  const { data: staff, loading } = useApiCache<Staff[]>("/api/staff");
  const { data: active } = useApiCache<ActiveCentreInfo>("/api/active-centre", { ttl: 30_000 });

  const groupedStaff = !staff ? [] : Object.entries(
    staff.reduce((acc, s) => {
      if (!acc[s.role]) acc[s.role] = [];
      acc[s.role].push(s);
      return acc;
    }, {} as Record<string, Staff[]>)
  ).sort(([roleA], [roleB]) => {
    const order = ["OWNER", "DEV", "ADMIN", "MANAGER", "CONSULTANT", "THERAPIST", "FRONT_OFFICE"];
    const a = order.indexOf(roleA);
    const b = order.indexOf(roleB);
    return (a === -1 ? 999 : a) - (b === -1 ? 999 : b);
  });

  return (
    <div className="space-y-6 pb-12 w-full max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary flex items-center gap-3">
            <Users className="h-7 w-7 text-emerald-600" /> Staff
          </h1>
          <p className="text-sm text-text-tertiary">
            Read-only roster of everyone assigned to the active clinic.
          </p>
        </div>
        <Link
          href="/dashboard/admin/hierarchy"
          className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg"
        >
          <GitBranch className="h-3.5 w-3.5" /> Manage from hierarchy <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Active clinic banner */}
      {active?.centre ? (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-indigo-100 bg-indigo-50/40 text-xs">
          <Building2 className="h-4 w-4 text-indigo-600" />
          <span className="text-indigo-900">
            Showing staff for <strong>{active.centre.name}</strong>{" "}
            <span className="font-mono text-indigo-600">{active.centre.slug}</span>. OWNER is always visible globally.
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-900">
          No active clinic — pick one from the header switcher.
        </div>
      )}

      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-border-light bg-surface-secondary/60 text-[11px] text-text-tertiary">
        To add, edit, change role or remove staff, use the{" "}
        <Link href="/dashboard/admin/hierarchy" className="text-indigo-600 font-semibold hover:underline">
          Hierarchy page
        </Link>
        .
      </div>

      {/* Table */}
      <div className="neumorphic-card overflow-hidden">
        <Table>
          <TableHeader className="bg-surface-secondary border-b border-border-light">
            <TableRow className="hover:bg-surface-secondary border-0">
              <TableHead className="text-text-tertiary text-xs uppercase tracking-wider py-4 pl-6 w-12">#</TableHead>
              <TableHead className="text-text-tertiary text-xs uppercase tracking-wider py-4">Name</TableHead>
              <TableHead className="text-text-tertiary text-xs uppercase tracking-wider py-4">Email</TableHead>
              <TableHead className="text-text-tertiary text-xs uppercase tracking-wider py-4">Role</TableHead>
              <TableHead className="text-text-tertiary text-xs uppercase tracking-wider py-4">Department</TableHead>
              <TableHead className="text-text-tertiary text-xs uppercase tracking-wider py-4 pr-6">Clinic</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border-light">
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-600" />
                </TableCell>
              </TableRow>
            ) : !staff || staff.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-text-tertiary">No staff yet.</TableCell>
              </TableRow>
            ) : (
              groupedStaff.map(([role, roleStaff]) => (
                <Fragment key={role}>
                  <TableRow className="bg-surface-secondary/80 border-y border-border-light">
                    <TableCell colSpan={6} className="py-2.5 pl-6 text-[11px] font-bold uppercase tracking-wider text-text-primary">
                      {role.replace("_", " ")} ({roleStaff.length})
                    </TableCell>
                  </TableRow>
                  {roleStaff.map((s, i) => (
                    <TableRow key={s.id} className={`hover:bg-surface-secondary/60 ${!s.isActive ? "opacity-50" : ""}`}>
                      <TableCell className="pl-6 py-3 text-xs font-mono text-text-tertiary">{i + 1}</TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-700 font-bold border border-indigo-200 flex items-center justify-center text-xs">
                            <AvatarFallback className="bg-transparent">{s.name[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-semibold text-text-primary">{s.name}</p>
                            {s.designation && <p className="text-[11px] text-text-tertiary">{s.designation}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-text-secondary">{s.email}</TableCell>
                      <TableCell className="py-3">
                        <Badge className={`${ROLE_TINT[s.role] ?? ROLE_TINT.THERAPIST} shadow-none text-[10px] font-bold tracking-wider px-2 py-0.5 uppercase`}>
                          {s.role.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-sm text-text-secondary">{s.department?.name ?? "—"}</TableCell>
                      <TableCell className="pr-6 py-3 text-xs font-mono text-text-tertiary">
                        {s.centre?.slug ?? ((s.role === "OWNER" || s.role === "DEV") ? "GLOBAL" : "—")}
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
