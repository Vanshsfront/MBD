import { redirect } from "next/navigation";
import { Check, QrCode } from "lucide-react";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { activeCentreId } from "@/lib/centre";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AssignDashboard } from "./assign-client";
import { IntakeQueueRefresher } from "@/components/realtime/intake-queue-refresher";
import { CATEGORY_KEYS, type ServiceCategoryKey } from "@/lib/categories";

export const metadata = { title: "Assignment queue — MBD Clinic OS" };

export default async function AssignPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "patients:assign_therapist")) {
    redirect("/dashboard");
  }

  const centreId = await activeCentreId();
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const [drafts, therapistsAndConsultants, referralSources, assignedTodayCount, recentAssignmentsForWait] =
    await Promise.all([
      // Queue includes both DRAFT clients (intake → assign → consent path)
      // AND already-ACTIVE clients who never finished consent (FO switched
      // away mid-flow). The latter get auto-routed to the consent step on
      // selection so they can finish without going through assignment again.
      prisma.client.findMany({
        where: {
          OR: [
            { status: "DRAFT" },
            {
              status: "ACTIVE",
              intakeForms: { some: { consentSigned: false } },
            },
          ],
          ...(centreId ? { centreId } : {}),
        },
        orderBy: { createdAt: "asc" },
        include: {
          intakeForms: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      }),
      prisma.staff.findMany({
        where: {
          isActive: true,
          role: { in: ["THERAPIST", "CONSULTANT", "ADMIN"] },
          ...(centreId ? { centreId } : {}),
        },
        orderBy: { name: "asc" },
        include: { department: { select: { name: true } } },
      }),
      prisma.referralSource.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.clientDoctorAssignment.count({
        where: {
          assignedAt: { gte: startOfDay },
          ...(centreId ? { client: { centreId } } : {}),
        },
      }),
      // Pull the most-recent ~20 assignments along with their client's
      // createdAt so we can compute avg wait time in JS. Bounded sample —
      // a centre with 200 assignments/day still pays only 20 reads here.
      prisma.clientDoctorAssignment.findMany({
        where: {
          assignedAt: { gte: startOfDay },
          ...(centreId ? { client: { centreId } } : {}),
        },
        orderBy: { assignedAt: "desc" },
        take: 20,
        select: {
          assignedAt: true,
          client: { select: { createdAt: true } },
        },
      }),
    ]);

  const queueWaitingNow = drafts.length;
  const therapistsOnDuty = therapistsAndConsultants.filter(
    (s) => s.role === "THERAPIST" || s.role === "CONSULTANT",
  ).length;

  // Avg wait — minutes between client.createdAt and assignment.assignedAt.
  let avgWaitMinutes: number | null = null;
  if (recentAssignmentsForWait.length > 0) {
    const total = recentAssignmentsForWait.reduce(
      (s, a) => s + (a.assignedAt.getTime() - a.client.createdAt.getTime()) / 60_000,
      0,
    );
    avgWaitMinutes = Math.max(0, Math.round(total / recentAssignmentsForWait.length));
  }

  return (
    <div className="space-y-4">
      {/* Realtime watcher — refreshes when a new intake submits. Silent
        * no-op if Realtime isn't enabled on IntakeToken / Client tables. */}
      <IntakeQueueRefresher />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Patients</p>
          <h1 className="text-2xl font-semibold tracking-tight">Assignment queue</h1>
          <p className="text-sm text-muted-foreground">Patients awaiting therapist allocation.</p>
        </div>
        <Button asChild size="sm">
          <Link href="/dashboard/intake">
            <QrCode className="h-4 w-4" aria-hidden /> Open intake QR
          </Link>
        </Button>
      </header>

      {/* Live status strip (audit n=5) — replaces the previous dashed empty box */}
      <div className="grid grid-cols-2 gap-3 rounded-2xl bg-card/70 p-5 ring-1 ring-[color:var(--border-light)] shadow-[0_1px_2px_0_var(--shadow-color)] sm:grid-cols-4">
        <QueueStat
          label="Waiting now"
          value={queueWaitingNow}
          live={queueWaitingNow > 0}
        />
        <QueueStat label="Assigned today" value={assignedTodayCount} />
        <QueueStat
          label="Avg wait"
          value={avgWaitMinutes != null ? `${avgWaitMinutes}` : "—"}
          suffix={avgWaitMinutes != null ? "min" : undefined}
        />
        <QueueStat label="Therapists on duty" value={therapistsOnDuty} />
      </div>

      {drafts.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <span
              aria-hidden
              className="grid h-12 w-12 place-items-center rounded-xl bg-[#e3f4ea] text-[#15683b]"
            >
              <Check className="h-6 w-6" />
            </span>
            <h3 className="text-base font-semibold">Queue is clear</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              No one is currently waiting. Open the intake QR to start a new patient.
            </p>
            <Button asChild className="mt-2">
              <Link href="/dashboard/intake">
                <QrCode className="h-4 w-4" aria-hidden /> Open intake QR
              </Link>
            </Button>
          </div>
        </Card>
      ) : (
        <AssignDashboard
          drafts={drafts.map((c) => ({
            id: c.id,
            clientCode: c.clientCode,
            firstName: c.firstName,
            lastName: c.lastName,
            phone: c.phone,
            age: c.age,
            sex: c.sex,
            email: c.email,
            createdAt: c.createdAt.toISOString(),
            selectedCategories: parseSelected(c.intakeForms[0]?.selectedCategories ?? null),
            intakeFormId: c.intakeForms[0]?.id ?? null,
            consentSigned: c.intakeForms[0]?.consentSigned ?? false,
            status: c.status === "ACTIVE" ? "ACTIVE" : "DRAFT",
          }))}
          therapists={therapistsAndConsultants.map((s) => ({
            id: s.id,
            name: s.name,
            role: s.role,
            designation: s.designation,
            department: s.department?.name ?? null,
          }))}
          referralSources={referralSources.map((r) => ({ id: r.id, name: r.name }))}
        />
      )}
    </div>
  );
}

function QueueStat({
  label,
  value,
  suffix,
  live,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  live?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      {live ? <span className="dot live" aria-hidden /> : null}
      <div>
        <div className="text-[26px] font-semibold leading-none tracking-tight tabular-nums">
          {value}
          {suffix ? (
            <span className="ml-0.5 text-base font-normal text-[color:var(--text-tertiary)]">
              {suffix}
            </span>
          ) : null}
        </div>
        <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-tertiary)]">
          {label}
        </div>
      </div>
    </div>
  );
}

function parseSelected(json: string | null): ServiceCategoryKey[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) {
      return arr.filter((k): k is ServiceCategoryKey =>
        (CATEGORY_KEYS as readonly string[]).includes(k as string),
      );
    }
  } catch {
    /* ignore */
  }
  return [];
}
