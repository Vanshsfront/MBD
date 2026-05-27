import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog, computeChanges } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        centre: true,
        intakeForms: { orderBy: { createdAt: "desc" } },
        medicalHistories: { orderBy: { createdAt: "desc" }, include: { service: true } },
        consultations: { orderBy: { date: "desc" }, include: { consultant: true, service: true } },
        packages: { orderBy: { createdAt: "desc" }, include: { sessions: true } },
        sessions: { orderBy: { sessionDate: "desc" }, include: { therapist: true, service: true } },
        invoices: { orderBy: { createdAt: "desc" }, include: { payments: true } },
        flags: { where: { isActive: true } },
        preferredTherapist: { select: { id: true, name: true } },
        doctorAssignments: {
          orderBy: { assignedAt: "desc" },
          include: { staff: { select: { id: true, name: true, designation: true } } },
        },
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json(client);
  } catch (error) {
    console.error("[GET /api/clients/:id]", error);
    return NextResponse.json({ error: "Failed to fetch client" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    // Handle FO self-assignment ("Assign to Me")
    if (body.assignFrontOffice) {
      const latestIntake = await prisma.intakeForm.findFirst({
        where: { clientId: id },
        orderBy: { createdAt: "desc" },
      });

      if (latestIntake) {
        await prisma.intakeForm.update({
          where: { id: latestIntake.id },
          data: { frontOfficeExec: body.assignFrontOffice },
        });
      }

      await createAuditLog({
        action: "UPDATE",
        entity: "IntakeForm",
        entityId: latestIntake?.id || id,
        performedById: body.performedById,
        changes: { frontOfficeExec: { old: latestIntake?.frontOfficeExec || null, new: body.assignFrontOffice } },
        metadata: { clientId: id },
      });

      return NextResponse.json({ success: true });
    }

    // Handle multi-therapist assignment array
    if (Array.isArray(body.assignments) && body.assignments.length > 0) {
      const list = body.assignments as Array<{ staffId: string; serviceId?: string; isPrimary?: boolean }>;
      const primary = list.find(a => a.isPrimary) || list[0];

      const latestIntake = await prisma.intakeForm.findFirst({
        where: { clientId: id }, orderBy: { createdAt: "desc" },
      });

      if (latestIntake) {
        await prisma.intakeForm.update({
          where: { id: latestIntake.id },
          data: { assignedTo: primary.staffId, assignedBy: body.assignedBy || body.performedById || null },
        });
      }

      for (const a of list) {
        await prisma.clientDoctorAssignment.upsert({
          where: { clientId_staffId: { clientId: id, staffId: a.staffId } },
          update: { isPrimary: !!a.isPrimary, serviceId: a.serviceId || null },
          create: { clientId: id, staffId: a.staffId, isPrimary: !!a.isPrimary, serviceId: a.serviceId || null },
        });
      }

      const clientUpdate: Record<string, unknown> = {
        preferredTherapistId: primary.staffId,
        status: "ACTIVE",
      };
      // Capture how the client reached the clinic — required at assignment time.
      if (body.customerType !== undefined) {
        clientUpdate.customerType = body.customerType || null;
      }
      if (body.referralSourceId !== undefined) {
        clientUpdate.referralSourceId = body.referralSourceId || null;
      }
      if (body.referredBy !== undefined) {
        clientUpdate.referredBy = body.referredBy || null;
      }

      await prisma.client.update({ where: { id }, data: clientUpdate });

      const client = await prisma.client.findUnique({ where: { id }, select: { firstName: true, lastName: true, clientCode: true } });
      await createAuditLog({
        action: "UPDATE",
        entity: "Client",
        entityId: id,
        performedById: body.performedById,
        changes: { assignments: { old: null, new: list.map(a => a.staffId).join(",") } },
        metadata: {
          clientCode: client?.clientCode,
          clientName: client ? `${client.firstName} ${client.lastName}` : undefined,
          assignmentCount: list.length,
        },
      });

      return NextResponse.json({ success: true });
    }

    // Handle single-therapist assignment (legacy)
    if (body.assignTo) {
      const latestIntake = await prisma.intakeForm.findFirst({
        where: { clientId: id },
        orderBy: { createdAt: "desc" },
      });

      if (latestIntake) {
        await prisma.intakeForm.update({
          where: { id: latestIntake.id },
          data: {
            assignedTo: body.assignTo,
            assignedBy: body.assignedBy || body.performedById || null,
          },
        });
      }

      // Create ClientDoctorAssignment record so doctor can see this patient
      await prisma.clientDoctorAssignment.upsert({
        where: { clientId_staffId: { clientId: id, staffId: body.assignTo } },
        update: { isPrimary: true },
        create: { clientId: id, staffId: body.assignTo, isPrimary: true },
      });

      // Also set preferredTherapist for backward compat
      await prisma.client.update({
        where: { id },
        data: { preferredTherapistId: body.assignTo, status: "ACTIVE" },
      });

      // Resolve names for better audit trail
      const client = await prisma.client.findUnique({ where: { id }, select: { firstName: true, lastName: true, clientCode: true } });
      const assignedStaff = await prisma.staff.findUnique({ where: { id: body.assignTo }, select: { name: true, role: true, designation: true } });
      const performedByStaff = body.performedById ? await prisma.staff.findUnique({ where: { id: body.performedById }, select: { name: true } }) : null;

      // Audit the assignment with rich metadata
      await createAuditLog({
        action: "UPDATE",
        entity: "IntakeForm",
        entityId: latestIntake?.id || id,
        performedById: body.performedById,
        changes: { assignedTo: { old: latestIntake?.assignedTo || null, new: body.assignTo } },
        metadata: {
          clientId: id,
          clientCode: client?.clientCode,
          clientName: client ? `${client.firstName} ${client.lastName}` : undefined,
          assignedToName: assignedStaff?.name,
          assignedToRole: assignedStaff?.role,
          assignedByName: performedByStaff?.name,
        },
      });

      return NextResponse.json({ success: true });
    }

    // Fetch existing for audit diff
    const existing = await prisma.client.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // General client update
    const updateData: Record<string, unknown> = {};

    if (body.firstName !== undefined) updateData.firstName = body.firstName;
    if (body.lastName !== undefined) updateData.lastName = body.lastName;
    if (body.email !== undefined) updateData.email = body.email || null;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.dob !== undefined) updateData.dob = body.dob ? new Date(body.dob) : null;
    if (body.age !== undefined) updateData.age = body.age ? parseInt(String(body.age), 10) : null;
    if (body.sex !== undefined) updateData.sex = body.sex || null;
    if (body.dominance !== undefined) updateData.dominance = body.dominance || null;
    if (body.address !== undefined) updateData.address = body.address ? (typeof body.address === "string" ? body.address : JSON.stringify(body.address)) : null;
    if (body.emergencyContact !== undefined) updateData.emergencyContact = body.emergencyContact ? (typeof body.emergencyContact === "string" ? body.emergencyContact : JSON.stringify(body.emergencyContact)) : null;
    if (body.referredBy !== undefined) updateData.referredBy = body.referredBy || null;
    if (body.preferredTherapistId !== undefined) updateData.preferredTherapistId = body.preferredTherapistId || null;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.visitReasons !== undefined) updateData.visitReasons = Array.isArray(body.visitReasons) ? JSON.stringify(body.visitReasons) : body.visitReasons;
    if (body.consentFormPhotoUrl !== undefined) updateData.consentFormPhotoUrl = body.consentFormPhotoUrl;

    const client = await prisma.client.update({
      where: { id },
      data: updateData,
      include: {
        flags: { where: { isActive: true } },
        preferredTherapist: { select: { id: true, name: true } },
      },
    });

    // Audit trail — auto-diff all fields, always log
    const changes = computeChanges(existing as Record<string, unknown>, updateData);
    await createAuditLog({
      action: "UPDATE",
      entity: "Client",
      entityId: id,
      performedById: body.performedById,
      changes,
      metadata: { clientCode: existing.clientCode },
    });

    return NextResponse.json(client);
  } catch (error) {
    console.error("[PUT /api/clients/:id]", error);
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
  }
}
