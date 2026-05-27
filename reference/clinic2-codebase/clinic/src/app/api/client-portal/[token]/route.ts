import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/client-portal/[token] — public endpoint, no auth needed
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const share = await prisma.dashboardShare.findUnique({
      where: { token },
      include: {
        client: {
          include: {
            packages: {
              orderBy: { createdAt: "desc" },
              take: 10,
            },
            sessions: {
              include: {
                therapist: { select: { name: true } },
                service: { select: { name: true } },
              },
              orderBy: { sessionDate: "desc" },
              take: 20,
            },
            invoices: {
              include: {
                payments: true,
              },
              orderBy: { createdAt: "desc" },
              take: 10,
            },
            consultations: {
              include: {
                consultant: { select: { name: true } },
                service: { select: { name: true } },
              },
              orderBy: { date: "desc" },
              take: 5,
            },
          },
        },
      },
    });

    if (!share) {
      return NextResponse.json({ error: "Dashboard link not found or invalid" }, { status: 404 });
    }

    if (!share.isActive) {
      return NextResponse.json({ error: "This dashboard link has been deactivated" }, { status: 410 });
    }

    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return NextResponse.json({ error: "This dashboard link has expired" }, { status: 410 });
    }

    // Increment view count and record last access
    await prisma.dashboardShare.update({
      where: { id: share.id },
      data: {
        viewCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });

    const visibleSections = JSON.parse(share.visibleSections || '["overview","packages","sessions","invoices"]');

    // Return only the sections that are visible
    const clientData: Record<string, unknown> = {
      firstName: share.client.firstName,
      lastName: share.client.lastName,
      clientCode: share.client.clientCode,
      visibleSections,
    };

    if (visibleSections.includes("overview")) {
      clientData.overview = {
        totalPackages: share.client.packages.length,
        totalSessions: share.client.sessions.length,
        completedSessions: share.client.sessions.filter(s => s.status === "COMPLETED").length,
        upcomingSessions: share.client.sessions.filter(s => s.status === "SCHEDULED" && new Date(s.sessionDate) >= new Date()).length,
        totalInvoiced: share.client.invoices.reduce((sum, inv) => sum + inv.totalAmount, 0),
        totalPaid: share.client.invoices.reduce((sum, inv) => sum + inv.paidAmount, 0),
      };
    }

    if (visibleSections.includes("packages")) {
      clientData.packages = share.client.packages.map(p => ({
        totalSessions: p.totalSessions,
        completedSessions: p.completedSessions,
        status: p.status,
        validFrom: p.validFrom,
        validUntil: p.validUntil,
      }));
    }

    if (visibleSections.includes("sessions")) {
      clientData.sessions = share.client.sessions.map(s => ({
        date: s.sessionDate,
        status: s.status,
        therapist: s.therapist.name,
        service: s.service.name,
        progressUpdates: s.progressUpdates,
      }));
    }

    if (visibleSections.includes("invoices")) {
      clientData.invoices = share.client.invoices.map(inv => ({
        invoiceNumber: inv.invoiceNumber,
        totalAmount: inv.totalAmount,
        paidAmount: inv.paidAmount,
        status: inv.status,
        createdAt: inv.createdAt,
      }));
    }

    if (visibleSections.includes("consultations")) {
      clientData.consultations = share.client.consultations.map(c => ({
        date: c.date,
        consultant: c.consultant.name,
        service: c.service.name,
        diagnosis: c.diagnosis,
        planOfCare: c.planOfCare,
      }));
    }

    return NextResponse.json(clientData);
  } catch (error) {
    console.error("[GET /api/client-portal/[token]]", error);
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}
