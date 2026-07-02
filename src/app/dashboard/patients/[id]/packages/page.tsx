import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { PackagesView } from "./packages-client";

export const metadata = { title: "Packages — MBD Clinic OS" };

export default async function PackagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Therapists never see the packages page — they get a compact session-count
  // chip on the patient detail page and a "Suggest package" button instead.
  // FO handles package creation, usage, pricing, service-mix.
  if (session.user.role === "THERAPIST") redirect(`/dashboard/patients/${id}`);
  if (!hasPermission(session.user.role, "billing:view_packages")) redirect("/dashboard");

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) notFound();

  const canEdit = hasPermission(session.user.role, "billing:edit_packages");

  // Pending suggestions at the top (therapist proposes, FO accepts/dismisses).
  const pendingSuggestions = canEdit
    ? await prisma.packageSuggestion.findMany({
        where: { clientId: id, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        include: { suggestedByStaff: { select: { name: true } } },
      })
    : [];

  const packages = await prisma.package.findMany({
    where: { clientId: id },
    orderBy: { createdAt: "desc" },
    include: {
      invoices: { select: { id: true, invoiceNumber: true, status: true, totalAmount: true } },
      sessions: {
        orderBy: { sessionDate: "desc" },
        take: 50,
        select: {
          id: true,
          sessionDate: true,
          startedAt: true,
          endedAt: true,
          recordedDurationMin: true,
          sessionFormType: true,
          status: true,
          therapist: { select: { name: true } },
          service: { select: { name: true } },
        },
      },
    },
  });

  // The most recent DRAFT consultation with recommendations is the input
  // for "Create package".
  const recentConsultations = await prisma.consultation.findMany({
    where: { clientId: id },
    orderBy: { date: "desc" },
    take: 5,
    include: { consultant: { select: { name: true } } },
  });

  const services = await prisma.service.findMany({
    where: {
      isActive: true,
      ...(client.centreId ? { centreId: client.centreId } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      basePrice: true,
      participantCount: true,
      durationMin: true,
      department: { select: { name: true } },
    },
  });

  const promotions = await prisma.promotion.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { code: true, name: true, discountType: true, discountValue: true, maxDiscount: true },
  });

  return (
    <PackagesView
      clientId={id}
      canEdit={canEdit}
      pendingSuggestions={pendingSuggestions.map((s) => ({
        id: s.id,
        note: s.note,
        suggestedByName: s.suggestedByStaff?.name ?? "—",
        createdAt: s.createdAt.toISOString(),
      }))}
      packages={packages.map((p) => ({
        id: p.id,
        totalSessions: p.totalSessions,
        completedSessions: p.completedSessions,
        totalPrice: p.totalPrice,
        discountPercent: p.discountPercent,
        discountAmount: p.discountAmount,
        validFrom: p.validFrom.toISOString(),
        validUntil: p.validUntil.toISOString(),
        status: p.status,
        serviceMix: p.serviceMix,
        invoices: p.invoices.map((i) => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          status: i.status,
          totalAmount: i.totalAmount,
        })),
        sessions: p.sessions.map((s) => ({
          id: s.id,
          date: s.sessionDate.toISOString(),
          startedAt: s.startedAt?.toISOString() ?? null,
          endedAt: s.endedAt?.toISOString() ?? null,
          durationMin: s.recordedDurationMin,
          formType: s.sessionFormType,
          status: s.status,
          therapist: s.therapist?.name ?? null,
          service: s.service?.name ?? null,
        })),
      }))}
      consultations={recentConsultations.map((c) => ({
        id: c.id,
        date: c.date.toISOString(),
        consultantName: c.consultant?.name ?? null,
        recommendedSessions: c.recommendedSessions,
        templateKey: c.templateKey,
        recommendedServicesJson: c.recommendedServicesJson,
      }))}
      services={services.map((s) => ({
        id: s.id,
        name: s.name,
        basePrice: s.basePrice,
        participantCount: s.participantCount,
        durationMin: s.durationMin,
        department: s.department?.name ?? null,
      }))}
      promotions={promotions.map((p) => ({
        code: p.code,
        label: `${p.name} (${p.discountType === "PERCENT" ? `${p.discountValue}%` : `₹${p.discountValue}`})`,
      }))}
    />
  );
}
