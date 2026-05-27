// Session log — PRD §8 / Phase 7. List of delivered sessions for the active
// centre, scoped to the user's assignments for clinical roles. Filterable
// by therapist + date.

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission, isClinicalRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { activeCentreId } from "@/lib/centre";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/utils";

export const metadata = { title: "Sessions — MBD Clinic OS" };

interface SearchParams {
  from?: string;
  to?: string;
  therapistId?: string;
  status?: string;
}

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "patients:view_assigned")) redirect("/dashboard");

  const sp = await searchParams;
  const now = new Date();
  const fromDefault = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = sp.from ? new Date(sp.from) : fromDefault;
  const to = sp.to ? new Date(sp.to) : new Date();
  const restrictToOwn = isClinicalRole(session.user.role);

  const centreId = await activeCentreId();

  const sessions = await prisma.session.findMany({
    where: {
      ...(centreId ? { centreId } : {}),
      sessionDate: { gte: from, lte: to },
      ...(restrictToOwn ? { therapistId: session.user.id } : {}),
      ...(sp.therapistId && !restrictToOwn ? { therapistId: sp.therapistId } : {}),
      ...(sp.status && sp.status !== "all" ? { status: sp.status } : {}),
    },
    orderBy: { sessionDate: "desc" },
    take: 200,
    include: {
      client: { select: { id: true, firstName: true, lastName: true, clientCode: true } },
      therapist: { select: { id: true, name: true } },
      service: { select: { name: true, basePrice: true } },
    },
  });

  // Therapist filter dropdown — non-clinical roles only.
  const therapists = restrictToOwn
    ? []
    : await prisma.staff.findMany({
        where: {
          isActive: true,
          role: { in: ["THERAPIST", "CONSULTANT", "ADMIN"] },
          ...(centreId ? { centreId } : {}),
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });

  const fromIso = toLocalIsoDate(from);
  const toIso = toLocalIsoDate(to);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
        <p className="text-sm text-muted-foreground">
          {sessions.length} delivered session{sessions.length === 1 ? "" : "s"} in range.
        </p>
      </header>

      <Card>
        <CardContent className="p-4">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">From</label>
              <input
                type="date"
                name="from"
                defaultValue={fromIso}
                className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">To</label>
              <input
                type="date"
                name="to"
                defaultValue={toIso}
                className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              />
            </div>
            {!restrictToOwn ? (
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Therapist
                </label>
                <select
                  name="therapistId"
                  defaultValue={sp.therapistId ?? ""}
                  className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                >
                  <option value="">All</option>
                  {therapists.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">Status</label>
              <select
                name="status"
                defaultValue={sp.status ?? "all"}
                className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              >
                <option value="all">All</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="NO_SHOW">No-show</option>
              </select>
            </div>
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Apply
            </button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sessions.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">
              No sessions in this range.
            </p>
          ) : (
            <ul className="divide-y">
              {sessions.map((s) => (
                <li key={s.id} className="px-6 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
                    <div>
                      <p className="font-medium">
                        <Link
                          href={`/dashboard/patients/${s.client.id}`}
                          className="hover:underline"
                        >
                          {s.client.firstName} {s.client.lastName}
                        </Link>{" "}
                        <span className="text-muted-foreground">
                          ({s.client.clientCode})
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.sessionDate.toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        · {s.service.name} · {s.therapist.name}
                      </p>
                      {s.treatmentNotes ? (
                        <p className="mt-1 line-clamp-2 text-xs">{s.treatmentNotes}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {s.perSessionAmount != null ? (
                        <span className="tabular-nums text-xs">
                          {formatINR(s.perSessionAmount)}
                        </span>
                      ) : null}
                      <Badge
                        variant={
                          s.status === "COMPLETED"
                            ? "success"
                            : s.status === "CANCELLED" || s.status === "NO_SHOW"
                              ? "danger"
                              : "info"
                        }
                      >
                        {s.status}
                      </Badge>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
