import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ReferralSourcesAdminView } from "./referral-sources-client";

export const metadata = { title: "Referral sources — MBD Clinic OS" };

export default async function ReferralSourcesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "admin:manage_referral_sources")) redirect("/dashboard");

  const sources = await prisma.referralSource.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { clients: true } } },
  });

  return (
    <ReferralSourcesAdminView
      sources={sources.map((s) => ({
        id: s.id,
        name: s.name,
        sortOrder: s.sortOrder,
        isActive: s.isActive,
        clientCount: s._count.clients,
      }))}
    />
  );
}
