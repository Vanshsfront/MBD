import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission, isClinicalRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { FlagBadges } from "@/components/flag-badges";
import { AccessBlocked } from "./access-blocked";
import { PatientSubTabs } from "./patient-sub-tabs";

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
    select: {
      firstName: true,
      lastName: true,
      clientCode: true,
      status: true,
      age: true,
      sex: true,
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

  const initials = `${client.firstName?.[0] ?? ""}${client.lastName?.[0] ?? ""}`.toUpperCase() || "?";
  const ageSex = [client.age, client.sex].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6">
      {/* Sticky patient header — name, status, code, age/sex, flags stay
        * visible across all sub-tab scrolling. Z-index sits above children
        * but below the dashboard top bar. The cream gradient under the
        * dashboard backs the blur. */}
      <header className="sticky top-0 z-20 -mx-6 space-y-2.5 border-b border-[color:var(--border-light)] bg-card/90 px-6 pb-2.5 pt-3 backdrop-blur lg:-mx-10 lg:px-10">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-[color:var(--text-primary)] ring-1 ring-inset ring-[color:var(--border)]"
          >
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="truncate text-xl font-semibold tracking-tight">
                {client.firstName} {client.lastName}
              </h1>
              <Badge variant={client.status === "ACTIVE" ? "success" : "default"}>
                {client.status}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              {ageSex ? <span className="chip">{ageSex}</span> : null}
              <span className="chip font-mono">{client.clientCode}</span>
            </div>
          </div>
          {client.flags.length > 0 ? (
            <div className="hidden max-w-[40%] shrink-0 flex-wrap justify-end gap-1 sm:flex">
              <FlagBadges flags={client.flags} max={3} />
            </div>
          ) : null}
        </div>
        {client.flags.length > 0 ? (
          <div className="-mt-1 flex flex-wrap gap-1 sm:hidden">
            <FlagBadges flags={client.flags} max={3} />
          </div>
        ) : null}
        <PatientSubTabs tabs={tabs} />
      </header>
      {children}
    </div>
  );
}
