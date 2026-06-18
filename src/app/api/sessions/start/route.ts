// Begin a live session — therapist clicks "Begin session" on the clinical
// record. Creates a Session row in IN_PROGRESS state with startedAt=now and
// optionally links to the nearest scheduled Appointment (so package consume
// + service lookup work atomically when the session ends).
//
// Returns 409 if the therapist already has an IN_PROGRESS session for this
// client — preventing double-clicks from spawning ghost rows.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requestMeta } from "@/lib/api-auth";
import { isClinicalRole } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";

// Comprehensive session-type taxonomy spanning every department + modality
// the clinic offers. Therapist picks one when they Begin a session; appears
// as a chip on the live timer + a sortable column on the sessions list.
// Keep this list in sync with FORM_TYPE_OPTIONS in session-timer-header.tsx.
const SESSION_FORM_TYPES = [
  // General clinical
  "intake",
  "followup",
  "reassessment",
  "consultation",
  "fab",
  // Physiotherapy / rehab modalities
  "physiotherapy",
  "rehab",
  "manual",
  "needling",
  "cupping",
  "iastm",
  "taping",
  "electrotherapy",
  // Massage
  "massage",
  // Yoga
  "yoga",
  "meditation",
  // Counselling
  "counselling",
  // Nutrition
  "nutrition",
  // S&C
  "strength_conditioning",
  "training",
  // Delivery mode (when none of the above fits)
  "home_visit",
  "online",
  "group",
  // Catch-all
  "other",
] as const;

const startSchema = z.object({
  clientId: z.string().min(1),
  sessionFormType: z.enum(SESSION_FORM_TYPES),
});

// Time window for matching a Session to a scheduled Appointment. A session
// started within 30min before or 2h after the slot's startTime is linked.
const APPT_LINK_BEFORE_MS = 30 * 60_000;
const APPT_LINK_AFTER_MS = 2 * 60 * 60_000;

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  // Only clinical roles begin sessions (OWNER/ADMIN can resume someone
  // else's, but starting a fresh one needs to be the actual provider).
  if (!isClinicalRole(auth.user.role) && auth.user.role !== "OWNER" && auth.user.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as unknown;
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;
  const therapistId = auth.user.id;

  // Block if already mid-session for this patient. Forces an End before a
  // new Begin — keeps the timing log clean.
  const existing = await prisma.session.findFirst({
    where: {
      clientId: f.clientId,
      therapistId,
      status: "IN_PROGRESS",
    },
    select: { id: true, startedAt: true, sessionFormType: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "session_in_progress", existing },
      { status: 409 },
    );
  }

  const now = new Date();
  // Match the closest scheduled appointment so the session inherits its
  // serviceId + packageId (for atomic package decrement on End).
  const nearbyAppt = await prisma.appointment.findFirst({
    where: {
      clientId: f.clientId,
      therapistId,
      status: { in: ["CONFIRMED", "RESCHEDULED"] },
      startTime: {
        gte: new Date(now.getTime() - APPT_LINK_AFTER_MS),
        lte: new Date(now.getTime() + APPT_LINK_BEFORE_MS),
      },
    },
    orderBy: { startTime: "asc" },
    select: { id: true, serviceId: true, packageId: true, centreId: true },
  });

  const session = await prisma.session.create({
    data: {
      clientId: f.clientId,
      therapistId,
      serviceId: nearbyAppt?.serviceId ?? null,
      packageId: nearbyAppt?.packageId ?? null,
      // Explicit Appointment link — used by the appointment PATCH/DELETE
      // handlers to find this session and refund the package if the
      // appointment is cancelled/deleted post-session.
      appointmentId: nearbyAppt?.id ?? null,
      centreId: nearbyAppt?.centreId ?? null,
      sessionDate: now,
      startedAt: now,
      status: "IN_PROGRESS",
      sessionFormType: f.sessionFormType,
    },
    select: { id: true, startedAt: true, sessionFormType: true, packageId: true },
  });

  // Surface the linked package on the timer banner so the therapist sees
  // up-front whether End-session will decrement a package or not. Derived
  // name = first service in mix (matches the patient-detail summary card).
  let linkedPackage:
    | { id: string; name: string; remaining: number; totalSessions: number }
    | null = null;
  if (session.packageId) {
    const pkg = await prisma.package.findUnique({
      where: { id: session.packageId },
      select: { id: true, totalSessions: true, completedSessions: true, serviceMix: true },
    });
    if (pkg) {
      let name = "Package";
      try {
        const arr = JSON.parse(pkg.serviceMix);
        if (Array.isArray(arr)) {
          const first = arr.find((m) => m && typeof m.serviceName === "string")?.serviceName;
          if (first) name = arr.length > 1 ? `${first} +${arr.length - 1}` : first;
        }
      } catch {
        /* fall back to "Package" */
      }
      linkedPackage = {
        id: pkg.id,
        name,
        remaining: Math.max(0, pkg.totalSessions - pkg.completedSessions),
        totalSessions: pkg.totalSessions,
      };
    }
  }

  const meta = requestMeta(req);
  await createAuditLog({
    action: "CREATE",
    entity: "Session",
    entityId: session.id,
    performedById: therapistId,
    metadata: {
      kind: "begin_session",
      clientId: f.clientId,
      sessionFormType: f.sessionFormType,
      linkedAppointmentId: nearbyAppt?.id ?? null,
      linkedPackageId: nearbyAppt?.packageId ?? null,
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ session, linkedPackage }, { status: 201 });
}
