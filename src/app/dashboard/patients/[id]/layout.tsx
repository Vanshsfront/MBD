import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission, isClinicalRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { FlagBadges } from "@/components/flag-badges";
import { AccessBlocked } from "./access-blocked";

export default async function PatientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "patients:view_assigned")) redirect("/dashboard");

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      // Both assignments AND appointments scoped to me — a clinical user may
      // legitimately reach this page via either a (current/past) assignment
      // OR a (past/future) appointment. Only the truly-unrelated are blocked.
      // The clinical sub-page still renders reassigned-away as view-only.
      doctorAssignments: { select: { staffId: true } },
      appointments: {
        where: isClinicalRole(session.user.role)
          ? { therapistId: session.user.id }
          : undefined,
        select: { id: true },
        take: 1,
      },
      flags: { where: { isActive: true }, select: { type: true, label: true, color: true } },
    },
  });
  if (!client) notFound();

  // Enforce relationship-based visibility for clinical roles (PRD §3.2 Q1).
  // "Related" = ever-assigned OR has any appointment with me. Truly
  // unrelated → a clear blocked card, NOT a silent redirect.
  if (isClinicalRole(session.user.role)) {
    const everAssigned = client.doctorAssignments.some((a) => a.staffId === session.user.id);
    const everBooked = client.appointments.length > 0;
    if (!everAssigned && !everBooked) {
      return (
        <div className="py-10">
          <AccessBlocked />
        </div>
      );
    }
  }

  const tabs = [
    { href: `/dashboard/patients/${id}`, label: "Overview" },
    { href: `/dashboard/patients/${id}/clinical`, label: "Clinical record" },
    { href: `/dashboard/patients/${id}/packages`, label: "Packages" },
    { href: `/dashboard/patients/${id}/invoices`, label: "Invoices" },
  ];

  return (
    <div className="space-y-6">
      {/* Sticky patient header — name, status, code, and flags stay visible
        * across all sub-tab scrolling. Z-index keeps it above the children's
        * content; the cream gradient under the dashboard backs the blur. */}
      <header className="sticky top-0 z-20 -mx-6 space-y-3 border-b border-[color:var(--border-light)] bg-card/90 px-6 pb-3 pt-4 backdrop-blur lg:-mx-10 lg:px-10">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {client.firstName} {client.lastName}
          </h1>
          <Badge variant={client.status === "ACTIVE" ? "success" : "default"}>
            {client.status}
          </Badge>
          <span className="text-sm text-muted-foreground">{client.clientCode}</span>
          <FlagBadges flags={client.flags} />
        </div>
        <nav className="flex flex-wrap gap-1">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[active=true]:border-primary data-[active=true]:text-foreground"
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
