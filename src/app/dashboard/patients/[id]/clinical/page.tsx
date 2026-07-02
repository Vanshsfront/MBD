// Clinical record — server entry. PRD §4 B4 + §3.2 + Revamp Phase 4.
//
// Routing decisions:
//   - Massage department → "no clinical record" notice (PRD §4 B4).
//   - Clinical role with NO active assignment but a prior endedAt
//     assignment → render as VIEW-ONLY (PRD §3.2 Q2 — old therapist drops to
//     view-only on records they created, NOT redirect-away).
//   - First visit (no prior Consultation in this template family) → first-
//     visit template (e.g. "physiotherapy"). Else → follow-up template
//     (e.g. "physiotherapy-followup").

import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission, isClinicalRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  resolveClinicalTemplate,
  relatedTemplateKeys,
  isFirstVisitTemplate,
} from "@/lib/clinical-schemas";
import { ClinicalShell } from "@/components/clinical/clinical-shell";
import { SessionTimerHeader } from "@/components/clinical/session-timer-header";
import { Card, CardContent } from "@/components/ui/card";
import { PastRecordsList } from "./past-records-list";

export const metadata = { title: "Clinical record — MBD Clinic OS" };

export default async function ClinicalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ consult?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  // ?consult=1 unlocks the consultation form on first arrival. Without it,
  // a clinical user without a saved DRAFT sees the past-records repository
  // and a "Start consultation" CTA — keeps the blank form hidden until the
  // therapist is actively consulting, so opening the patient just to
  // review history doesn't dump a blank intake on the screen.
  const consultMode = sp.consult === "1";
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "patients:view_assigned")) redirect("/dashboard");
  // Front office never sees clinical records — only consultation/treatment
  // notes are sensitive; FO retains everything else (intake, calendar,
  // packages, billing). Direct-URL access bounces back to patient overview.
  if (session.user.role === "FRONT_OFFICE") redirect(`/dashboard/patients/${id}`);

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      // Pull both active AND ended assignments so we can detect the
      // "reassigned-away" view-only state.
      doctorAssignments: {
        include: {
          staff: {
            select: {
              id: true,
              name: true,
              departmentId: true,
              department: { select: { name: true } },
            },
          },
        },
      },
      // Latest intake form (used to surface the consent for download in the
      // past records list).
      intakeForms: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, createdAt: true, consentSigned: true, consentMethod: true },
      },
      // Therapists in appt-driven departments (Yoga, Massage, S&C) often
      // touch a patient via Appointment rather than a formal ClientDoctorAssignment.
      // Match the layout's "any appointment counts as ownership" policy and
      // pull the therapist's department for template-fallback when no
      // assignment row exists.
      appointments: {
        where: isClinicalRole(session.user.role)
          ? { therapistId: session.user.id }
          : undefined,
        select: {
          id: true,
          therapist: { select: { department: { select: { name: true } } } },
        },
        orderBy: { startTime: "desc" },
        take: 1,
      },
    },
  });
  if (!client) notFound();

  // Past records repository — every completed consultation for this patient
  // across ALL template families, plus the consent document if signed.
  // Each entry is downloadable as a PDF via the render endpoints. Always
  // shown on the clinical page so therapists can browse the patient's
  // documented history without leaving the screen.
  const pastConsultations = await prisma.consultation.findMany({
    where: { clientId: id, status: { in: ["COMPLETED", "LOCKED"] } },
    orderBy: { date: "desc" },
    take: 30,
    select: {
      id: true,
      templateKey: true,
      date: true,
      status: true,
      consultantId: true,
      consultant: { select: { name: true } },
    },
  });
  const consentSigned =
    client.intakeForms.length > 0 && client.intakeForms[0]!.consentSigned;

  const isClinical = isClinicalRole(session.user.role);
  const ownActive = client.doctorAssignments.find(
    (a) => a.staffId === session.user.id && a.endedAt === null,
  );
  const ownEnded = client.doctorAssignments.find(
    (a) => a.staffId === session.user.id && a.endedAt !== null,
  );
  // Consultants typically aren't in doctorAssignments — they touch a patient
  // by performing a Consultation. Treat any past consultation by this user
  // as "they own this record" for access purposes.
  const ownedConsultation = pastConsultations.some(
    (c) => c.consultantId === session.user.id,
  );
  // Therapists in appt-driven departments (Yoga, Massage, S&C) often have
  // no assignment row — appointments are the relationship. Match the layout's
  // policy so clicking "Clinical record" doesn't silently bounce.
  const ownedAppointment = client.appointments[0] ?? null;

  // Clinical roles: no assignment AND no consultation AND no appointment → not theirs at all.
  if (isClinical && !ownActive && !ownEnded && !ownedConsultation && !ownedAppointment) {
    redirect("/dashboard/patients");
  }

  // Reassigned-away view-only flag (PRD §3.2 Q2). True only for clinical roles
  // who have an ended assignment but no current active one.
  const viewOnlyReassignedAway = isClinical && !ownActive && !!ownEnded;

  // Pick the department whose template we render.
  let department: string | null = null;
  if (isClinical) {
    const own = ownActive ?? ownEnded;
    department =
      own?.staff?.department?.name ??
      ownedAppointment?.therapist?.department?.name ??
      null;
  } else {
    // FO/Owner/Admin — first active, else first ended.
    const first =
      client.doctorAssignments.find((a) => a.endedAt === null) ??
      client.doctorAssignments[0];
    department = first?.staff?.department?.name ?? null;
  }

  // Count prior consultations across both first-visit + follow-up templates
  // for this department so we can route the patient correctly.
  const candidateKeys = (() => {
    // Cheap probe — call resolveClinicalTemplate twice (priorCount=0 and !=0)
    // and union the two template keys; gives the "family" of templates for
    // this department in one place.
    const a = resolveClinicalTemplate(department, 0);
    const b = resolveClinicalTemplate(department, 1);
    const out: string[] = [];
    if (a) out.push(a);
    if (b && b !== a) out.push(b);
    return out;
  })();

  let priorCount = 0;
  if (candidateKeys.length > 0) {
    priorCount = await prisma.consultation.count({
      where: {
        clientId: id,
        templateKey: { in: candidateKeys },
      },
    });
  }

  const templateKey = resolveClinicalTemplate(department, priorCount);

  if (department === "Massage" || templateKey === null) {
    return (
      <Card>
        <CardContent className="space-y-2 p-8 text-sm">
          <p className="font-medium">No clinical record for this modality.</p>
          <p className="text-muted-foreground">
            {department === "Massage"
              ? "Massage sessions are tracked via session logs and invoices, not clinical records (PRD §4 B4)."
              : "This patient has no assignment with a department whose template is wired yet."}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Pull all consultations across the template family so the form can show
  // prior follow-up rows for context, and find the user's own draft (if any).
  const consultations = await prisma.consultation.findMany({
    where: {
      clientId: id,
      templateKey: { in: relatedTemplateKeys(templateKey) },
    },
    orderBy: { date: "desc" },
    take: 20,
    select: {
      id: true,
      date: true,
      status: true,
      consultantId: true,
      consultant: { select: { id: true, name: true } },
      templateKey: true,
      chiefComplaints: true,
      diagnosis: true,
      recommendedSessions: true,
      formData: true,
      recommendedServicesJson: true,
      advisoryRecommendations: true,
    },
  });

  // Department services for the recommendation picker.
  const services = await prisma.service.findMany({
    where: {
      isActive: true,
      ...(client.centreId ? { centreId: client.centreId } : {}),
      department: { name: department ?? "" },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, basePrice: true, gstRate: true, participantCount: true },
  });

  // Gate the blank consultation form behind "Start consultation" for
  // clinical roles unless they already have a DRAFT in this template family
  // (in which case auto-resume) or the page was opened with ?consult=1.
  // Non-clinical roles (OWNER/ADMIN/FO/DEV) always see the form so they
  // can review or, for OWNER, edit COMPLETED records.
  const ownDraft = consultations.find(
    (c) => c.consultantId === session.user.id && c.status === "DRAFT",
  );
  const showForm =
    !isClinical || // non-clinical roles always see it
    viewOnlyReassignedAway || // reassigned-away therapist reads their old record
    !!ownDraft || // resume an active draft
    consultMode; // explicit "Start consultation"

  // Live-timer state — only clinical roles get the Begin/End buttons.
  // Pull the most-recent IN_PROGRESS session for this client+therapist so
  // refreshing the page (or coming back after a tab switch) restores the
  // running timer without losing elapsed time.
  const activeSession = isClinical
    ? await prisma.session.findFirst({
        where: {
          clientId: id,
          therapistId: session.user.id,
          status: "IN_PROGRESS",
        },
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          startedAt: true,
          sessionFormType: true,
          packageId: true,
          package: {
            select: {
              id: true,
              totalSessions: true,
              completedSessions: true,
              serviceMix: true,
            },
          },
        },
      })
    : null;
  // Derive a display name from the package's serviceMix (first service +N).
  // Stays in sync with the start-route's response shape.
  const linkedPackage = (() => {
    if (!activeSession?.package) return null;
    const p = activeSession.package;
    let name = "Package";
    try {
      const arr = JSON.parse(p.serviceMix);
      if (Array.isArray(arr)) {
        const first = arr.find((m) => m && typeof m.serviceName === "string")?.serviceName;
        if (first) name = arr.length > 1 ? `${first} +${arr.length - 1}` : first;
      }
    } catch {
      /* keep generic */
    }
    return {
      id: p.id,
      name,
      remaining: Math.max(0, p.totalSessions - p.completedSessions),
      totalSessions: p.totalSessions,
    };
  })();

  return (
    <div className="space-y-4">
      {/* Live session timer + Begin/End controls. Renders for clinical
        * roles only; non-clinical viewers (FO/ADMIN reviewing a record)
        * see nothing here. */}
      <SessionTimerHeader
        clientId={id}
        consultationId={ownDraft?.id ?? null}
        initialActive={
          activeSession && activeSession.startedAt
            ? {
                id: activeSession.id,
                startedAt: activeSession.startedAt.toISOString(),
                sessionFormType: activeSession.sessionFormType,
              }
            : null
        }
        initialLinkedPackage={linkedPackage}
        canStart={isClinical && !viewOnlyReassignedAway}
      />

      <PastRecordsList
        clientId={id}
        consentSigned={consentSigned}
        consultations={pastConsultations.map((c) => ({
          id: c.id,
          templateKey: c.templateKey,
          date: c.date,
          status: c.status,
          consultant: c.consultant ? { name: c.consultant.name } : null,
          // Upload rights: author consultant, OWNER, ADMIN, DEV. Mirrors the
          // server-side gate in /api/consultations/[id]/attachments POST so
          // the UI never offers a button that the API would 403.
          canUpload:
            session.user.role === "OWNER" ||
            session.user.role === "ADMIN" ||
            session.user.role === "DEV" ||
            c.consultantId === session.user.id,
        }))}
      />

      {showForm ? (
        <ClinicalShell
          clientId={id}
          patientName={`${client.firstName} ${client.lastName}`}
          templateKey={templateKey}
          isFirstVisit={isFirstVisitTemplate(templateKey)}
          department={department}
          currentUserId={session.user.id}
          canEditCompleted={hasPermission(
            session.user.role,
            "patients:edit_completed_clinical_record",
          )}
          viewOnly={viewOnlyReassignedAway}
          consultations={consultations.map((c) => ({
            id: c.id,
            date: c.date.toISOString(),
            status: c.status,
            consultantId: c.consultantId,
            consultantName: c.consultant?.name ?? null,
            templateKey: c.templateKey,
            chiefComplaints: c.chiefComplaints,
            diagnosis: c.diagnosis,
            recommendedSessions: c.recommendedSessions,
            formData: c.formData,
            recommendedServicesJson: c.recommendedServicesJson,
            advisoryRecommendations: c.advisoryRecommendations,
          }))}
          services={services.map((s) => ({
            id: s.id,
            name: s.name,
            basePrice: s.basePrice,
            gstRate: s.gstRate,
            participantCount: s.participantCount,
          }))}
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-8">
            <p className="text-sm font-medium">No active consultation in progress.</p>
            <p className="text-sm text-muted-foreground">
              Past records sit above. When you&apos;re ready to record a new
              consultation or follow-up for{" "}
              <span className="font-medium">
                {client.firstName} {client.lastName}
              </span>
              , click below — the form for {department} loads and autosaves as
              you go.
            </p>
            <a
              href={`/dashboard/patients/${id}/clinical?consult=1`}
              className="rounded-md bg-[color:var(--text-primary)] px-4 py-2 text-sm font-medium text-white shadow-[0_4px_12px_-6px_rgba(26,26,30,0.4)] hover:bg-[#2a2a30]"
            >
              Start consultation
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
