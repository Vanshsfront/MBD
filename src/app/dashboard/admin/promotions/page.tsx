import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { PromotionsAdminView } from "./promotions-client";

export const metadata = { title: "Promotions — MBD Clinic OS" };

export default async function PromotionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "admin:manage_promotions")) redirect("/dashboard");

  const promos = await prisma.promotion.findMany({ orderBy: { code: "asc" } });

  return (
    <PromotionsAdminView
      promos={promos.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        discountType: p.discountType,
        discountValue: p.discountValue,
        maxDiscount: p.maxDiscount,
        validUntil: p.validUntil?.toISOString() ?? null,
        usedCount: p.usedCount,
        maxUses: p.maxUses,
        isActive: p.isActive,
      }))}
    />
  );
}
