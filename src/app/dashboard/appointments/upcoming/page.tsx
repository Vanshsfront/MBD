import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { activeCentreId } from "@/lib/centre";
import { formatClinicDate, formatClinicTime } from "@/lib/date-format";
import { hasPermission, isClinicalRole } from "@/lib/permissions";
import { formatPatientName } from "@/lib/patient-display";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Upcoming appointments — MBD Clinic OS" };

const DEFAULT_WINDOW_DAYS = 30;

export default async function UpcomingAppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ therapistId?: string; show?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "appointments:view_calendar_all")) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const centreId = await activeCentreId();
  const restrictToOwn = isClinicalRole(session.user.role);
  const showAll = params.show === "all";
  const requestedTherapistId = params.therapistId ?? "";
  const therapistId = restrictToOwn ? session.user.id : requestedTherapistId;

  const now = new Date();
  const defaultEnd = new Date(now.getTime() + DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [therapists, appointments] = await Promise.all([
    prisma.staff.findMany({
      where: {
        isActive: true,
        role: { in: ["THERAPIST", "CONSULTANT", "ADMIN"] },
        ...(centreId ? { centreId } : {}),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, designation: true },
    }),
    prisma.appointment.findMany({
      where: {
        startTime: showAll ? { gte: now } : { gte: now, lte: defaultEnd },
        status: { in: ["CONFIRMED", "RESCHEDULED"] },
        ...(centreId ? { centreId } : {}),
        ...(therapistId ? { therapistId } : {}),
      },
      orderBy: { startTime: "asc" },
      take: showAll ? 500 : 200,
      include: {
        client: {
          select: {
            id: true,
            title: true,
            firstName: true,
            lastName: true,
            clientCode: true,
            phone: true,
          },
        },
        therapist: { select: { name: true } },
        service: { select: { name: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Schedule</p>
          <h1 className="text-2xl font-semibold tracking-tight">Upcoming appointments</h1>
          <p className="text-sm text-muted-foreground">
            {showAll
              ? "All future confirmed and rescheduled appointments."
              : `Next ${DEFAULT_WINDOW_DAYS} days. Use Show all to include long-term bookings.`}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/calendar">Open calendar</Link>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-[minmax(220px,320px)_180px_auto] md:items-end">
            {!restrictToOwn ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="therapistId">
                  Therapist
                </label>
                <select
                  id="therapistId"
                  name="therapistId"
                  defaultValue={requestedTherapistId}
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                >
                  <option value="">All therapists</option>
                  {therapists.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.designation ? ` · ${t.designation}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <input type="hidden" name="therapistId" value={session.user.id} />
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="show">
                Window
              </label>
              <select
                id="show"
                name="show"
                defaultValue={showAll ? "all" : "window"}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="window">Next {DEFAULT_WINDOW_DAYS} days</option>
                <option value="all">Show all upcoming</option>
              </select>
            </div>
            <Button type="submit">Apply</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Appointments ({appointments.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {appointments.length === 0 ? (
            <EmptyState
              className="border-0"
              title="No upcoming appointments"
              description="Change filters or book from the calendar."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Time</th>
                    <th className="px-4 py-2 text-left">Patient</th>
                    <th className="px-4 py-2 text-left">Therapist</th>
                    <th className="px-4 py-2 text-left">Service</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {appointments.map((a) => (
                    <tr key={a.id} className="hover:bg-secondary/60">
                      <td className="px-4 py-3 font-medium">
                        {formatClinicDate(a.startTime, {
                          weekday: "short",
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatClinicTime(a.startTime, {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })}{" "}
                        -{" "}
                        {formatClinicTime(a.endTime, {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/patients/${a.client.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {formatPatientName(a.client)}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {a.client.clientCode}
                          {a.client.phone ? ` · ${a.client.phone}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3">{a.therapist.name}</td>
                      <td className="px-4 py-3">{a.service?.name ?? "Service TBD"}</td>
                      <td className="px-4 py-3">
                        <Badge variant={a.status === "CONFIRMED" ? "success" : "warning"}>
                          {a.status.toLowerCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
