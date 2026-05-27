import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog, computeChanges } from "@/lib/audit";
import { canEditClinicalRecord } from "@/lib/clinical-access";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const consultation = await prisma.consultation.findUnique({
      where: { id },
      include: {
        client: true,
        consultant: true,
        service: true,
        packages: { include: { sessions: true } },
      },
    });

    if (!consultation) {
      return NextResponse.json({ error: "Consultation not found" }, { status: 404 });
    }

    return NextResponse.json(consultation);
  } catch (error) {
    console.error("[GET /api/consultations/:id]", error);
    return NextResponse.json({ error: "Failed to fetch consultation" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    // Fetch existing for audit diff
    const existing = await prisma.consultation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Consultation not found" }, { status: 404 });
    }

    // Enforce lock — locked records cannot be edited
    if (existing.isLocked) {
      return NextResponse.json({ error: "This clinical record is locked and cannot be edited" }, { status: 403 });
    }

    // Role-based access & backdate lock
    const authSession = await auth();
    const userRole = (authSession?.user as { role?: string })?.role || "";
    const userId = (authSession?.user as { id?: string })?.id || body.performedById || "";
    const gate = await canEditClinicalRecord({
      userId,
      userRole,
      clientId: existing.clientId,
      recordStatus: existing.isLocked ? "COMPLETED" : "ACTIVE",
      recordUpdatedAt: existing.date,
    });
    if (!gate.allowed) {
      return NextResponse.json({ error: gate.reason }, { status: 403 });
    }

    // Handle lock request
    if (body.lock === true) {
      const locked = await prisma.consultation.update({
        where: { id },
        data: { isLocked: true, lockedAt: new Date() },
        include: { client: true, consultant: true, service: true, packages: true },
      });
      await createAuditLog({
        action: "UPDATE",
        entity: "Consultation",
        entityId: id,
        performedById: body.performedById,
        changes: { isLocked: { old: false, new: true } },
        metadata: { clientId: existing.clientId },
      });
      return NextResponse.json(locked);
    }

    const consultation = await prisma.consultation.update({
      where: { id },
      data: {
        vitals: body.vitals ? JSON.stringify(body.vitals) : undefined,
        comorbidities: body.comorbidities ? JSON.stringify(body.comorbidities) : undefined,
        chiefComplaints: body.chiefComplaints,
        diagnosis: body.diagnosis,
        planOfCare: body.planOfCare,
        treatmentProtocol: body.treatmentProtocol,
        recommendedSessions: body.recommendedSessions,
        assessmentNotes: body.assessmentNotes ? JSON.stringify(body.assessmentNotes) : undefined,
        followUp: body.followUp,
      },
      include: { client: true, consultant: true, service: true, packages: true },
    });

    // Audit trail — auto-diff all fields
    const changes = computeChanges(existing as Record<string, unknown>, body);
    await createAuditLog({
      action: "UPDATE",
      entity: "Consultation",
      entityId: id,
      performedById: body.performedById,
      changes,
      metadata: { clientId: existing.clientId },
    });

    return NextResponse.json(consultation);
  } catch (error) {
    console.error("[PUT /api/consultations/:id]", error);
    return NextResponse.json({ error: "Failed to update consultation" }, { status: 500 });
  }
}
