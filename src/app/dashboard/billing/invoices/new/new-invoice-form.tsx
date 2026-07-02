"use client";

// Invoice creator — 4-flavor form. PRD §4 D6 + §6.4 (Duo/Trio qty lock).
//
// Services flavor: pick services from the centre's catalog. Qty for
//   participantCount>1 services is locked to that count.
// Products flavor: pick from centre InventoryItems that still have stock.
//   On submit, the API decrements stock + writes InventoryLog{SOLD}.
// Manual flavor: free-entry consultant + HSN + rate + qty + GST.
// Proforma: same shape as Services but invoiceType=PROFORMA + validTill date.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Clock, LayoutList, Box, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatINR } from "@/lib/utils";
import { SELECT_NONE } from "@/lib/select-styles";
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
  // Discount metadata so we can preview the saving inline before save.
  discountType: "PERCENT" | "FLAT";
  discountValue: number;
  maxDiscount: number | null;
}

interface Props {
  clients: ClientOption[];
  services: ServiceOption[];
  products: ProductOption[];
  staff: StaffOption[];
  promotions: PromoOption[];
  initialFlavor?: Flavor;
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

export function NewInvoiceForm({ clients, services, products, staff, promotions, initialFlavor = "SERVICES" }: Props) {
  const router = useRouter();
  const [flavor, setFlavor] = useState<Flavor>(initialFlavor);
  const [clientId, setClientId] = useState<string>("");
  const [referredBy, setReferredBy] = useState<string>("");
  const [validTill, setValidTill] = useState<string>(""); // PROFORMA only
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [promoCode, setPromoCode] = useState<string>("");
  const [lines, setLines] = useState<LineItem[]>([blankLine()]);
  const [pending, setPending] = useState(false);

  // Line-item picker (punchlist #5): Recent (this patient) / All services / Products + search.
  // Keyed by patient so a stale fetch never shows the wrong patient's recents
  // (and so the effect never calls setState synchronously).
  const [recent, setRecent] = useState<{ forClient: string; services: ServiceOption[] }>({
    forClient: "",
    services: [],
  });
  const [pickerTab, setPickerTab] = useState<"recent" | "all" | "products">("recent");
  const [pickerQuery, setPickerQuery] = useState("");

  // Pull this patient's recently delivered/recommended services for the Recent tab.
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    fetch(`/api/clients/${clientId}/recent-services`)
      .then((r) => (r.ok ? r.json() : { services: [] }))
      .then((d: { services?: ServiceOption[] }) => {
        if (!cancelled) setRecent({ forClient: clientId, services: d.services ?? [] });
      })
      .catch(() => {
        if (!cancelled) setRecent({ forClient: clientId, services: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  // Reset lines when flavor changes — fields differ.
  function switchFlavor(next: Flavor) {
    setFlavor(next);
    setLines([blankLine()]);
    setPickerTab(next === "PRODUCTS" ? "products" : "recent");
    setPickerQuery("");
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

  // ── Quick-add picker helpers ────────────────────────────────────────────
  function isLineEmpty(l: LineItem) {
    return !l.serviceId && !l.productId && !l.service && l.perAmount === 0;
  }
  function appendOrReplace(line: LineItem) {
    // If the only line is still blank, fill it; otherwise append a new line.
    setLines((prev) => (prev.length === 1 && isLineEmpty(prev[0]) ? [line] : [...prev, line]));
  }
  function addServiceLine(svc: ServiceOption) {
    appendOrReplace({
      serviceId: svc.id,
      service: svc.name,
      hsnSac: svc.hsnSac,
      perAmount: svc.basePrice,
      gstRate: svc.gstRate,
      qty: svc.participantCount,
      qtyLocked: svc.participantCount > 1 ? svc.participantCount : undefined,
    });
    toast.success(`Added ${svc.name}`);
  }
  function addProductLine(pr: ProductOption) {
    appendOrReplace({
      productId: pr.productId,
      product: pr.name,
      hsnSac: pr.hsnSac,
      perAmount: pr.sellingPrice,
      gstRate: pr.gstRate,
      qty: 1,
    });
    toast.success(`Added ${pr.name}`);
  }

  // Services grouped by department for the "All services" tab.
  const servicesByDept = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const groups = new Map<string, ServiceOption[]>();
    for (const s of services) {
      if (q && !s.name.toLowerCase().includes(q) && !(s.department ?? "").toLowerCase().includes(q)) continue;
      const dept = s.department ?? "Other";
      if (!groups.has(dept)) groups.set(dept, []);
      groups.get(dept)!.push(s);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [services, pickerQuery]);

  const recentFiltered = useMemo(() => {
    const list = recent.forClient === clientId ? recent.services : [];
    const q = pickerQuery.trim().toLowerCase();
    return q ? list.filter((s) => s.name.toLowerCase().includes(q)) : list;
  }, [recent, clientId, pickerQuery]);

  const productsFiltered = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    return q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
  }, [products, pickerQuery]);

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

          {/* PROFORMA callout */}
          {flavor === "PROFORMA" ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-medium text-amber-900">
                Proforma = Estimate for the patient to review
              </p>
              <p className="text-xs text-amber-800 mt-1">
                It is NOT a bill and is not counted as revenue.
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Patient</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

          {/* Quick-add picker (punchlist #5): Recent / All services / Products + search */}
          {flavor !== "MANUAL" ? (
            <div className="space-y-3 rounded-lg border border-[color:var(--border-light)] bg-muted/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1">
                  {flavor === "PRODUCTS" ? (
                    <PickerTab active={pickerTab === "products"} onClick={() => setPickerTab("products")} icon={<Box className="h-3.5 w-3.5" />} label="Products" />
                  ) : (
                    <>
                      <PickerTab active={pickerTab === "recent"} onClick={() => setPickerTab("recent")} icon={<Clock className="h-3.5 w-3.5" />} label="Recent" />
                      <PickerTab active={pickerTab === "all"} onClick={() => setPickerTab("all")} icon={<LayoutList className="h-3.5 w-3.5" />} label="All services" />
                    </>
                  )}
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="Search…"
                    className="h-8 w-48 pl-7"
                  />
                </div>
              </div>
              <div className="max-h-56 space-y-1 overflow-y-auto custom-scrollbar">
                {flavor !== "PRODUCTS" && pickerTab === "recent" ? (
                  !clientId ? (
                    <PickerHint text="Select a patient to see their recent services." />
                  ) : recentFiltered.length === 0 ? (
                    <PickerHint text="No recent services for this patient yet — use All services." />
                  ) : (
                    recentFiltered.map((s) => <ServicePickRow key={s.id} svc={s} onAdd={() => addServiceLine(s)} />)
                  )
                ) : null}
                {flavor !== "PRODUCTS" && pickerTab === "all" ? (
                  servicesByDept.length === 0 ? (
                    <PickerHint text="No services match your search." />
                  ) : (
                    servicesByDept.map(([dept, items]) => (
                      <div key={dept} className="space-y-1">
                        <p className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{dept}</p>
                        {items.map((s) => <ServicePickRow key={s.id} svc={s} onAdd={() => addServiceLine(s)} />)}
                      </div>
                    ))
                  )
                ) : null}
                {flavor === "PRODUCTS" ? (
                  productsFiltered.length === 0 ? (
                    <PickerHint text="No in-stock products match your search." />
                  ) : (
                    productsFiltered.map((p) => <ProductPickRow key={p.productId} pr={p} onAdd={() => addProductLine(p)} />)
                  )
                ) : null}
              </div>
            </div>
          ) : null}

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
                        <Select
                          value={l.serviceId ?? ""}
                          onValueChange={(v) => pickService(idx, v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent>
                            {services.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                                {s.department ? ` · ${s.department}` : ""} · ₹{s.basePrice}
                                {s.participantCount > 1 ? ` · qty=${s.participantCount}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}

                    {flavor === "PRODUCTS" ? (
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs">Product</Label>
                        <Select
                          value={l.productId ?? ""}
                          onValueChange={(v) => pickProduct(idx, v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.productId} value={p.productId}>
                                {p.name} · ₹{p.sellingPrice} · {p.stock} in stock
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                      <Select
                        value={l.consultantId ?? SELECT_NONE}
                        onValueChange={(v) => {
                          const s = staff.find((x) => x.id === v);
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
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="— none —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SELECT_NONE}>— none —</SelectItem>
                          {staff.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
              <Select
                value={promoCode === "" ? SELECT_NONE : promoCode}
                onValueChange={(v) => setPromoCode(v === SELECT_NONE ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="— none —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_NONE}>— none —</SelectItem>
                  {promotions.map((p) => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(() => {
                if (!promoCode) return null;
                const p = promotions.find((x) => x.code === promoCode);
                if (!p) return null;
                // Mirror src/lib/discount.ts: promo applies AFTER line +
                // additional discount. We preview against the current
                // afterDiscount total. PERCENT caps at maxDiscount when set.
                const base = totals.afterDiscount;
                const raw =
                  p.discountType === "PERCENT"
                    ? base * (p.discountValue / 100)
                    : p.discountValue;
                const promoDiscount =
                  p.maxDiscount != null ? Math.min(raw, p.maxDiscount) : raw;
                const capped =
                  p.discountType === "PERCENT" &&
                  p.maxDiscount != null &&
                  raw > p.maxDiscount;
                return (
                  <p className="text-[11px] text-muted-foreground">
                    Promo discount: <span className="font-medium text-emerald-700">−{formatINR(promoDiscount)}</span>
                    {capped ? <span className="ml-1">(capped at {formatINR(p.maxDiscount!)})</span> : null}
                  </p>
                );
              })()}
            </div>
          </div>

          {(() => {
            // Pre-flight gate for the Create button — keeps the same checks as
            // validate() above but lets us disable the button so FO can see at a
            // glance what's missing instead of clicking and reading a toast.
            const missingPatient = !clientId;
            const noLines = lines.length === 0;
            const badQty = lines.some((l) => l.qty < 1);
            const cantCreate = pending || missingPatient || noLines || badQty;
            const hint =
              missingPatient
                ? "Pick a patient first."
                : noLines
                  ? "Add at least one line."
                  : badQty
                    ? "Every line needs a quantity of 1 or more."
                    : null;
            return (
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
                  {hint ? (
                    <p className="mt-1 text-[11px] font-medium text-amber-700">{hint}</p>
                  ) : null}
                </div>
                <Button type="submit" disabled={cantCreate}>
                  {pending ? "Creating…" : "Create invoice"}
                </Button>
              </div>
            );
          })()}
        </form>
      </CardContent>
    </Card>
  );
}

// ──────── Quick-add picker sub-components ────────

function PickerTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-card text-[color:var(--text-primary)] shadow-[0_1px_2px_0_var(--shadow-color)]" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function PickerHint({ text }: { text: string }) {
  return <p className="px-1 py-3 text-center text-xs text-muted-foreground">{text}</p>;
}

function ServicePickRow({ svc, onAdd }: { svc: ServiceOption; onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary"
    >
      <span className="min-w-0 flex-1 truncate">
        {svc.name}
        {svc.participantCount > 1 ? <span className="ml-1 text-[10px] text-muted-foreground">·{svc.participantCount === 2 ? "Duo" : "Trio"}</span> : null}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">{formatINR(svc.basePrice)}</span>
      <span className="shrink-0 text-xs font-medium text-primary">+ Add</span>
    </button>
  );
}

function ProductPickRow({ pr, onAdd }: { pr: ProductOption; onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary"
    >
      <span className="min-w-0 flex-1 truncate">{pr.name}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{formatINR(pr.sellingPrice)} · {pr.stock} left</span>
      <span className="shrink-0 text-xs font-medium text-primary">+ Add</span>
    </button>
  );
}
