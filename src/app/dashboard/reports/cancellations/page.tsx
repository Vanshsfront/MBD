import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { activeCentreId } from "@/lib/centre";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { nativeControlClass } from "@/lib/select-styles";

export const metadata = { title: "Cancellations — MBD Clinic OS" };

export default async function CancellationsReport({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "reports:view")) redirect("/dashboard");

  const sp = await searchParams;
  const now = new Date();
  const from = sp.from ? new Date(sp.from) : new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = sp.to ? new Date(sp.to) : now;

  const centreId = await activeCentreId();
  const centreFilter = centreId ? { centreId } : {};
  const baseFilter = {
    ...centreFilter,
    status: "CANCELLED" as const,
    startTime: { gte: from, lte: to },
  };

  const [byPatient, byTherapist, byClinic, recent] = await Promise.all([
    prisma.appointment.count({ where: { ...baseFilter, cancelledBy: "PATIENT" } }),
    prisma.appointment.count({ where: { ...baseFilter, cancelledBy: "THERAPIST" } }),
    prisma.appointment.count({ where: { ...baseFilter, cancelledBy: "CLINIC" } }),
    prisma.appointment.findMany({
      where: baseFilter,
      orderBy: { cancelledAt: "desc" },
      take: 30,
      include: {
        client: { select: { id: true, firstName: true, lastName: true, clientCode: true } },
        therapist: { select: { name: true } },
      },
    }),
  ]);

  const total = byPatient + byTherapist + byClinic;
  const noShow = await prisma.appointment.count({
    where: { ...centreFilter, status: "NO_SHOW", startTime: { gte: from, lte: to } },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Cancellations</h1>
        <p className="text-sm text-muted-foreground">
          Split by who cancelled. No-shows tracked separately.
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="By patient" value={byPatient} share={percent(byPatient, total)} variant="warning" />
        <Stat label="By therapist" value={byTherapist} share={percent(byTherapist, total)} variant="info" />
        <Stat label="By clinic" value={byClinic} share={percent(byClinic, total)} />
        <Stat label="No-show" value={noShow} share={null} variant="danger" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent cancellations</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recent.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">No cancellations in range.</p>
          ) : (
            <ul className="divide-y">
              {recent.map((a) => (
                <li key={a.id} className="px-6 py-3 text-sm">
                  <Link
                    href={`/dashboard/patients/${a.client.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 transition-colors hover:opacity-80"
                  >
                    <div>
                      <p className="font-medium">
                        {a.client.firstName} {a.client.lastName}{" "}
                        <span className="text-muted-foreground">({a.client.clientCode})</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.therapist.name} · {a.startTime.toLocaleString("en-IN")}
                        {a.cancelledReason ? ` · ${a.cancelledReason}` : ""}
                      </p>
                    </div>
                    <Badge
                      variant={
                        a.cancelledBy === "PATIENT"
                          ? "warning"
                          : a.cancelledBy === "THERAPIST"
                            ? "info"
                            : "default"
                      }
                    >
                      {a.cancelledBy ?? "—"}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  share,
  variant,
}: {
  label: string;
  value: number;
  share: string | null;
  variant?: "warning" | "info" | "danger";
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
        {share ? (
          <Badge variant={variant ?? "default"} className="mt-2">
            {share}
          </Badge>
        ) : null}
      </CardContent>
    </Card>
  );
}

function percent(part: number, total: number): string {
  if (total === 0) return "0%";
  return `${((part / total) * 100).toFixed(0)}%`;
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
