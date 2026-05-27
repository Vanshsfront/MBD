import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { activeCentreId } from "@/lib/centre";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/utils";
import { nativeControlClass } from "@/lib/select-styles";

export const metadata = { title: "Staff productivity — MBD Clinic OS" };

export default async function StaffReport({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "reports:view")) redirect("/dashboard");

  const sp = await searchParams;
  const now = new Date();
  const fromDefault = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const from = sp.from ? new Date(sp.from) : fromDefault;
  const to = sp.to ? new Date(sp.to) : new Date();

  const centreId = await activeCentreId();

  const staff = await prisma.staff.findMany({
    where: {
      isActive: true,
      role: { in: ["THERAPIST", "CONSULTANT", "ADMIN"] },
      ...(centreId ? { centreId } : {}),
    },
    orderBy: { name: "asc" },
    include: {
      department: { select: { name: true } },
    },
  });

  const rows = await Promise.all(
    staff.map(async (s) => {
      const [completed, cancelledByPatient, cancelledByTherapist, noShow, sessionsCompleted, revenue] =
        await Promise.all([
          prisma.appointment.count({
            where: {
              therapistId: s.id,
              startTime: { gte: from, lte: to },
              status: "COMPLETED",
            },
          }),
          prisma.appointment.count({
            where: {
              therapistId: s.id,
              startTime: { gte: from, lte: to },
              status: "CANCELLED",
              cancelledBy: "PATIENT",
            },
          }),
          prisma.appointment.count({
            where: {
              therapistId: s.id,
              startTime: { gte: from, lte: to },
              status: "CANCELLED",
              cancelledBy: "THERAPIST",
            },
          }),
          prisma.appointment.count({
            where: {
              therapistId: s.id,
              startTime: { gte: from, lte: to },
              status: "NO_SHOW",
            },
          }),
          prisma.session.count({
            where: { therapistId: s.id, sessionDate: { gte: from, lte: to }, status: "COMPLETED" },
          }),
          prisma.session.aggregate({
            where: { therapistId: s.id, sessionDate: { gte: from, lte: to }, status: "COMPLETED" },
            _sum: { perSessionAmount: true },
          }),
        ]);
      return {
        id: s.id,
        name: s.name,
        designation: s.designation,
        department: s.department?.name ?? null,
        completed,
        cancelledByPatient,
        cancelledByTherapist,
        noShow,
        sessionsCompleted,
        revenue: revenue._sum.perSessionAmount ?? 0,
      };
    }),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Staff productivity</h1>
        <p className="text-sm text-muted-foreground">
          Date range filter (defaults to last full month). Salary / incentive calc is{" "}
          <strong>not auto-computed</strong> per PRD §10 — export and apply your own formula offline.
        </p>
      </header>

      <Card>
        <CardContent className="p-4">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <DateInput name="from" defaultValue={toIsoOnly(from)} label="From" />
            <DateInput name="to" defaultValue={toIsoOnly(to)} label="To" />
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
          <CardTitle>Per-staff breakdown ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Staff</th>
                  <th className="px-3 py-2 text-left">Department</th>
                  <th className="px-3 py-2 text-right">Completed</th>
                  <th className="px-3 py-2 text-right">Sessions</th>
                  <th className="px-3 py-2 text-right">Cx by patient</th>
                  <th className="px-3 py-2 text-right">Cx by therapist</th>
                  <th className="px-3 py-2 text-right">No-show</th>
                  <th className="px-3 py-2 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.designation ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2">{r.department ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.completed}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.sessionsCompleted}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.cancelledByPatient}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.cancelledByTherapist}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.noShow}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DateInput({
  name,
  defaultValue,
  label,
}: {
  name: string;
  defaultValue: string;
  label: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</label>
      <input
        type="date"
        name={name}
        defaultValue={defaultValue}
        className={nativeControlClass}
      />
    </div>
  );
}

function toIsoOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
