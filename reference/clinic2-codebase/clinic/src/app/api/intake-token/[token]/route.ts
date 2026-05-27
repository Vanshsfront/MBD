import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { generateClientCode } from "@/lib/id-generator";

// GET — validate token and return services for the form
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const intakeToken = await prisma.intakeToken.findUnique({
      where: { token },
    });

    if (!intakeToken) {
      return NextResponse.json({ error: "Invalid intake link" }, { status: 404 });
    }

    if (intakeToken.isUsed || intakeToken.status === "COMPLETED") {
      return NextResponse.json({ error: "This intake form has already been submitted" }, { status: 410 });
    }

    if (new Date() > intakeToken.expiresAt) {
      // Update status to expired
      await prisma.intakeToken.update({
        where: { id: intakeToken.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json({ error: "This intake link has expired" }, { status: 410 });
    }

    // Return services for the form
    const services = await prisma.service.findMany({
      where: { isActive: true },
      include: { department: { select: { name: true } } },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      valid: true,
      expiresAt: intakeToken.expiresAt,
      services,
    });
  } catch (error) {
    console.error("[GET /api/intake-token/[token]]", error);
    return NextResponse.json({ error: "Failed to validate token" }, { status: 500 });
  }
}

// PUT — submit the patient intake form
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await req.json();

    const intakeToken = await prisma.intakeToken.findUnique({
      where: { token },
    });

    if (!intakeToken) {
      return NextResponse.json({ error: "Invalid intake link" }, { status: 404 });
    }

    if (intakeToken.isUsed || intakeToken.status === "COMPLETED") {
      return NextResponse.json({ error: "This form has already been submitted" }, { status: 410 });
    }

    if (new Date() > intakeToken.expiresAt) {
      return NextResponse.json({ error: "This intake link has expired" }, { status: 410 });
    }

    const { client } = body;
    const selectedServices: string[] = Array.isArray(client?.selectedServices)
      ? client.selectedServices
      : (client?.selectedService ? [client.selectedService] : []);

    if (!client?.firstName || !client?.lastName || !client?.phone) {
      return NextResponse.json({ error: "First name, last name, and phone are required" }, { status: 400 });
    }

    if (client.phone && !/^\d{10}$/.test(client.phone)) {
      return NextResponse.json({ error: "Phone must be exactly 10 digits" }, { status: 400 });
    }

    if (!client.address?.line1 || !client.address?.city || !/^\d{6}$/.test(client.address?.pincode || "")) {
      return NextResponse.json({ error: "Address line 1, city, and 6-digit pincode are required" }, { status: 400 });
    }

    if (!client.emergencyContact?.name || !/^\d{10}$/.test(client.emergencyContact?.phone || "")) {
      return NextResponse.json({ error: "Emergency contact name and 10-digit phone are required" }, { status: 400 });
    }

    if (client.age !== undefined && client.age !== null && client.age !== "") {
      const ageNum = parseInt(String(client.age));
      if (isNaN(ageNum) || ageNum < 0 || ageNum > 100) {
        return NextResponse.json({ error: "Age must be between 0 and 100" }, { status: 400 });
      }
    }

    if (!client.visitReasons || !Array.isArray(client.visitReasons) || client.visitReasons.length === 0) {
      return NextResponse.json({ error: "Please select at least one reason for your visit" }, { status: 400 });
    }

    // Resolve the centre for this intake token (if the token was created for a specific clinic).
    // Fall back to the creating staff's centre, then to the default MBD clinic.
    let centreId: string | null = null;
    if (intakeToken.createdById) {
      const staff = await prisma.staff.findUnique({
        where: { id: intakeToken.createdById },
        select: { centreId: true },
      });
      centreId = staff?.centreId || null;
    }
    if (!centreId) {
      const defaultCentre = await prisma.centre.findFirst({
        where: { slug: "MBD" },
        select: { id: true },
      });
      centreId = defaultCentre?.id || null;
    }

    // Generate client code
    const clientCode = await generateClientCode(centreId);

    // Create the client as DRAFT
    const newClient = await prisma.client.create({
      data: {
        clientCode,
        centreId: centreId,
        firstName: client.firstName,
        lastName: client.lastName,
        phone: client.phone,
        email: client.email || null,
        dob: client.dob ? new Date(client.dob) : null,
        age: client.age ? parseInt(String(client.age)) : null,
        sex: client.sex || null,
        address: client.address ? JSON.stringify(client.address) : null,
        emergencyContact: client.emergencyContact ? JSON.stringify(client.emergencyContact) : null,
        status: "DRAFT",
        visitReasons: JSON.stringify(client.visitReasons),
      },
    });

    // Create intake form record with selected service
    const now = new Date();
    await prisma.intakeForm.create({
      data: {
        clientId: newClient.id,
        selectedServices: JSON.stringify(selectedServices),
        formData: JSON.stringify({
          ...client,
          addressLine1: client.address?.line1 || "",
          addressLine2: client.address?.line2 || "",
          city: client.address?.city || "",
          pincode: client.address?.pincode || "",
          emergencyName: client.emergencyContact?.name || "",
          emergencyPhone: client.emergencyContact?.phone || "",
        }),
        consentSigned: client.consentSigned || false,
        liabilityWaiverSigned: client.consentSigned || false,
        commercialTermsAccepted: client.consentSigned || false,
        cancellationPolicyAcknowledged: client.consentSigned || false,
        visitDateTime: now,
      },
    });

    // Mark token as used
    await prisma.intakeToken.update({
      where: { id: intakeToken.id },
      data: {
        isUsed: true,
        status: "COMPLETED",
        clientId: newClient.id,
        formData: JSON.stringify(body),
      },
    });

    // Auto-assign to FO staff — if exactly one FRONT_OFFICE is active, assign them
    const foStaff = await prisma.staff.findMany({
      where: { role: "FRONT_OFFICE", isActive: true },
      select: { id: true, name: true },
    });

    if (foStaff.length === 1) {
      await prisma.intakeForm.updateMany({
        where: { clientId: newClient.id },
        data: { frontOfficeExec: foStaff[0].id },
      });
    }

    // Fire notification to all active FO staff
    if (foStaff.length > 0) {
      await prisma.notification.createMany({
        data: foStaff.map((s) => ({
          type: "INTAKE_SUBMITTED",
          title: "New Patient Intake",
          message: `${client.firstName} ${client.lastName} has submitted an intake form`,
          targetUserId: s.id,
          priority: "HIGH",
          metadata: JSON.stringify({ clientCode, clientId: newClient.id }),
        })),
      });
    }

    // Audit log
    await createAuditLog({
      action: "CREATE",
      entity: "Client",
      entityId: newClient.id,
      performedById: intakeToken.createdById || undefined,
      metadata: {
        clientCode,
        firstName: client.firstName,
        lastName: client.lastName,
        source: "patient-intake",
        intakeTokenId: intakeToken.id,
      },
    });

    return NextResponse.json({
      success: true,
      clientCode,
      clientName: `${client.firstName} ${client.lastName}`,
    });
  } catch (error) {
    console.error("[PUT /api/intake-token/[token]]", error);
    const message = error instanceof Error ? error.message : "Failed to submit intake form";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
