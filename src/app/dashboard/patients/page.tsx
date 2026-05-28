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
  const me = session.user.id;
  const now = new Date();

  // Clinical scoping: include patients with EITHER any (active or ended)
  // assignment to me, OR any appointment with me — past or future. Prior
  // behaviour only matched current active assignments, which hid patients
  // whose only link was an upcoming booking or a closed historical
  // assignment. PRD §3.2 Q1 still applies (no cross-therapist snooping):
  // both branches gate on me.
  const clinicalScope = restrictToOwn
    ? {
        OR: [
          { doctorAssignments: { some: { staffId: me } } },
          { appointments: { some: { therapistId: me } } },
        ],
      }
    : {};

  const clients = await prisma.client.findMany({
    where: {
      ...(centreId ? { centreId } : {}),
      ...clinicalScope,
      status: { in: ["ACTIVE", "INACTIVE"] },
    },
    orderBy: [{ status: "asc" }, { firstName: "asc" }],
    include: {
      flags: { where: { isActive: true }, select: { type: true, label: true, color: true } },
      // Surface next upcoming and most-recent past appointment so the row
      // shows a "Next: ..." or "Last: ..." hint. We only need a small slice
      // around "now" (last ~60 days + everything upcoming) — that bounds
      // the per-patient row count to a couple dozen at most, vs unbounded
      // history which would explode with 200 patients × 100 appointments.
      appointments: {
        where: {
          ...(restrictToOwn ? { therapistId: me } : {}),
          startTime: {
            gte: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
          },
        },
        orderBy: { startTime: "asc" },
        select: { id: true, startTime: true, status: true, therapistId: true },
        take: 50,
      },
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
            {clients.map((c) => {
              // Appointments come ordered ascending by startTime; pull the
              // first one in the future and the most recent one in the past
              // (cancelled/no-show appointments excluded from the "next" hint
              // so the therapist sees real upcoming work, not stale cancels).
              const upcomingActive = c.appointments
                .filter(
                  (a) =>
                    new Date(a.startTime) >= now &&
                    a.status !== "CANCELLED" &&
                    a.status !== "NO_SHOW",
                );
              const next = upcomingActive[0] ?? null;
              const pastList = c.appointments.filter(
                (a) => new Date(a.startTime) < now,
              );
              const last = pastList[pastList.length - 1] ?? null;
              return (
                <li key={c.id}>
                  <Link
                    href={`/dashboard/patients/${c.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-6 py-2.5 transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">
                          {c.firstName} {c.lastName}
                        </p>
                        <FlagBadges flags={c.flags} max={4} />
                      </div>
                      {/* Phone · age · gender as discrete, evenly spaced fields.
                         Gender is colour-coded: M blue, F pink. */}
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                        {c.phone ? <span>{c.phone}</span> : null}
                        {c.age != null ? <span>{c.age} yrs</span> : null}
                        {c.sex ? <span className={sexColor(c.sex)}>{c.sex}</span> : null}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Registered {formatRegisteredOn(c.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={c.status === "ACTIVE" ? "success" : "default"}>
                        {c.status}
                      </Badge>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {c.clientCode}
                      </span>
                      {next ? (
                        <span className="text-[11px] font-medium text-emerald-700">
                          Next: {formatApptDate(next.startTime)}
                        </span>
                      ) : last ? (
                        <span className="text-[11px] text-muted-foreground">
                          Last: {formatApptDate(last.startTime)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          No appointments
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// Gender colour cue: M → blue, F → pink, anything else stays muted.
function sexColor(sex: string): string {
  const s = sex.trim().toUpperCase();
  if (s === "M") return "font-medium text-blue-600";
  if (s === "F") return "font-medium text-pink-600";
  return "";
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

function formatApptDate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
