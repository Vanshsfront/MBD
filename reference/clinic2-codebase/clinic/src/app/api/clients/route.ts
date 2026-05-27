import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { clientSchema, intakeFormSchema } from "@/lib/validators";
import { generateClientCode } from "@/lib/id-generator";
import { createAuditLog } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const unassigned = searchParams.get("unassigned") === "true";
    const therapistName = searchParams.get("therapistName");
    const flagType = searchParams.get("flagType");
    const therapistId = searchParams.get("therapistId");
    const hasActivePackage = searchParams.get("hasActivePackage");
    const assignedDoctorId = searchParams.get("assignedDoctorId");
    const assignedToMe = searchParams.get("assignedToMe") === "true";

    const where: Record<string, unknown> = {};

    // Restrict THERAPIST/CONSULTANT to their assigned patients only (confidentiality).
    // Admin setting 'allowCrossTherapistRead' can relax this later — not exposed yet.
    const authSession = await auth();
    const sessionRole = (authSession?.user as { role?: string })?.role;
    const sessionUserId = (authSession?.user as { id?: string })?.id;
    if (
      sessionUserId &&
      (sessionRole === "THERAPIST" || sessionRole === "CONSULTANT" || assignedToMe)
    ) {
      where.doctorAssignments = {
        some: { staffId: sessionUserId, endedAt: null },
      };
    }

    if (q) {
      where.OR = [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { clientCode: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ];
    }

    if (unassigned) {
      // Queue rule: a client is shown on the assign tab as long as they have an
      // intake form AND have not yet had a signed intake PDF uploaded. This
      // covers two stages — (a) therapists not yet picked, and (b) therapists
      // picked but signed PDF not yet captured.
      where.intakeForms = { some: {} };
      where.consentFormPhotoUrl = null;
    }

    // Search by preferred therapist name
    if (therapistName) {
      where.preferredTherapist = {
        name: { contains: therapistName, mode: "insensitive" },
      };
    }

    // Filter by preferred therapist ID
    if (therapistId) {
      where.preferredTherapistId = therapistId;
    }

    // Filter by flag type
    if (flagType) {
      where.flags = {
        some: { type: flagType, isActive: true },
      };
    }

    // Filter by assigned doctor (via ClientDoctorAssignment)
    if (assignedDoctorId) {
      where.doctorAssignments = {
        some: { staffId: assignedDoctorId },
      };
    }

    // Filter by active package
    if (hasActivePackage === "true") {
      where.packages = {
        some: { status: "ACTIVE" },
      };
    } else if (hasActivePackage === "false") {
      where.packages = {
        none: { status: "ACTIVE" },
      };
    }

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        include: {
          centre: true,
          intakeForms: { orderBy: { createdAt: "desc" }, take: 1 },
          flags: { where: { isActive: true } },
          preferredTherapist: { select: { id: true, name: true } },
          _count: { select: { packages: true, sessions: true, invoices: true, consultations: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.client.count({ where }),
    ]);

    return NextResponse.json({ clients, total, page, limit });
  } catch (error) {
    console.error("[GET /api/clients]", error);
    return NextResponse.json({ error: "Failed to fetch clients" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const clientData = clientSchema.parse(body.client);

    // intakeFormSchema is optional for simplified intake (patient may not have selected services yet)
    const hasIntake = body.intake?.selectedServices?.length > 0;
    let intakeData = null;
    if (hasIntake) {
      intakeData = intakeFormSchema.parse(body.intake);
    }

    const clientCode = await generateClientCode(body.centreId || null);

    const client = await prisma.client.create({
      data: {
        clientCode,
        firstName: clientData.firstName,
        lastName: clientData.lastName,
        email: clientData.email || null,
        phone: clientData.phone,
        dob: clientData.dob ? new Date(clientData.dob) : null,
        age: clientData.age || null,
        sex: clientData.sex || null,
        dominance: clientData.dominance || null,
        address: clientData.address ? JSON.stringify(clientData.address) : null,
        emergencyContact: clientData.emergencyContact ? JSON.stringify(clientData.emergencyContact) : null,
        referredBy: clientData.referredBy || null,
        centreId: body.centreId || null,
        preferredTherapistId: body.client.preferredTherapistId || null,
        status: body.status || "DRAFT",
        visitReasons: clientData.visitReasons ? JSON.stringify(clientData.visitReasons) : null,
        intakeForms: {
          create: {
            selectedServices: intakeData ? JSON.stringify(intakeData.selectedServices) : "[]",
            consentSigned: intakeData?.consentSigned || false,
            liabilityWaiverSigned: intakeData?.liabilityWaiverSigned || false,
            commercialTermsAccepted: intakeData?.commercialTermsAccepted || false,
            cancellationPolicyAcknowledged: intakeData?.cancellationPolicyAcknowledged || false,
            frontOfficeExec: body.frontOfficeExec || null,
            visitDateTime: new Date(),
          },
        },
      },
      include: { intakeForms: true },
    });

    // Create medical history if provided
    if (body.medicalHistory) {
      await prisma.medicalHistory.create({
        data: {
          clientId: client.id,
          vitals: body.medicalHistory.vitals ? JSON.stringify(body.medicalHistory.vitals) : null,
          comorbidities: body.medicalHistory.comorbidities ? JSON.stringify(body.medicalHistory.comorbidities) : null,
          knownAllergies: body.medicalHistory.knownAllergies || null,
          chiefComplaints: body.medicalHistory.chiefComplaints || null,
          pastMedicalHistory: body.medicalHistory.pastMedicalHistory || null,
          pastSurgicalHistory: body.medicalHistory.pastSurgicalHistory || null,
          familyHistory: body.medicalHistory.familyHistory || null,
          personalHistory: body.medicalHistory.personalHistory ? JSON.stringify(body.medicalHistory.personalHistory) : null,
          diagnosis: body.medicalHistory.diagnosis || null,
          currentMedications: body.medicalHistory.currentMedications || null,
          planOfCare: body.medicalHistory.planOfCare || null,
          followUp: body.medicalHistory.followUp || null,
        },
      });
    }

    // Fire notification to all active FO staff
    const foStaff = await prisma.staff.findMany({
      where: { role: "FRONT_OFFICE", isActive: true },
      select: { id: true },
    });
    if (foStaff.length > 0) {
      await prisma.notification.createMany({
        data: foStaff.map((s) => ({
          type: "INTAKE_SUBMITTED",
          title: "New Patient Intake",
          message: `${clientData.firstName} ${clientData.lastName} has been registered`,
          targetUserId: s.id,
          priority: "HIGH",
          metadata: JSON.stringify({ clientCode, clientId: client.id }),
        })),
      });
    }

    // Audit log
    await createAuditLog({
      action: "CREATE",
      entity: "Client",
      entityId: client.id,
      performedById: body.performedById,
      metadata: { clientCode, firstName: clientData.firstName, lastName: clientData.lastName },
    });

    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    console.error("[POST /api/clients]", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Validation failed", details: error }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create client" }, { status: 500 });
  }
}
