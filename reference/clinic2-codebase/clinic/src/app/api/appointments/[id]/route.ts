import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

// GET /api/appointments/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, clientCode: true, phone: true } },
        therapist: { select: { id: true, name: true, designation: true } },
        service: { select: { id: true, name: true } },
      },
    });

    if (!appointment) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    return NextResponse.json(appointment);
  } catch (error) {
    console.error("[GET /api/appointments/:id]", error);
    return NextResponse.json({ error: "Failed to fetch appointment" }, { status: 500 });
  }
}

// PUT /api/appointments/[id] — update status, reschedule, add notes
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const updateData: Record<string, unknown> = {};
    if (body.status !== undefined) updateData.status = body.status;
    if (body.startTime !== undefined) updateData.startTime = new Date(body.startTime);
    if (body.endTime !== undefined) updateData.endTime = new Date(body.endTime);
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.followUpFlag !== undefined) updateData.followUpFlag = body.followUpFlag;
    if (body.followUpNote !== undefined) updateData.followUpNote = body.followUpNote;
    if (body.queuePosition !== undefined) updateData.queuePosition = body.queuePosition;

    // Capture cancellation attribution when status is moving to CANCELLED
    if (body.status === "CANCELLED") {
      if (body.cancelledBy) updateData.cancelledBy = body.cancelledBy; // PATIENT | THERAPIST
      if (body.cancelledReason) updateData.cancelledReason = body.cancelledReason;
      updateData.cancelledAt = new Date();
      if (body.performedById) updateData.cancelledById = body.performedById;
    }

    const appointment = await prisma.appointment.update({
      where: { id },
      data: updateData,
      include: {
        client: { select: { id: true, firstName: true, lastName: true, clientCode: true } },
        therapist: { select: { id: true, name: true } },
        service: { select: { id: true, name: true } },
      },
    });

    // When an appointment is cancelled, check for queued appointments at the same time
    if (body.status === "CANCELLED") {
      const queuedAppointments = await prisma.appointment.findMany({
        where: {
          therapistId: appointment.therapist.id,
          status: "QUEUED",
          startTime: appointment.startTime,
          endTime: appointment.endTime,
        },
        include: {
          client: { select: { firstName: true, lastName: true } },
        },
      });

      if (queuedAppointments.length > 0) {
        // Find all FRONT_OFFICE staff to notify
        const frontOfficeStaff = await prisma.staff.findMany({
          where: { role: "FRONT_OFFICE", isActive: true },
          select: { id: true },
        });

        // Create a notification for each front office staff member
        for (const staff of frontOfficeStaff) {
          for (const queued of queuedAppointments) {
            await prisma.notification.create({
              data: {
                type: "SCHEDULE_CHANGE",
                title: "Slot freed up — queued patient waiting",
                message: `${queued.client.firstName} ${queued.client.lastName} is queued for this time with ${appointment.therapist.name} (${new Date(appointment.startTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })})`,
                priority: "HIGH",
                targetUserId: staff.id,
                clientId: queued.clientId,
                metadata: JSON.stringify({
                  cancelledAppointmentId: id,
                  queuedAppointmentId: queued.id,
                  therapistId: appointment.therapist.id,
                  startTime: appointment.startTime,
                  endTime: appointment.endTime,
                }),
              },
            });
          }
        }
      }
    }

    // Audit
    if (body.performedById) {
      await createAuditLog({
        action: "UPDATE",
        entity: "Appointment",
        entityId: id,
        performedById: body.performedById,
        metadata: { clientCode: appointment.client.clientCode, updates: updateData },
      });
    }

    return NextResponse.json(appointment);
  } catch (error) {
    console.error("[PUT /api/appointments/:id]", error);
    return NextResponse.json({ error: "Failed to update appointment" }, { status: 500 });
  }
}

// DELETE /api/appointments/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Fetch before delete for audit trail
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        client: { select: { firstName: true, lastName: true, clientCode: true } },
        therapist: { select: { name: true } },
        service: { select: { name: true } },
      },
    });

    if (!appointment) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    await prisma.appointment.delete({ where: { id } });

    // Audit log
    const { searchParams } = new URL(req.url);
    const performedById = searchParams.get("performedById");
    if (performedById) {
      await createAuditLog({
        action: "DELETE",
        entity: "Appointment",
        entityId: id,
        performedById,
        metadata: {
          clientCode: appointment.client.clientCode,
          clientName: `${appointment.client.firstName} ${appointment.client.lastName}`,
          therapist: appointment.therapist.name,
          service: appointment.service.name,
          startTime: appointment.startTime.toISOString(),
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/appointments/:id]", error);
    return NextResponse.json({ error: "Failed to delete appointment" }, { status: 500 });
  }
}
