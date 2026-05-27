"use client";

// Inventory consume-in-session widget. PRD §4 C5 + §6.9.
// Therapist picks products + qty during the clinical record; the parent
// shell flushes these to /api/inventory-usage AFTER the consultation save
// returns success (we need the consultationId).

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Section } from "./shared";

export interface InventoryItemOption {
  inventoryItemId: string;
  productName: string;
  stock: number;
  hsnSac: string;
}

export interface InventoryUsageItem {
  inventoryItemId: string;
  productName: string;
  qty: number;
  notes?: string;
}

export function InventoryUsageWidget({
  options,
  value,
  onChange,
  disabled,
}: {
  options: InventoryItemOption[];
  value: InventoryUsageItem[];
  onChange: (next: InventoryUsageItem[]) => void;
  disabled?: boolean;
}) {
  const [pickerId, setPickerId] = useState<string>("");

  function add() {
    if (!pickerId) return;
    const opt = options.find((o) => o.inventoryItemId === pickerId);
    if (!opt) return;
    if (value.some((v) => v.inventoryItemId === opt.inventoryItemId)) {
      setPickerId("");
      return;
    }
    onChange([
      ...value,
      { inventoryItemId: opt.inventoryItemId, productName: opt.productName, qty: 1 },
    ]);
    setPickerId("");
  }
  function setQty(id: string, qty: number) {
    onChange(value.map((v) => (v.inventoryItemId === id ? { ...v, qty: Math.max(1, qty) } : v)));
  }
  function setNotes(id: string, notes: string) {
    onChange(value.map((v) => (v.inventoryItemId === id ? { ...v, notes } : v)));
  }
  function remove(id: string) {
    onChange(value.filter((v) => v.inventoryItemId !== id));
  }

  return (
    <Section
      title="Inventory used this session"
      description="Optional. Items here are decremented from stock + logged on save."
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={pickerId}
            onValueChange={setPickerId}
            disabled={disabled || options.length === 0}
          >
            <SelectTrigger className="flex-1">
              <SelectValue
                placeholder={
                  options.length === 0
                    ? "No products with stock in this centre"
                    : "Pick a product…"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.inventoryItemId} value={o.inventoryItemId}>
                  {o.productName} · {o.stock} in stock
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={add} disabled={disabled || !pickerId}>
            Add
          </Button>
        </div>

        {value.length > 0 ? (
          <ul className="space-y-2">
            {value.map((it) => {
              const stock = options.find((o) => o.inventoryItemId === it.inventoryItemId)?.stock ?? 0;
              const overdraft = it.qty > stock;
              return (
                <li
                  key={it.inventoryItemId}
                  className={`grid grid-cols-1 gap-2 rounded-md border px-3 py-2 sm:grid-cols-[1fr_80px_1fr_auto] ${
                    overdraft ? "border-destructive bg-destructive/5" : ""
                  }`}
                >
                  <span className="self-center text-sm">
                    {it.productName}
                    {overdraft ? (
                      <span className="ml-2 text-xs text-destructive">
                        only {stock} in stock
                      </span>
                    ) : null}
                  </span>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Qty</Label>
                    <Input
                      type="number"
                      min={1}
                      max={stock}
                      value={it.qty}
                      onChange={(e) => setQty(it.inventoryItemId, Number(e.target.value))}
                      disabled={disabled}
                      className="h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Notes (optional)
                    </Label>
                    <Input
                      value={it.notes ?? ""}
                      onChange={(e) => setNotes(it.inventoryItemId, e.target.value)}
                      disabled={disabled}
                      className="h-8"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(it.inventoryItemId)}
                    disabled={disabled}
                  >
                    ✕
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </Section>
  );
}
