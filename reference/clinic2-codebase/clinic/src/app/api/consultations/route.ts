import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consultationSchema } from "@/lib/validators";
import { createAuditLog } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");
    const consultantId = searchParams.get("consultantId");
    const type = searchParams.get("type"); // physician | physiotherapy | counselling | yoga | fab

    const where: Record<string, unknown> = {};
    if (clientId) where.clientId = clientId;
    if (consultantId) where.consultantId = consultantId;

    const rows = await prisma.consultation.findMany({
      where,
      include: {
        client: {
          select: {
            id: true, firstName: true, lastName: true, clientCode: true,
            phone: true, email: true, dob: true, age: true, sex: true,
            dominance: true, address: true,
          },
        },
        consultant: true,
        service: true,
        packages: true,
      },
      orderBy: { date: "desc" },
    });

    // Filter by template (assessmentNotes.consultationType). Stored as JSON string so filter in Node.
    const consultations = type
      ? rows.filter(r => {
          if (!r.assessmentNotes) return type === "physician"; // legacy rows with no notes default to physician
          try {
            const parsed = JSON.parse(r.assessmentNotes) as { consultationType?: string };
            const t = parsed.consultationType || "physician";
            return t === type;
          } catch { return false; }
        })
      : rows;

    return NextResponse.json(consultations);
  } catch (error) {
    console.error("[GET /api/consultations]", error);
    return NextResponse.json({ error: "Failed to fetch consultations" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = consultationSchema.parse(body);

    const consultation = await prisma.consultation.create({
      data: {
        clientId: data.clientId,
        consultantId: data.consultantId,
        serviceId: data.serviceId,
        vitals: data.vitals ? JSON.stringify(data.vitals) : null,
        comorbidities: data.comorbidities ? JSON.stringify(data.comorbidities) : null,
        chiefComplaints: data.chiefComplaints || null,
        diagnosis: data.diagnosis || null,
        planOfCare: data.planOfCare || null,
        treatmentProtocol: data.treatmentProtocol || null,
        recommendedSessions: data.recommendedSessions || null,
        assessmentNotes: data.assessmentNotes ? JSON.stringify(data.assessmentNotes) : null,
        followUp: data.followUp || null,
      },
      include: { client: true, consultant: true, service: true, packages: true },
    });

    // Auto-create package if recommendedSessions is provided
    if (body.createPackage && data.recommendedSessions) {
      const service = await prisma.service.findUnique({ where: { id: data.serviceId } });
      if (service) {
        const totalPrice = service.basePrice * data.recommendedSessions;
        await prisma.package.create({
          data: {
            clientId: data.clientId,
            consultationId: consultation.id,
            totalSessions: data.recommendedSessions,
            serviceMix: JSON.stringify([{ serviceId: data.serviceId, serviceName: service.name, count: data.recommendedSessions }]),
            validFrom: new Date(),
            validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
            totalPrice,
            discountPercent: body.discountPercent || 0,
          },
        });
      }
    }

    // Save medical history record from consultation data
    if (data.vitals || data.comorbidities || body.assessmentNotes) {
      const assessmentNotes = body.assessmentNotes || {};
      const personalHistory = assessmentNotes.personalHistory || {};
      await prisma.medicalHistory.create({
        data: {
          clientId: data.clientId,
          serviceId: data.serviceId,
          vitals: data.vitals ? JSON.stringify(data.vitals) : null,
          comorbidities: data.comorbidities ? JSON.stringify(data.comorbidities) : null,
          chiefComplaints: data.chiefComplaints || null,
          pastMedicalHistory: assessmentNotes.pastMedicalHistory || null,
          pastSurgicalHistory: assessmentNotes.pastSurgicalHistory || null,
          currentMedications: assessmentNotes.currentMedications || null,
          personalHistory: Object.values(personalHistory).some(Boolean) ? JSON.stringify(personalHistory) : null,
          diagnosis: data.diagnosis || null,
          planOfCare: data.planOfCare || null,
          followUp: data.followUp || null,
        },
      }).catch(() => { /* silent - non-critical */ });
    }

    // Audit log with rich metadata
    await createAuditLog({
      action: "CREATE",
      entity: "Consultation",
      entityId: consultation.id,
      performedById: body.performedById || data.consultantId,
      metadata: {
        clientId: data.clientId,
        clientName: `${consultation.client.firstName} ${consultation.client.lastName}`,
        clientCode: consultation.client.clientCode,
        consultantId: data.consultantId,
        consultantName: consultation.consultant.name,
        serviceName: consultation.service.name,
        diagnosis: data.diagnosis,
      },
    });

    return NextResponse.json(consultation, { status: 201 });
  } catch (error) {
    console.error("[POST /api/consultations]", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Validation failed", details: error }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create consultation" }, { status: 500 });
  }
}
