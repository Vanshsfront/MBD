// Invoice creator — Services / Products / Manual / Proforma flavors.
// PRD §4 D6 + Revamp Phase 5.

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { activeCentreId } from "@/lib/centre";
import { NewInvoiceForm } from "./new-invoice-form";

export const metadata = { title: "New invoice — MBD Clinic OS" };

export default async function NewInvoicePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "billing:create_edit_invoice")) {
    redirect("/dashboard");
  }

  const centreId = (await activeCentreId()) ?? session.user.centreId ?? null;
  if (!centreId) redirect("/dashboard");

  const [clients, services, inventoryItems, staff, promotions] = await Promise.all([
    prisma.client.findMany({
      where: { centreId, status: { in: ["ACTIVE", "INACTIVE"] } },
      orderBy: [{ firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, clientCode: true, phone: true },
      take: 500,
    }),
    prisma.service.findMany({
      where: {
        isActive: true,
        OR: [{ centreId }, { centreId: null }],
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        basePrice: true,
        gstRate: true,
        hsnSacCode: true,
        participantCount: true,
        department: { select: { name: true } },
      },
    }),
    // Centre-scoped InventoryItems with stock > 0; the Products tab uses these.
    prisma.inventoryItem.findMany({
      where: { centreId, stock: { gt: 0 } },
      orderBy: { product: { name: "asc" } },
      select: {
        id: true,
        productId: true,
        stock: true,
        sellingPrice: true,
        product: {
          select: { id: true, name: true, hsnSacCode: true, gstRate: true },
        },
      },
    }),
    prisma.staff.findMany({
      where: { isActive: true, role: { in: ["CONSULTANT", "THERAPIST", "ADMIN", "OWNER"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, designation: true },
    }),
    prisma.promotion.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: {
        code: true,
        name: true,
        discountType: true,
        discountValue: true,
        maxDiscount: true,
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">New invoice</h1>
        <p className="text-sm text-muted-foreground">
          Pick the flavor, fill the lines, preview totals, create.
        </p>
      </header>
      <NewInvoiceForm
        clients={clients.map((c) => ({
          id: c.id,
          label: `${c.firstName} ${c.lastName} (${c.clientCode})`,
          phone: c.phone,
        }))}
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          basePrice: s.basePrice,
          gstRate: s.gstRate,
          hsnSac: s.hsnSacCode ?? "",
          participantCount: s.participantCount,
          department: s.department?.name ?? null,
        }))}
        products={inventoryItems.map((it) => ({
          inventoryItemId: it.id,
          productId: it.productId,
          name: it.product.name,
          hsnSac: it.product.hsnSacCode ?? "",
          gstRate: it.product.gstRate,
          sellingPrice: it.sellingPrice,
          stock: it.stock,
        }))}
        staff={staff.map((s) => ({
          id: s.id,
          name: s.name,
          designation: s.designation ?? null,
        }))}
        promotions={promotions.map((p) => ({
          code: p.code,
          label: `${p.name} (${p.discountType === "PERCENT" ? `${p.discountValue}%` : `₹${p.discountValue}`})`,
        }))}
      />
    </div>
  );
}
