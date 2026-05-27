"use client";

// Invoice creator — 4-flavor form. PRD §4 D6 + §6.4 (Duo/Trio qty lock).
//
// Services flavor: pick services from the centre's catalog. Qty for
//   participantCount>1 services is locked to that count.
// Products flavor: pick from centre InventoryItems that still have stock.
//   On submit, the API decrements stock + writes InventoryLog{SOLD}.
// Manual flavor: free-entry consultant + HSN + rate + qty + GST.
// Proforma: same shape as Services but invoiceType=PROFORMA + validTill date.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatINR } from "@/lib/utils";
import { readApiError } from "@/lib/error-messages";

// ──────── Inputs ────────

interface ClientOption {
  id: string;
  label: string;
  phone: string;
}
interface ServiceOption {
  id: string;
  name: string;
  basePrice: number;
  gstRate: number;
  hsnSac: string;
  participantCount: number;
  department: string | null;
}
interface ProductOption {
  inventoryItemId: string;
  productId: string;
  name: string;
  hsnSac: string;
  gstRate: number;
  sellingPrice: number;
  stock: number;
}
interface StaffOption {
  id: string;
  name: string;
  designation: string | null;
}
interface PromoOption {
  code: string;
  label: string;
}

interface Props {
  clients: ClientOption[];
  services: ServiceOption[];
  products: ProductOption[];
  staff: StaffOption[];
  promotions: PromoOption[];
}

type Flavor = "SERVICES" | "PRODUCTS" | "MANUAL" | "PROFORMA";

// ──────── Line items ────────

interface LineItem {
  service?: string;
  product?: string;
  serviceId?: string;
  productId?: string;
  consultantId?: string;
  consultantName?: string;
  hsnSac?: string;
  notes?: string;
  qty: number;
  perAmount: number;
  lineDiscount?: number;
  gstRate: number;
  // UI-only — for Duo/Trio lock
  qtyLocked?: number;
}

function blankLine(): LineItem {
  return { qty: 1, perAmount: 0, gstRate: 0 };
}

export function NewInvoiceForm({ clients, services, products, staff, promotions }: Props) {
  const router = useRouter();
  const [flavor, setFlavor] = useState<Flavor>("SERVICES");
  const [clientId, setClientId] = useState<string>("");
  const [referredBy, setReferredBy] = useState<string>("");
  const [validTill, setValidTill] = useState<string>(""); // PROFORMA only
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [promoCode, setPromoCode] = useState<string>("");
  const [lines, setLines] = useState<LineItem[]>([blankLine()]);
  const [pending, setPending] = useState(false);

  // Reset lines when flavor changes — fields differ.
  function switchFlavor(next: Flavor) {
    setFlavor(next);
    setLines([blankLine()]);
    if (next !== "PROFORMA") setValidTill("");
  }

  function setLine<K extends keyof LineItem>(idx: number, k: K, v: LineItem[K]) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [k]: v } : l)));
  }
  function removeLine(idx: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }
  function addLine() {
    setLines((prev) => [...prev, blankLine()]);
  }

  function pickService(idx: number, serviceId: string) {
    const svc = services.find((s) => s.id === serviceId);
    if (!svc) return;
    setLines((prev) =>
      prev.map((l, i) =>
        i === idx
          ? {
              ...l,
              serviceId: svc.id,
              service: svc.name,
              hsnSac: svc.hsnSac,
              perAmount: svc.basePrice,
              gstRate: svc.gstRate,
              qty: svc.participantCount, // PRD §6.4 — locked for Duo/Trio
              qtyLocked: svc.participantCount > 1 ? svc.participantCount : undefined,
            }
          : l,
      ),
    );
  }
  function pickProduct(idx: number, productId: string) {
    const pr = products.find((p) => p.productId === productId);
    if (!pr) return;
    setLines((prev) =>
      prev.map((l, i) =>
        i === idx
          ? {
              ...l,
              productId: pr.productId,
              product: pr.name,
              hsnSac: pr.hsnSac,
              perAmount: pr.sellingPrice,
              gstRate: pr.gstRate,
              qty: 1,
              qtyLocked: undefined,
            }
          : l,
      ),
    );
  }

  // ──────── Totals preview (mirrors src/lib/discount.ts shape) ────────
  const totals = useMemo(() => {
    const linesGross = lines.reduce(
      (acc, l) => acc + l.qty * l.perAmount * (1 - (l.lineDiscount ?? 0)),
      0,
    );
    const linesGst = lines.reduce(
      (acc, l) => acc + l.qty * l.perAmount * (1 - (l.lineDiscount ?? 0)) * l.gstRate,
      0,
    );
    const subtotal = linesGross + linesGst;
    const afterDiscount = subtotal * (1 - discountPercent / 100);
    return { linesGross, linesGst, subtotal, afterDiscount };
  }, [lines, discountPercent]);

  function validate(): string | null {
    if (!clientId) return "Pick a patient.";
    if (lines.length === 0) return "Add at least one line.";
    for (const l of lines) {
      if (l.qty < 1) return "Quantity must be ≥ 1.";
      if (l.perAmount < 0) return "Rate must be ≥ 0.";
      if (flavor === "SERVICES" || flavor === "PROFORMA") {
        if (!l.serviceId) return "Pick a service for every Services line.";
      }
      if (flavor === "PRODUCTS") {
        if (!l.productId) return "Pick a product for every Products line.";
        const inv = products.find((p) => p.productId === l.productId);
        if (!inv) return "Selected product is no longer in inventory.";
        if (inv.stock < l.qty) {
          return `Stock for ${inv.name}: ${inv.stock} (you asked for ${l.qty}).`;
        }
      }
      if (flavor === "MANUAL") {
        if (!l.service) return "Manual lines need a description.";
        if (!l.consultantName) return "Manual lines need a consultant.";
      }
    }
    if (flavor === "PROFORMA" && !validTill) {
      return "Proforma needs a valid-till date.";
    }
    return null;
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          invoiceFlavor:
            flavor === "PROFORMA" ? "SERVICES" : (flavor as "SERVICES" | "PRODUCTS" | "MANUAL"),
          invoiceType: flavor === "PROFORMA" ? "PROFORMA" : "INVOICE",
          validTill:
            flavor === "PROFORMA" && validTill
              ? new Date(validTill).toISOString()
              : undefined,
          referredBy: referredBy || undefined,
          discountPercent,
          discountType: "PERCENT",
          promotionCode: promoCode || undefined,
          lineItems: lines.map((l) => ({
            service: l.service,
            product: l.product,
            serviceId: l.serviceId,
            productId: l.productId,
            consultantId: l.consultantId,
            consultantName: l.consultantName,
            hsnSac: l.hsnSac,
            notes: l.notes,
            qty: l.qty,
            perAmount: l.perAmount,
            lineDiscount: l.lineDiscount,
            gstRate: l.gstRate,
          })),
        }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, { fallback: "Couldn't create the invoice." }));
      }
      const out = (await res.json()) as { invoiceId: string; invoiceNumber: string };
      toast.success(`Created ${out.invoiceNumber}`);
      router.push(`/dashboard/billing/invoices/${out.invoiceId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice details</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5">
          {/* Flavor switch */}
          <div className="flex flex-wrap gap-2">
            {(["SERVICES", "PRODUCTS", "MANUAL", "PROFORMA"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => switchFlavor(f)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                  flavor === f
                    ? "border-primary bg-secondary"
                    : "border-input hover:bg-accent"
                }`}
              >
                {f === "SERVICES"
                  ? "Services"
                  : f === "PRODUCTS"
                    ? "Products"
                    : f === "MANUAL"
                      ? "Manual"
                      : "Proforma"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Patient</Label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              >
                <option value="">Select…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Referred by (optional)</Label>
              <Input
                value={referredBy}
                onChange={(e) => setReferredBy(e.target.value)}
                placeholder="e.g. Dr. Yasir Zahid"
              />
            </div>
            {flavor === "PROFORMA" ? (
              <div className="space-y-1.5">
                <Label>Valid till</Label>
                <Input
                  type="date"
                  value={validTill}
                  onChange={(e) => setValidTill(e.target.value)}
                  required
                />
              </div>
            ) : null}
          </div>

          {/* Lines */}
          <div className="space-y-3">
            <Label>Lines</Label>
            <ul className="space-y-3">
              {lines.map((l, idx) => (
                <li key={idx} className="rounded-md border p-3 space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {/* What kind of line ─ varies by flavor */}
                    {flavor === "SERVICES" || flavor === "PROFORMA" ? (
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs">Service</Label>
                        <select
                          value={l.serviceId ?? ""}
                          onChange={(e) => pickService(idx, e.target.value)}
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                        >
                          <option value="">Select…</option>
                          {services.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                              {s.department ? ` · ${s.department}` : ""} · ₹{s.basePrice}
                              {s.participantCount > 1 ? ` · qty=${s.participantCount}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    {flavor === "PRODUCTS" ? (
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs">Product</Label>
                        <select
                          value={l.productId ?? ""}
                          onChange={(e) => pickProduct(idx, e.target.value)}
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                        >
                          <option value="">Select…</option>
                          {products.map((p) => (
                            <option key={p.productId} value={p.productId}>
                              {p.name} · ₹{p.sellingPrice} · {p.stock} in stock
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    {flavor === "MANUAL" ? (
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs">Description</Label>
                        <Input
                          value={l.service ?? ""}
                          onChange={(e) => setLine(idx, "service", e.target.value)}
                          placeholder="Custom programme / write-off / etc."
                        />
                      </div>
                    ) : null}

                    <div className="space-y-1.5">
                      <Label className="text-xs">HSN/SAC</Label>
                      <Input
                        value={l.hsnSac ?? ""}
                        onChange={(e) => setLine(idx, "hsnSac", e.target.value)}
                        placeholder="999314 / …"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Consultant</Label>
                      <select
                        value={l.consultantId ?? ""}
                        onChange={(e) => {
                          const s = staff.find((x) => x.id === e.target.value);
                          setLines((prev) =>
                            prev.map((row, i) =>
                              i === idx
                                ? {
                                    ...row,
                                    consultantId: s?.id,
                                    consultantName: s?.name,
                                  }
                                : row,
                            ),
                          );
                        }}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                      >
                        <option value="">— none —</option>
                        {staff.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        Qty
                        {l.qtyLocked != null ? (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            (Duo/Trio locked to {l.qtyLocked})
                          </span>
                        ) : null}
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        value={l.qty}
                        onChange={(e) => setLine(idx, "qty", Number(e.target.value))}
                        disabled={l.qtyLocked != null}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Rate (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.perAmount}
                        onChange={(e) => setLine(idx, "perAmount", Number(e.target.value))}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Line discount %</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="1"
                        value={Math.round((l.lineDiscount ?? 0) * 100)}
                        onChange={(e) =>
                          setLine(idx, "lineDiscount", Math.max(0, Math.min(100, Number(e.target.value))) / 100)
                        }
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">GST %</Label>
                      <Input
                        type="number"
                        min={0}
                        max={50}
                        step="0.5"
                        value={Math.round(l.gstRate * 100)}
                        onChange={(e) =>
                          setLine(idx, "gstRate", Math.max(0, Math.min(50, Number(e.target.value))) / 100)
                        }
                      />
                    </div>

                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs">Notes</Label>
                      <Input
                        value={l.notes ?? ""}
                        onChange={(e) => setLine(idx, "notes", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">
                      Line total: {formatINR(l.qty * l.perAmount * (1 - (l.lineDiscount ?? 0)))}
                      {l.gstRate > 0
                        ? ` + ${formatINR(l.qty * l.perAmount * (1 - (l.lineDiscount ?? 0)) * l.gstRate)} GST`
                        : ""}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeLine(idx)}
                      disabled={lines.length <= 1}
                    >
                      Remove line
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              + Add line
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Additional discount (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={discountPercent}
                onChange={(e) => setDiscountPercent(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Promo code</Label>
              <select
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              >
                <option value="">— none —</option>
                {promotions.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/50 px-4 py-3">
            <div className="text-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Estimated total (incl. GST, after additional discount)
              </p>
              <p className="text-xl font-semibold tabular-nums">
                {formatINR(totals.afterDiscount)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Lines {formatINR(totals.linesGross)} + GST {formatINR(totals.linesGst)} ={" "}
                {formatINR(totals.subtotal)}
              </p>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create invoice"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
