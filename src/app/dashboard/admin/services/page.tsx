import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { activeCentreId } from "@/lib/centre";
import { ServicesAdminView } from "./services-client";

export const metadata = { title: "Services & rates — MBD Clinic OS" };

export default async function ServicesAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "admin:manage_services")) redirect("/dashboard");

  // Services with centreId === null are global; show alongside centre-scoped.
  const centreId = await activeCentreId();
  const services = await prisma.service.findMany({
    where: centreId ? { OR: [{ centreId }, { centreId: null }] } : {},
    orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
    include: { department: { select: { name: true } } },
  });

  // Only OWNER imports — re-imports overwrite prices and need that level of
  // accountability. ADMIN can edit individual rows but not bulk-replace.
  const canImport = session.user.role === "OWNER" || session.user.role === "DEV";

  return (
    <ServicesAdminView
      canImport={canImport}
      services={services.map((s) => ({
        id: s.id,
        name: s.name,
        department: s.department?.name ?? "—",
        hsnSac: s.hsnSacCode,
        basePrice: s.basePrice,
        gstRate: s.gstRate,
        isActive: s.isActive,
        participantCount: s.participantCount,
        durationMin: s.durationMin,
      }))}
    />
  );
}
