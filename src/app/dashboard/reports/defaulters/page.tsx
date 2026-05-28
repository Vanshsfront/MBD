import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { activeCentreId } from "@/lib/centre";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Defaulters — MBD Clinic OS" };

export default async function DefaultersReport({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; threshold?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "reports:view")) redirect("/dashboard");

  const sp = await searchParams;
  // Bound both params — an unbounded windowDays would scan years of
  // appointments on a busy centre; threshold should stay sane.
  const windowDays = clamp(Number(sp.window ?? "30"), 1, 365, 30);
  const threshold = clamp(Number(sp.threshold ?? "3"), 1, 100, 3);

  const since = new Date();
  since.setDate(since.getDate() - windowDays);

  const centreId = await activeCentreId();

  // Group cancelled-by-PATIENT counts per client.
  const grouped = await prisma.appointment.groupBy({
    by: ["clientId"],
    where: {
      ...(centreId ? { centreId } : {}),
      status: "CANCELLED",
      cancelledBy: "PATIENT",
      startTime: { gte: since },
    },
    _count: { _all: true },
    having: { clientId: { _count: { gte: threshold } } },
    orderBy: { _count: { clientId: "desc" } },
    take: 50,
  });

  const clientIds = grouped.map((g) => g.clientId);
  const clients = clientIds.length
    ? await prisma.client.findMany({
        where: { id: { in: clientIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          clientCode: true,
          phone: true,
          customerType: true,
        },
      })
    : [];
  const byId = new Map(clients.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Defaulters</h1>
        <p className="text-sm text-muted-foreground">
          Patients with ≥ {threshold} patient-side cancellations in the last {windowDays} days.
        </p>
      </header>

      <Card>
        <CardContent className="p-4">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <NumberInput name="threshold" defaultValue={threshold} label="Threshold" />
            <NumberInput name="window" defaultValue={windowDays} label="Window (days)" />
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
          <CardTitle>Defaulters ({grouped.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {grouped.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">
              No patients exceed the threshold in this window.
            </p>
          ) : (
            <ul className="divide-y">
              {grouped.map((g) => {
                const c = byId.get(g.clientId);
                if (!c) return null;
                return (
                  <li key={g.clientId} className="px-6 py-3">
                    <Link
                      href={`/dashboard/patients/${c.id}`}
                      className="flex items-center justify-between gap-3 text-sm transition-colors hover:opacity-80"
                    >
                      <div>
                        <p className="font-medium">
                          {c.firstName} {c.lastName}{" "}
                          <span className="text-muted-foreground">({c.clientCode})</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {c.phone}
                          {c.customerType ? ` · ${c.customerType}` : ""}
                        </p>
                      </div>
                      <Badge variant="danger">{g._count._all} cancellations</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Clamp a number coming from a URL param. NaN / Infinity / negative → fallback.
function clamp(n: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

function NumberInput({
  name,
  defaultValue,
  label,
}: {
  name: string;
  defaultValue: number;
  label: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</label>
      <input
        type="number"
        min={1}
        name={name}
        defaultValue={defaultValue}
        className="flex h-9 w-32 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
      />
    </div>
  );
}
