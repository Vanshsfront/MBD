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
  if (!hasPermission(session.user.role, "billing:view_packages")) redirect("/dashboard");

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) notFound();

  const canEdit = hasPermission(session.user.role, "billing:edit_packages");

  const packages = await prisma.package.findMany({
    where: { clientId: id },
    orderBy: { createdAt: "desc" },
    include: { invoices: { select: { id: true, invoiceNumber: true, status: true, totalAmount: true } } },
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
      packages={packages.map((p) => ({
        id: p.id,
        totalSessions: p.totalSessions,
        completedSessions: p.completedSessions,
        totalPrice: p.totalPrice,
        validUntil: p.validUntil.toISOString(),
        status: p.status,
        serviceMix: p.serviceMix,
        invoices: p.invoices.map((i) => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          status: i.status,
          totalAmount: i.totalAmount,
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
        department: s.department?.name ?? null,
      }))}
      promotions={promotions.map((p) => ({
        code: p.code,
        label: `${p.name} (${p.discountType === "PERCENT" ? `${p.discountValue}%` : `₹${p.discountValue}`})`,
      }))}
    />
  );
}
