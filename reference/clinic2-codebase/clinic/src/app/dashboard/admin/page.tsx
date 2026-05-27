import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveCentreId } from "@/lib/active-centre";
import { hasPermission } from "@/lib/permissions";
import {
  Building2,
  GitBranch,
  Users,
  Package,
  ArrowRight,
  ShieldCheck,
  FileSpreadsheet,
} from "lucide-react";

export const dynamic = "force-dynamic";

// First-screen admin console. Four primary cards (Clinics / Hierarchy / Staff /
// Services) are the "start here" surface, with secondary tools below. Counts
// are live per the active clinic so an admin can see the state of what they
// just switched into.
export default async function AdminPage() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role || "";
  if (!hasPermission(role, "admin:staff") && !hasPermission(role, "admin:clinics")) {
    redirect("/dashboard");
  }

  const activeCentreId = await getActiveCentreId();
  const [centres, activeCentre, staffCount, serviceCount, clientCount] = await Promise.all([
    prisma.centre.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true, location: true },
      orderBy: { createdAt: "asc" },
    }),
    activeCentreId
      ? prisma.centre.findUnique({
          where: { id: activeCentreId },
          select: { id: true, name: true, slug: true, location: true },
        })
      : null,
    activeCentreId
      ? prisma.staff.count({ where: { isActive: true, OR: [{ centreId: activeCentreId }, { role: "OWNER" }, { role: "DEV" }] } })
      : prisma.staff.count({ where: { isActive: true } }),
    activeCentreId
      ? prisma.service.count({ where: { isActive: true, centreId: activeCentreId } })
      : prisma.service.count({ where: { isActive: true } }),
    activeCentreId
      ? prisma.client.count({ where: { centreId: activeCentreId } })
      : prisma.client.count(),
  ]);

  const primaryCards = [
    {
      href: "/dashboard/admin/clinics",
      title: "Clinics",
      description: "Add new locations, manage slugs, toggle active / inactive.",
      stat: `${centres.length} active`,
      icon: Building2,
      tint: "blue",
    },
    {
      href: "/dashboard/admin/hierarchy",
      title: "Hierarchy",
      description: "Org chart of the active clinic — OWNER → doctors / FO → patients.",
      stat: activeCentre ? `${staffCount} staff` : "Pick a clinic",
      icon: GitBranch,
      tint: "indigo",
    },
    {
      href: "/dashboard/admin/staff",
      title: "Staff",
      description: "Add, edit, remove doctors, FO and therapists for this clinic.",
      stat: activeCentre ? `${staffCount} members` : "—",
      icon: Users,
      tint: "emerald",
    },
    {
      href: "/dashboard/admin/services",
      title: "Services",
      description: "Per-clinic catalogue with rates. Add, edit or bulk-import.",
      stat: activeCentre ? `${serviceCount} services` : "—",
      icon: Package,
      tint: "amber",
    },
    {
      href: "/dashboard/admin/mis",
      title: "MIS Report",
      description: "Management Information System — revenue, sessions & centre-wise analytics.",
      stat: "View Report",
      icon: FileSpreadsheet,
      tint: "indigo",
    },
  ];

  return (
    <div className="space-y-10 pb-12 w-full max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-indigo-600" />
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Admin Console</h1>
        </div>
        <p className="text-sm text-text-tertiary max-w-2xl">
          Configure clinics, define their hierarchy, manage staff and maintain each clinic&apos;s service catalogue.
        </p>
      </div>

      {/* Active clinic banner */}
      {activeCentre ? (
        <div className="neumorphic-card p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-indigo-100 bg-indigo-50/30">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Active clinic</p>
              <p className="text-base font-semibold text-text-primary">{activeCentre.name}</p>
              <p className="text-xs text-text-tertiary">
                <span className="font-mono">{activeCentre.slug}</span>
                {activeCentre.location ? ` • ${activeCentre.location}` : ""}
              </p>
            </div>
          </div>
          <div className="flex gap-6 text-right">
            <div>
              <p className="text-xl font-semibold text-text-primary">{clientCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-text-tertiary">Patients</p>
            </div>
            <div>
              <p className="text-xl font-semibold text-text-primary">{staffCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-text-tertiary">Staff</p>
            </div>
            <div>
              <p className="text-xl font-semibold text-text-primary">{serviceCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-text-tertiary">Services</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="neumorphic-card p-5 border border-amber-200 bg-amber-50/40">
          <p className="text-sm font-semibold text-amber-900">No active clinic</p>
          <p className="text-xs text-amber-800 mt-1">
            Create a clinic below, then pick it from the clinic switcher in the header. All staff / services / patients are scoped per clinic.
          </p>
        </div>
      )}

      {/* Primary cards — the four features of the admin panel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {primaryCards.map((c) => {
          const Icon = c.icon;
          const tintBg: Record<string, string> = {
            blue: "bg-blue-50 text-blue-600",
            indigo: "bg-indigo-50 text-indigo-600",
            emerald: "bg-emerald-50 text-emerald-600",
            amber: "bg-amber-50 text-amber-600",
          };
          return (
            <Link
              key={c.href}
              href={c.href}
              className="neumorphic-card group p-5 flex flex-col gap-3 hover:shadow-lg hover:-translate-y-0.5 transition-all"
            >
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${tintBg[c.tint]}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-base font-semibold text-text-primary">{c.title}</p>
                <p className="text-xs text-text-tertiary mt-1 leading-relaxed">{c.description}</p>
              </div>
              <div className="flex items-center justify-between mt-auto pt-3 border-t border-border-light/60">
                <span className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">{c.stat}</span>
                <ArrowRight className="h-4 w-4 text-text-tertiary group-hover:text-text-primary group-hover:translate-x-1 transition-all" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
