import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { parseAddress } from "@/lib/address";
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
        // State lives in the address JSON, not its own column. A centre with
        // none on file can't have invoices raised against it (the GST split
        // needs it), so the edit form surfaces it explicitly.
        state: parseAddress(c.address)?.state ?? "",
        contactPhone: c.contactPhone ?? "",
        gstNumber: c.gstNumber ?? "",
        panNumber: c.panNumber ?? "",
        bankName: c.bankName ?? "",
        bankAccountNumber: c.bankAccountNumber ?? "",
        bankIfsc: c.bankIfsc ?? "",
        bankBranch: c.bankBranch ?? "",
        isActive: c.isActive,
        staffCount: c._count.staff,
        clientCount: c._count.clients,
        serviceCount: c._count.services,
      }))}
    />
  );
}
