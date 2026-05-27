import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ClinicsAdminView } from "./clinics-client";

export const metadata = { title: "Clinics — MBD Clinic OS" };

export default async function ClinicsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "admin:manage_clinics")) redirect("/dashboard");

  const centres = await prisma.centre.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { staff: true, clients: true, services: true } },
    },
  });

  return (
    <ClinicsAdminView
      centres={centres.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        location: c.location,
        isActive: c.isActive,
        staffCount: c._count.staff,
        clientCount: c._count.clients,
        serviceCount: c._count.services,
      }))}
    />
  );
}
