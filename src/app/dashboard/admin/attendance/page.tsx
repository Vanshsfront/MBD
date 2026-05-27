// Admin attendance — daily grid for the past 14 days. Rows = active staff,
// cols = days. Cells show CHECK_IN time (top) + CHECK_OUT time (bottom) if
// recorded that day.

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { activeCentreId } from "@/lib/centre";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Attendance — MBD Clinic OS" };

const DAYS_BACK = 14;

export default async function AttendancePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "admin:attendance")) redirect("/dashboard");

  const centreId = await activeCentreId();
  const today = startOfDay(new Date());
  const from = new Date(today.getTime() - DAYS_BACK * 24 * 3600_000);
  const to = new Date(today.getTime() + 24 * 3600_000);

  // Build the day axis (oldest → newest, inclusive of today).
  const days: Date[] = [];
  for (let i = DAYS_BACK; i >= 0; i--) {
    days.push(new Date(today.getTime() - i * 24 * 3600_000));
  }

  const [staff, logs] = await Promise.all([
    prisma.staff.findMany({
      where: {
        isActive: true,
        ...(centreId ? { centreId } : {}),
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, role: true, designation: true },
    }),
    prisma.attendanceLog.findMany({
      where: { date: { gte: from, lt: to } },
      orderBy: { date: "asc" },
    }),
  ]);

  // Map: staffId -> dayKey -> { checkIn?: Date, checkOut?: Date }
  type Cell = { checkIn?: Date; checkOut?: Date };
  const grid = new Map<string, Map<string, Cell>>();
  for (const l of logs) {
    const key = dayKey(l.date);
    if (!grid.has(l.staffId)) grid.set(l.staffId, new Map());
    const row = grid.get(l.staffId)!;
    const cell = row.get(key) ?? {};
    if (l.type === "CHECK_IN") cell.checkIn = l.date;
    else if (l.type === "CHECK_OUT") cell.checkOut = l.date;
    row.set(key, cell);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
        <p className="text-sm text-muted-foreground">
          Last {DAYS_BACK} days. Each cell shows check-in (top) and check-out (bottom) time.
          Staff record their own via the Profile page.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>
            Daily grid ({staff.length} staff × {days.length} days)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/40 uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left">Staff</th>
                  {days.map((d) => (
                    <th key={d.toISOString()} className="whitespace-nowrap px-2 py-2 text-center">
                      <div>{d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</div>
                      <div className="text-[10px] font-normal opacity-70">
                        {d.toLocaleDateString("en-IN", { weekday: "short" })}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {staff.length === 0 ? (
                  <tr>
                    <td
                      colSpan={days.length + 1}
                      className="px-3 py-4 text-center text-muted-foreground"
                    >
                      No active staff in this centre.
                    </td>
                  </tr>
                ) : (
                  staff.map((s) => (
                    <tr key={s.id}>
                      <td className="sticky left-0 z-10 bg-background px-3 py-2 align-top">
                        <p className="font-medium">{s.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {s.designation ?? s.role}
                        </p>
                      </td>
                      {days.map((d) => {
                        const cell = grid.get(s.id)?.get(dayKey(d));
                        return (
                          <td
                            key={d.toISOString()}
                            className="px-2 py-2 text-center tabular-nums"
                          >
                            {cell?.checkIn || cell?.checkOut ? (
                              <div className="space-y-0.5">
                                <div className="text-emerald-600 dark:text-emerald-400">
                                  {cell.checkIn
                                    ? cell.checkIn.toLocaleTimeString("en-IN", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        hour12: false,
                                      })
                                    : "—"}
                                </div>
                                <div className="text-rose-600 dark:text-rose-400">
                                  {cell.checkOut
                                    ? cell.checkOut.toLocaleTimeString("en-IN", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        hour12: false,
                                      })
                                    : "—"}
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground/40">·</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
