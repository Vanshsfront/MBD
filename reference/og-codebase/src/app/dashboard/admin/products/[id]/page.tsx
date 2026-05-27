// Per-InventoryItem history view — Phase 7. Shows the InventoryLog ledger
// (stock-in / sold / used-in-session / adjustments) plus the price-history
// rows so the audit trail for a SKU is one click away.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/utils";

export const metadata = { title: "Inventory item — MBD Clinic OS" };

export default async function InventoryItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "admin:manage_products")) redirect("/dashboard");

  const item = await prisma.inventoryItem.findUnique({
    where: { id },
    include: {
      product: { select: { name: true, hsnSacCode: true, category: true } },
      centre: { select: { name: true, slug: true } },
    },
  });
  if (!item) notFound();

  const [logs, priceHistory, performers] = await Promise.all([
    prisma.inventoryLog.findMany({
      where: { inventoryItemId: id },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.inventoryPriceHistory.findMany({
      where: { inventoryItemId: id },
      orderBy: { effectiveFrom: "desc" },
    }),
    prisma.staff.findMany({ select: { id: true, name: true } }),
  ]);
  const staffById = new Map(performers.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{item.product.name}</h1>
          <p className="text-sm text-muted-foreground">
            {item.centre?.name ?? "—"} · {item.product.category ?? "—"} ·{" "}
            <span className="font-mono text-xs">{item.product.hsnSacCode ?? "—"}</span>
          </p>
        </div>
        <Link
          href="/dashboard/admin/products"
          className="text-sm text-primary hover:underline"
        >
          ← All inventory
        </Link>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Current stock</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <KV k="On hand" v={String(item.stock)} />
            <KV k="Min stock" v={String(item.minStock)} />
            <KV
              k="Status"
              v={
                <Badge variant={item.stock <= item.minStock ? "warning" : "success"}>
                  {item.stock <= item.minStock ? "low" : "ok"}
                </Badge>
              }
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <KV k="Supplier" v={item.supplierName ?? "—"} />
            <KV k="Supply price" v={formatINR(item.supplyPrice)} />
            <KV k="Selling price" v={formatINR(item.sellingPrice)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Counts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <KV k="Log entries" v={String(logs.length)} />
            <KV k="Price changes" v={String(priceHistory.length)} />
            <KV k="Created" v={item.createdAt.toLocaleDateString("en-IN")} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Movement log ({logs.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">
              No movements recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">When</th>
                    <th className="px-3 py-2 text-left">Action</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-left">By</th>
                    <th className="px-3 py-2 text-left">Notes / link</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {l.createdAt.toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={badgeForAction(l.action)}>{l.action}</Badge>
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${l.quantity < 0 ? "text-rose-600" : "text-emerald-600"}`}
                      >
                        {l.quantity > 0 ? "+" : ""}
                        {l.quantity}
                      </td>
                      <td className="px-3 py-2">
                        {staffById.get(l.performedById) ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {l.invoiceId ? (
                          <Link
                            href={`/dashboard/billing/invoices/${l.invoiceId}`}
                            className="text-primary hover:underline"
                          >
                            invoice
                          </Link>
                        ) : null}
                        {l.invoiceId && l.notes ? " · " : ""}
                        {l.notes ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Price history ({priceHistory.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {priceHistory.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">
              No price changes yet.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-muted/40 uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Effective from</th>
                  <th className="px-3 py-2 text-left">Supplier</th>
                  <th className="px-3 py-2 text-right">Supply</th>
                  <th className="px-3 py-2 text-right">Selling</th>
                  <th className="px-3 py-2 text-left">Changed by</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {priceHistory.map((h) => (
                  <tr key={h.id}>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {h.effectiveFrom.toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-3 py-2">{h.supplierName ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatINR(h.supplyPrice)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatINR(h.sellingPrice)}
                    </td>
                    <td className="px-3 py-2">
                      {h.changedById ? (staffById.get(h.changedById) ?? "—") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

function badgeForAction(action: string): "success" | "danger" | "warning" | "info" | "default" {
  if (action === "STOCK_IN") return "success";
  if (action === "SOLD" || action === "STOCK_OUT") return "warning";
  if (action === "USED_IN_SESSION") return "info";
  return "default";
}
