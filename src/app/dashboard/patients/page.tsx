import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission, isClinicalRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { activeCentreId } from "@/lib/centre";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FlagBadges } from "@/components/flag-badges";

export const metadata = { title: "Patients — MBD Clinic OS" };

export default async function PatientsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "patients:view_assigned")) redirect("/dashboard");

  const restrictToOwn = isClinicalRole(session.user.role);
  const centreId = await activeCentreId();

  const clients = await prisma.client.findMany({
    where: {
      ...(centreId ? { centreId } : {}),
      ...(restrictToOwn
        ? {
            doctorAssignments: {
              some: { staffId: session.user.id, endedAt: null },
            },
          }
        : {}),
      status: { in: ["ACTIVE", "INACTIVE"] },
    },
    orderBy: [{ status: "asc" }, { firstName: "asc" }],
    include: {
      doctorAssignments: {
        where: { endedAt: null },
        include: { staff: { select: { name: true } } },
      },
      flags: { where: { isActive: true }, select: { type: true, label: true, color: true } },
    },
    take: 200,
  });

  if (clients.length === 0) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Patients</h1>
          <p className="text-sm text-muted-foreground">
            {restrictToOwn ? "Patients currently assigned to you." : "All active patients."}
          </p>
        </header>
        <EmptyState
          title={restrictToOwn ? "No patients assigned to you yet" : "No patients yet"}
          description={
            restrictToOwn
              ? "Wait for the front office to assign you a patient."
              : "Generate an intake QR from New intake → Generate QR."
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Patients</h1>
          <p className="text-sm text-muted-foreground">
            {restrictToOwn ? "Patients currently assigned to you." : "All patients in this centre."}{" "}
            <span className="ml-1 text-muted-foreground">({clients.length})</span>
          </p>
        </div>
      </header>

      <Card>
        <CardContent className="p-0">
          <ul className="divide-y">
            {clients.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard/patients/${c.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 transition-colors hover:bg-accent"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">
                        {c.firstName} {c.lastName}
                      </p>
                      <FlagBadges flags={c.flags} max={4} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {c.clientCode} · {c.phone}
                      {c.age != null ? ` · ${c.age}${c.sex ?? ""}` : ""}
                      {c.doctorAssignments.length > 0
                        ? ` · ${c.doctorAssignments.map((a) => a.staff?.name).filter(Boolean).join(", ")}`
                        : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Registered {formatRegisteredOn(c.createdAt)}
                    </p>
                  </div>
                  <Badge variant={c.status === "ACTIVE" ? "success" : "default"}>
                    {c.status}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function formatRegisteredOn(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  // Full DD MMM YYYY per client request 10 Apr 2026 (not month-only).
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
