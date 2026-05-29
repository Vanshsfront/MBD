// Patients list — Journey D5 entry point.
// Layout follows the 2026-05-29 Claude Design handoff
// (mbd/project/mbd/patients.jsx — PatientsList):
//   - Filter card: search + All/Active/Inactive/VIP segments
//   - Dense table: avatar+name, MRN, primary therapist, last/next visit,
//     lifetime value, flag chips
// URL params (?q, ?filter) drive SSR — no client-side data filtering.

import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { hasPermission, isClinicalRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { activeCentreId } from "@/lib/centre";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FlagBadges } from "@/components/flag-badges";
import { formatINR } from "@/lib/utils";
import { PatientsFilterBar } from "./patients-filter-bar";

export const metadata = { title: "Patients — MBD Clinic OS" };

type ClientStatus = "ACTIVE" | "INACTIVE";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "patients:view_assigned")) redirect("/dashboard");

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const filter = params.filter ?? "active";

  const restrictToOwn = isClinicalRole(session.user.role);
  const centreId = await activeCentreId();
  const me = session.user.id;
  const now = new Date();

  // Clinical scoping (PRD §3.2 Q1): patients connected to me via either an
  // assignment (current or past) or any appointment, never anyone else's.
  const clinicalScope = restrictToOwn
    ? {
        OR: [
          { doctorAssignments: { some: { staffId: me } } },
          { appointments: { some: { therapistId: me } } },
        ],
      }
    : {};

  const statusFilter: { status: { in: ClientStatus[] } } =
    filter === "all"
      ? { status: { in: ["ACTIVE", "INACTIVE"] } }
      : filter === "inactive"
        ? { status: { in: ["INACTIVE"] } }
        : { status: { in: ["ACTIVE"] } };

  // VIP segment narrows to patients with an active VIP-type flag. Search
  // narrows by name / phone / clientCode (case-insensitive). Both can stack
  // with the status filter.
  const searchFilter = q
    ? {
        OR: [
          { firstName: { contains: q, mode: "insensitive" as const } },
          { lastName: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: q } },
          { clientCode: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const vipFilter =
    filter === "vip"
      ? { flags: { some: { isActive: true, type: "VIP" } } }
      : {};

  const clients = await prisma.client.findMany({
    where: {
      ...(centreId ? { centreId } : {}),
      ...clinicalScope,
      ...statusFilter,
      ...searchFilter,
      ...vipFilter,
    },
    orderBy: [{ status: "asc" }, { firstName: "asc" }],
    include: {
      doctorAssignments: {
        where: { endedAt: null },
        orderBy: { isPrimary: "desc" },
        take: 2,
        include: { staff: { select: { name: true } } },
      },
      flags: { where: { isActive: true }, select: { type: true, label: true, color: true } },
      appointments: {
        where: {
          ...(restrictToOwn ? { therapistId: me } : {}),
          startTime: { gte: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { startTime: "asc" },
        select: { id: true, startTime: true, status: true },
        take: 50,
      },
    },
    take: 200,
  });

  // Sum paid amount + count open invoices per client in one round-trip. The
  // groupBy is cheap on the Invoice index (clientId is FK-indexed).
  const clientIds = clients.map((c) => c.id);
  const [paidByClient, unpaidByClient] = await Promise.all([
    clientIds.length
      ? prisma.invoice.groupBy({
          by: ["clientId"],
          where: { clientId: { in: clientIds } },
          _sum: { paidAmount: true },
        })
      : Promise.resolve([] as Array<{ clientId: string; _sum: { paidAmount: number | null } }>),
    clientIds.length
      ? prisma.invoice.groupBy({
          by: ["clientId"],
          where: {
            clientId: { in: clientIds },
            status: { in: ["SENT", "PARTIAL", "OVERDUE"] },
          },
          _count: { _all: true },
        })
      : Promise.resolve([] as Array<{ clientId: string; _count: { _all: number } }>),
  ]);

  const lifetimeByClient = new Map(
    paidByClient.map((row) => [row.clientId, row._sum.paidAmount ?? 0]),
  );
  const unpaidCountByClient = new Map(
    unpaidByClient.map((row) => [row.clientId, row._count._all]),
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Patients</p>
          <h1 className="text-2xl font-semibold tracking-tight">Patient directory</h1>
          <p className="text-sm text-muted-foreground">
            {restrictToOwn ? "Patients connected to you." : "All patients in this centre."}
          </p>
        </div>
      </header>

      <PatientsFilterBar totalCount={clients.length} />

      {clients.length === 0 ? (
        <EmptyState
          title={q ? "No matching patients" : restrictToOwn ? "No patients yet" : "No patients in this filter"}
          description={
            q
              ? "Try a different search term or widen the filter."
              : restrictToOwn
                ? "Wait for the front office to assign you a patient."
                : "Generate an intake QR from New intake → Generate QR."
          }
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="tbl tbl-compact">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Code</th>
                  <th>Primary therapist</th>
                  <th>Last visit</th>
                  <th>Next visit</th>
                  <th className="num">Lifetime</th>
                  <th>Flags</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const upcoming = c.appointments.find(
                    (a) => a.startTime >= now && a.status !== "CANCELLED" && a.status !== "NO_SHOW",
                  );
                  const pastList = c.appointments.filter((a) => a.startTime < now);
                  const last = pastList[pastList.length - 1] ?? null;
                  const primary =
                    c.doctorAssignments[0]?.staff?.name ?? null;
                  const initials = `${c.firstName?.[0] ?? ""}${c.lastName?.[0] ?? ""}`
                    .toUpperCase()
                    || "?";
                  const lifetime = lifetimeByClient.get(c.id) ?? 0;
                  const unpaidCount = unpaidCountByClient.get(c.id) ?? 0;
                  return (
                    <tr key={c.id} className="cursor-pointer">
                      <td>
                        <Link
                          href={`/dashboard/patients/${c.id}`}
                          className="flex items-center gap-3"
                        >
                          <span className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-foreground">
                            {initials}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-foreground">
                              {c.firstName} {c.lastName}
                            </span>
                            <span className="block text-[11px] text-[color:var(--text-tertiary)]">
                              {c.age != null ? `${c.age}${c.sex ?? ""} · ` : ""}
                              {c.phone}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="muted font-mono text-[11.5px]">{c.clientCode}</td>
                      <td>
                        {primary ?? <span className="text-[color:var(--text-tertiary)]">—</span>}
                      </td>
                      <td className="muted tabular">
                        {last ? formatApptDate(last.startTime) : "—"}
                      </td>
                      <td className="tabular">
                        {upcoming ? (
                          <span className="text-emerald-700">{formatApptDate(upcoming.startTime)}</span>
                        ) : (
                          <span className="text-[color:var(--text-tertiary)]">—</span>
                        )}
                      </td>
                      <td className="num tabular">{lifetime > 0 ? formatINR(lifetime) : "—"}</td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1">
                          <FlagBadges flags={c.flags} max={2} />
                          {c.status === "INACTIVE" ? (
                            <Badge variant="outline">INACTIVE</Badge>
                          ) : null}
                          {unpaidCount > 0 ? (
                            <span className="chip chip-warning">
                              {unpaidCount} unpaid
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="num">
                        <Link
                          href={`/dashboard/patients/${c.id}`}
                          aria-label={`Open ${c.firstName} ${c.lastName}`}
                        >
                          <ChevronRight
                            className="h-4 w-4 text-[color:var(--text-tertiary)]"
                            aria-hidden
                          />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function formatApptDate(d: Date): string {
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
