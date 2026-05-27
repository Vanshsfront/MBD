import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { activeCentreId } from "@/lib/centre";
import { ProductsAdminView } from "./products-client";

export const metadata = { title: "Products & inventory — MBD Clinic OS" };

export default async function ProductsAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "admin:manage_products")) redirect("/dashboard");

  const centreId = await activeCentreId();
  const items = await prisma.inventoryItem.findMany({
    where: centreId ? { centreId } : {},
    orderBy: [{ stock: "asc" }, { product: { name: "asc" } }],
    include: { product: { select: { name: true, hsnSacCode: true, category: true } } },
  });

  return (
    <ProductsAdminView
      items={items.map((i) => ({
        id: i.id,
        productName: i.product.name,
        hsnSac: i.product.hsnSacCode,
        category: i.product.category,
        supplierName: i.supplierName,
        supplyPrice: i.supplyPrice,
        sellingPrice: i.sellingPrice,
        stock: i.stock,
        minStock: i.minStock,
      }))}
    />
  );
}
