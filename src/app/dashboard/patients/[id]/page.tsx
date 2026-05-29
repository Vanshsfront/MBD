// Patient detail — Overview pane (Journey D5 detail surface).
// Layout follows the 2026-05-29 Claude Design handoff
// (mbd/project/mbd/patients.jsx — PatientOverview):
//   - 2-col grid: 2fr (profile completeness, upcoming appts, details)
//                 / 1fr (assigned, lifetime stats, prior records)
// The sticky patient header (avatar, name, status, MRN chip, flags) lives
// at `src/app/dashboard/patients/[id]/layout.tsx` (Batch 1) and persists
// across this and the other patient sub-tabs.
//
// Trimmed from the prior implementation:
//   - "Packages" and "Invoices" sub-sections (they each have their own
//     sub-tab now under /dashboard/patients/[id]/{packages,invoices})
//   - "Recent appointments" duplicated calendar data
//   - "Recent consultations" duplicated the Clinical sub-tab

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatINR } from "@/lib/utils";
import { SharePortalButton } from "./share-portal-button";
import { EditDemographicsDialog } from "./edit-demographics-dialog";

export default async function PatientOverview({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "patients:view_assigned")) redirect("/dashboard");

  const now = new Date();

  // Single round-trip for everything the Overview pane reads. The sticky
  // header in the parent layout has its own minimal query — duplication is
  // fine since both share the Prisma connection pool and Next.js dedupes
  // identical queries within a render pass anyway.
  const [client, paidAggregate, sessionsCount, firstAppt, upcomingAppts, priorConsultations] =
    await Promise.all([
      prisma.client.findUnique({
        where: { id },
        include: {
          doctorAssignments: {
            where: { endedAt: null },
            orderBy: { isPrimary: "desc" },
            include: { staff: { select: { name: true, designation: true } } },
          },
          referralSource: { select: { name: true } },
          intakeForms: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, consentSigned: true, consentMethod: true },
          },
        },
      }),
      prisma.invoice.aggregate({
        where: { clientId: id },
        _sum: { paidAmount: true },
      }),
      prisma.session.count({
        where: { clientId: id, status: "COMPLETED" },
      }),
      prisma.appointment.findFirst({
        where: { clientId: id },
        orderBy: { startTime: "asc" },
        select: { startTime: true },
      }),
      prisma.appointment.findMany({
        where: {
          clientId: id,
          startTime: { gte: now },
          status: { in: ["CONFIRMED", "RESCHEDULED"] },
        },
        orderBy: { startTime: "asc" },
        take: 3,
        select: {
          id: true,
          startTime: true,
          status: true,
          therapist: { select: { name: true } },
          service: { select: { name: true } },
        },
      }),
      prisma.consultation.findMany({
        where: { clientId: id, status: { in: ["COMPLETED", "LOCKED"] } },
        orderBy: { date: "desc" },
        take: 4,
        select: {
          id: true,
          templateKey: true,
          date: true,
          consultant: { select: { name: true } },
        },
      }),
    ]);
  if (!client) notFound();

  const address = parseJson<{ line1?: string; city?: string; pincode?: string }>(client.address);
  const emergency = parseJson<{ name?: string; phone?: string; relationship?: string }>(
    client.emergencyContact,
  );

  const canEditDemographics = hasPermission(session.user.role, "patients:edit_demographics");
  const canSharePortal = canEditDemographics;

  const intake = client.intakeForms[0] ?? null;
  const hasIntake = Boolean(intake);
  const hasConsent = Boolean(intake?.consentSigned) && Boolean(client.consentFormPhotoUrl);
  const hasAssignment = client.doctorAssignments.length > 0;
  const hasEmergency = Boolean(emergency?.name);
  const profileSteps: ReadonlyArray<{ label: string; done: boolean; hint?: string }> = [
    {
      label: "Intake on file",
      done: hasIntake,
      hint: hasIntake ? undefined : "Capture from assign queue",
    },
    {
      label: "Therapist assigned",
      done: hasAssignment,
      hint: hasAssignment ? undefined : "Assign from queue",
    },
    {
      label: "Consent signed",
      done: hasConsent,
      hint: hasConsent ? undefined : "Capture from assign queue",
    },
    {
      label: "Emergency contact",
      done: hasEmergency,
      hint: hasEmergency ? undefined : "Edit demographics",
    },
  ];
  const completeness = profileSteps.filter((s) => s.done).length;

  const lifetimeBilled = paidAggregate._sum.paidAmount ?? 0;
  const primaryAssignment = client.doctorAssignments[0] ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <div className="p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Profile completeness</h2>
              <span
                className={`chip ${completeness === profileSteps.length ? "chip-success" : "chip-warning"}`}
              >
                {completeness} of {profileSteps.length} complete
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {profileSteps.map((s) => (
                <div
                  key={s.label}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs ${
                    s.done
                      ? "bg-[#e3f4ea] text-[#15683b]"
                      : "bg-secondary text-[color:var(--text-tertiary)]"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`grid h-4 w-4 place-items-center rounded-full text-[10px] ${
                      s.done ? "bg-[#15683b] text-white" : "bg-[color:var(--border)] text-white"
                    }`}
                  >
                    {s.done ? "✓" : "—"}
                  </span>
                  <span className="min-w-0 truncate font-medium">
                    {s.label}
                    {s.hint ? (
                      <span className="ml-1 hidden font-normal text-[color:var(--text-tertiary)] xl:inline">
                        — {s.hint}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-[color:var(--border-light)] px-5 py-4">
            <h2 className="text-base font-semibold">Upcoming appointments</h2>
            <Link
              href="/dashboard/calendar"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Open calendar <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
          {upcomingAppts.length === 0 ? (
            <EmptyState
              title="No upcoming appointments"
              description="Book one from the calendar."
              className="m-4 border-none p-6"
            />
          ) : (
            <ul className="divide-y divide-[color:var(--border-light)]">
              {upcomingAppts.map((a) => (
                <li key={a.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="w-24 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-tertiary)]">
                    {formatApptDay(a.startTime)}
                  </span>
                  <span className="w-16 text-sm font-semibold tabular-nums">
                    {formatApptTime(a.startTime)}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    {a.service?.name ?? "Service TBD"}
                    <span className="text-muted-foreground"> · {a.therapist.name}</span>
                  </span>
                  <Badge variant={a.status === "CONFIRMED" ? "success" : "warning"}>
                    {a.status.toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Patient details</h2>
              {canEditDemographics ? (
                <EditDemographicsDialog
                  client={{
                    id: client.id,
                    firstName: client.firstName,
                    lastName: client.lastName,
                    phone: client.phone,
                    email: client.email ?? null,
                    dob: client.dob ? client.dob.toISOString() : null,
                    age: client.age ?? null,
                    sex: client.sex ?? null,
                    occupation: client.occupation ?? null,
                    sport: client.sport ?? null,
                    maritalStatus: client.maritalStatus ?? null,
                    address: address ?? null,
                    emergencyContact: emergency ?? null,
                  }}
                />
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <KV k="Date of birth" v={client.dob ? `${formatDate(client.dob)}${client.age != null ? ` · ${client.age}y` : ""}` : null} />
              <KV k="Sex" v={client.sex} />
              <KV k="Phone" v={client.phone} />
              <KV k="Email" v={client.email} />
              <KV
                k="Address"
                v={[address?.line1, address?.city, address?.pincode].filter(Boolean).join(", ")}
                wide
              />
              <KV
                k="Emergency contact"
                v={
                  emergency?.name
                    ? `${emergency.name}${emergency.relationship ? ` (${emergency.relationship})` : ""}${emergency.phone ? ` · ${emergency.phone}` : ""}`
                    : null
                }
                wide
              />
              <KV k="Occupation" v={client.occupation} />
              <KV k="Sport" v={client.sport} />
              <KV k="Referred by" v={client.referralSource?.name ?? client.referredByName} />
              <KV k="Registered" v={formatDate(client.createdAt)} />
            </div>
            {canSharePortal ? (
              <div className="mt-4 border-t border-[color:var(--border-light)] pt-4">
                <SharePortalButton clientId={client.id} />
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <div className="p-6">
            <h2 className="mb-3 text-base font-semibold">Currently assigned</h2>
            {client.doctorAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active assignments.</p>
            ) : (
              <ul className="space-y-3">
                {client.doctorAssignments.map((a) => (
                  <li key={a.id} className="flex items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-semibold">
                      {staffInitials(a.staff?.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{a.staff?.name}</p>
                      {a.staff?.designation ? (
                        <p className="truncate text-[11px] text-[color:var(--text-tertiary)]">
                          {a.staff.designation}
                        </p>
                      ) : null}
                    </div>
                    {a.isPrimary ? <span className="chip chip-primary">Primary</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <h2 className="mb-3 text-base font-semibold">Lifetime</h2>
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Total billed</span>
                <span className="font-semibold tabular-nums">{formatINR(lifetimeBilled)}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Sessions delivered</span>
                <span className="font-semibold tabular-nums">{sessionsCount}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">First visit</span>
                <span className="font-semibold">
                  {firstAppt ? formatDate(firstAppt.startTime) : "—"}
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Primary therapist</span>
                <span className="truncate font-semibold">
                  {primaryAssignment?.staff?.name ?? "—"}
                </span>
              </li>
            </ul>
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-[color:var(--border-light)] px-5 py-4">
            <h2 className="text-base font-semibold">Prior records</h2>
            <Link
              href={`/dashboard/patients/${client.id}/clinical`}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              All
            </Link>
          </div>
          {priorConsultations.length === 0 ? (
            <EmptyState title="No locked records yet" className="m-4 border-none p-6" />
          ) : (
            <ul className="divide-y divide-[color:var(--border-light)]">
              {priorConsultations.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/dashboard/patients/${client.id}/clinical`}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-secondary"
                  >
                    <FileText
                      className="h-3.5 w-3.5 shrink-0 text-[color:var(--text-tertiary)]"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {humanTemplate(c.templateKey)}
                      </p>
                      <p className="truncate text-[11px] text-[color:var(--text-tertiary)]">
                        {formatDate(c.date)}
                        {c.consultant ? ` · ${c.consultant.name}` : ""}
                      </p>
                    </div>
                    <ArrowRight
                      className="h-3 w-3 shrink-0 text-[color:var(--text-tertiary)]"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function KV({
  k,
  v,
  wide,
}: {
  k: string;
  v: string | number | null | undefined;
  wide?: boolean;
}) {
  const display = v != null && v !== "" ? String(v) : null;
  return (
    <div
      className={`grid grid-cols-[110px_minmax(0,1fr)] items-baseline gap-x-3 border-t border-[color:var(--border-light)] py-2.5 first:border-t-0 first:pt-0.5 ${
        wide ? "sm:col-span-2" : ""
      }`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-tertiary)]">
        {k}
      </span>
      <span
        className={`break-words ${display ? "text-sm leading-snug" : "text-sm text-muted-foreground"}`}
      >
        {display ?? "—"}
      </span>
    </div>
  );
}

function staffInitials(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name
    .replace(/\([^)]*\)/g, "")
    .trim()
    .split(/\s+/)
    .filter((t) => !/^(dr|mr|mrs|ms|prof|miss)\.?$/i.test(t));
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "??";
}

function humanTemplate(key: string): string {
  switch (key) {
    case "physician":
      return "Physician consultation";
    case "physiotherapy":
      return "Physiotherapy consultation";
    case "yoga":
      return "Yoga intake";
    case "counselling":
      return "Counselling intake";
    case "nutrition":
      return "Nutrition consultation";
    case "fab":
      return "Functional assessment";
    default:
      return key;
  }
}

function parseJson<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatApptDay(d: Date): string {
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
}

function formatApptTime(d: Date): string {
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}
