"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/utils";
import { readApiError } from "@/lib/error-messages";

interface InventoryRow {
  id: string;
  productName: string;
  hsnSac: string | null;
  category: string | null;
  supplierName: string | null;
  supplyPrice: number;
  sellingPrice: number;
  stock: number;
  minStock: number;
}

export function ProductsAdminView({ items }: { items: InventoryRow[] }) {
  const router = useRouter();
  const [stockFor, setStockFor] = useState<string | null>(null);
  const [delta, setDelta] = useState("");
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ supplyPrice: "", sellingPrice: "", supplierName: "", minStock: "" });
  const [pending, setPending] = useState<string | null>(null);

  async function recordStock(itemId: string, action: "STOCK_IN" | "STOCK_OUT" | "ADJUST") {
    const n = Number(delta);
    if (!Number.isFinite(n) || n === 0) {
      toast.error("Enter a non-zero quantity");
      return;
    }
    setPending(itemId);
    try {
      const res = await fetch("/api/admin/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryItemId: itemId,
          delta: action === "STOCK_OUT" ? -Math.abs(n) : Math.abs(n),
          action,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, { fallback: "Couldn't update inventory." }),
        );
      }
      toast.success(`${action.replace("_", " ").toLowerCase()} recorded`);
      setStockFor(null);
      setDelta("");
      setNotes("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  function startEdit(i: InventoryRow) {
    setEditing(i.id);
    setEdit({
      supplyPrice: String(i.supplyPrice),
      sellingPrice: String(i.sellingPrice),
      supplierName: i.supplierName ?? "",
      minStock: String(i.minStock),
    });
  }

  async function savePrice(itemId: string) {
    setPending(itemId);
    try {
      const res = await fetch("/api/admin/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryItemId: itemId,
          supplierName: edit.supplierName.trim() || undefined,
          supplyPrice: Number(edit.supplyPrice),
          sellingPrice: Number(edit.sellingPrice),
          minStock: Number(edit.minStock),
        }),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, { fallback: "Couldn't save changes." }),
        );
      }
      toast.success("Saved");
      setEditing(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Products &amp; inventory</h1>
        <p className="text-sm text-muted-foreground">
          {items.length} SKUs. Sorted by stock ascending — low stock first.
        </p>
      </header>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-left">Supplier</th>
                  <th className="px-3 py-2 text-right">Cost</th>
                  <th className="px-3 py-2 text-right">Sell</th>
                  <th className="px-3 py-2 text-right">Stock</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((i) => (
                  <RowAndDetail
                    key={i.id}
                    item={i}
                    editing={editing === i.id}
                    edit={edit}
                    onEditChange={setEdit}
                    onStartEdit={() => startEdit(i)}
                    onCancelEdit={() => setEditing(null)}
                    onSaveEdit={() => savePrice(i.id)}
                    stockOpen={stockFor === i.id}
                    onToggleStock={() => setStockFor(stockFor === i.id ? null : i.id)}
                    delta={delta}
                    setDelta={setDelta}
                    notes={notes}
                    setNotes={setNotes}
                    onStock={recordStock}
                    pending={pending === i.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RowAndDetail({
  item: i,
  editing,
  edit,
  onEditChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  stockOpen,
  onToggleStock,
  delta,
  setDelta,
  notes,
  setNotes,
  onStock,
  pending,
}: {
  item: InventoryRow;
  editing: boolean;
  edit: { supplyPrice: string; sellingPrice: string; supplierName: string; minStock: string };
  onEditChange: (e: typeof edit) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  stockOpen: boolean;
  onToggleStock: () => void;
  delta: string;
  setDelta: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  onStock: (id: string, action: "STOCK_IN" | "STOCK_OUT" | "ADJUST") => void;
  pending: boolean;
}) {
  const isLow = i.stock <= i.minStock;
  return (
    <>
      <tr className={isLow ? "bg-amber-50/40 dark:bg-amber-900/10" : ""}>
        <td className="px-3 py-2">
          <p className="font-medium">
            <Link href={`/dashboard/admin/products/${i.id}`} className="hover:underline">
              {i.productName}
            </Link>
          </p>
          <p className="text-[11px] text-muted-foreground">
            {i.category ?? "—"} · HSN {i.hsnSac ?? "—"}
          </p>
        </td>
        <td className="px-3 py-2">
          {editing ? (
            <Input
              value={edit.supplierName}
              onChange={(e) => onEditChange({ ...edit, supplierName: e.target.value })}
              className="h-8"
            />
          ) : (
            i.supplierName ?? "—"
          )}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {editing ? (
            <Input
              type="number"
              value={edit.supplyPrice}
              onChange={(e) => onEditChange({ ...edit, supplyPrice: e.target.value })}
              className="h-8 w-20 text-right"
            />
          ) : (
            formatINR(i.supplyPrice)
          )}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {editing ? (
            <Input
              type="number"
              value={edit.sellingPrice}
              onChange={(e) => onEditChange({ ...edit, sellingPrice: e.target.value })}
              className="h-8 w-20 text-right"
            />
          ) : (
            formatINR(i.sellingPrice)
          )}
        </td>
        <td className="px-3 py-2 text-right">
          <Badge variant={isLow ? "danger" : i.stock < i.minStock * 2 ? "warning" : "success"}>
            {i.stock} (min {editing ? (
              <input
                type="number"
                value={edit.minStock}
                onChange={(e) => onEditChange({ ...edit, minStock: e.target.value })}
                className="ml-1 inline-flex h-5 w-12 rounded border border-input bg-transparent px-1 text-[10px]"
              />
            ) : i.minStock})
          </Badge>
        </td>
        <td className="px-3 py-2">
          <div className="flex justify-end gap-1">
            {editing ? (
              <>
                <Button size="sm" onClick={onSaveEdit} disabled={pending}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={onCancelEdit}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={onStartEdit}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={onToggleStock}>
                  Stock
                </Button>
              </>
            )}
          </div>
        </td>
      </tr>
      {stockOpen ? (
        <tr>
          <td colSpan={6} className="bg-muted/40 px-3 py-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto_auto]">
              <div className="space-y-1">
                <Label className="text-xs">Quantity</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="optional"
                  className="h-8"
                />
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => onStock(i.id, "STOCK_IN")}
                disabled={pending}
              >
                Stock-in
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onStock(i.id, "STOCK_OUT")}
                disabled={pending}
              >
                Stock-out
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onStock(i.id, "ADJUST")}
                disabled={pending}
              >
                Adjust
              </Button>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
