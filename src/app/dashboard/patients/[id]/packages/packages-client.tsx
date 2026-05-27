"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

interface PackageRow {
  id: string;
  totalSessions: number;
  completedSessions: number;
  totalPrice: number;
  validUntil: string;
  status: string;
  serviceMix: string;
  invoices: Array<{ id: string; invoiceNumber: string; status: string; totalAmount: number }>;
}

interface ConsultationRow {
  id: string;
  date: string;
  consultantName: string | null;
  recommendedSessions: number | null;
  templateKey: string;
  // Revamp Phase 4 — staged service mix persisted on the row.
  recommendedServicesJson: string | null;
}

interface ServiceOption {
  id: string;
  name: string;
  basePrice: number;
  participantCount: number;
  department: string | null;
}

interface PromoOption {
  code: string;
  label: string;
}

interface MixItem {
  serviceId: string;
  count: number;
}

interface Props {
  clientId: string;
  canEdit: boolean;
  packages: PackageRow[];
  consultations: ConsultationRow[];
  services: ServiceOption[];
  promotions: PromoOption[];
}

export function PackagesView({
  clientId,
  canEdit,
  packages,
  consultations,
  services,
  promotions,
}: Props) {
  const router = useRouter();

  // Hydrate the mix from the chosen consultation's persisted recommendation
  // payload (Phase 4 column). Any service the therapist recommended but that
  // is no longer active in the catalog is silently dropped.
  function recommendationsFor(consultationId: string): MixItem[] {
    const c = consultations.find((x) => x.id === consultationId);
    if (!c?.recommendedServicesJson) return [];
    try {
      const arr = JSON.parse(c.recommendedServicesJson) as Array<{
        serviceId: string;
        count: number;
      }>;
      return arr
        .filter((x) => services.some((s) => s.id === x.serviceId))
        .map((x) => ({ serviceId: x.serviceId, count: x.count }));
    } catch {
      return [];
    }
  }

  const initialConsultationId = consultations[0]?.id ?? "";
  const [consultationId, setConsultationId] = useState<string>(initialConsultationId);
  const [mix, setMix] = useState<MixItem[]>(() => recommendationsFor(initialConsultationId));
  const [discountPercent, setDiscountPercent] = useState(0);
  const [promoCode, setPromoCode] = useState("");
  const [pending, setPending] = useState(false);
  const recommendationsAvailable = useMemo(
    () => recommendationsFor(consultationId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [consultationId, consultations],
  );

  function applyRecommendations() {
    if (recommendationsAvailable.length === 0) {
      toast.message("No recommendations on the linked consultation.");
      return;
    }
    setMix(recommendationsAvailable);
    toast.success(
      `Applied ${recommendationsAvailable.length} recommendation${recommendationsAvailable.length === 1 ? "" : "s"} from consultation`,
    );
  }

  const total = useMemo(() => {
    let subtotal = 0;
    for (const m of mix) {
      const svc = services.find((s) => s.id === m.serviceId);
      if (!svc) continue;
      subtotal += m.count * svc.participantCount * svc.basePrice;
    }
    const afterDisc = subtotal * (1 - discountPercent / 100);
    return { subtotal, afterDisc };
  }, [mix, services, discountPercent]);

  function add(serviceId: string) {
    if (!serviceId) return;
    setMix((prev) =>
      prev.some((m) => m.serviceId === serviceId)
        ? prev
        : [...prev, { serviceId, count: 6 }],
    );
  }
  function setCount(serviceId: string, count: number) {
    setMix((prev) =>
      prev.map((m) => (m.serviceId === serviceId ? { ...m, count: Math.max(1, count) } : m)),
    );
  }
  function remove(serviceId: string) {
    setMix((prev) => prev.filter((m) => m.serviceId !== serviceId));
  }

  async function create() {
    if (mix.length === 0) {
      toast.error("Add at least one service");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          consultationId: consultationId || undefined,
          serviceMix: mix,
          discountPercent,
          promotionCode: promoCode || undefined,
          spawnInvoice: true,
        }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, { fallback: "Couldn't create the package." }));
      }
      const out = (await res.json()) as { invoiceNumber?: string; totalAmount: number };
      toast.success(
        `Package created · invoice ${out.invoiceNumber ?? "?"} · ${formatINR(out.totalAmount)}`,
      );
      router.refresh();
      setMix([]);
      setDiscountPercent(0);
      setPromoCode("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>Create package</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {consultations.length > 0 ? (
              <div className="space-y-1.5">
                <Label>Linked consultation</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={consultationId === "" ? SELECT_NONE : consultationId}
                    onValueChange={(v) => setConsultationId(v === SELECT_NONE ? "" : v)}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="— none —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SELECT_NONE}>— none —</SelectItem>
                      {consultations.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {new Date(c.date).toLocaleDateString("en-IN")} · {c.templateKey}
                          {c.recommendedSessions ? ` · ${c.recommendedSessions} rec.` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={applyRecommendations}
                    disabled={recommendationsAvailable.length === 0}
                  >
                    {recommendationsAvailable.length > 0
                      ? `Use therapist recommendations (${recommendationsAvailable.length})`
                      : "No recommendations"}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label>Add service</Label>
              <Select value="" onValueChange={(v) => add(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} {s.department ? `· ${s.department}` : ""} · {formatINR(s.basePrice)}
                      {s.participantCount > 1 ? ` (qty ×${s.participantCount})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {mix.length > 0 ? (
              <ul className="space-y-2">
                {mix.map((m) => {
                  const svc = services.find((s) => s.id === m.serviceId);
                  if (!svc) return null;
                  const lineTotal = m.count * svc.participantCount * svc.basePrice;
                  return (
                    <li
                      key={m.serviceId}
                      className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm"
                    >
                      <div className="flex-1">
                        <p className="font-medium">{svc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatINR(svc.basePrice)} ×
                          {svc.participantCount > 1 ? ` ${svc.participantCount}` : " 1"}
                          /session
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={50}
                          value={m.count}
                          onChange={(e) => setCount(m.serviceId, Number(e.target.value))}
                          className="w-20"
                        />
                        <span className="text-xs text-muted-foreground">sessions</span>
                      </div>
                      <span className="w-24 text-right font-medium tabular-nums">
                        {formatINR(lineTotal)}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => remove(m.serviceId)}>
                        Remove
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
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
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md bg-muted/50 px-4 py-3">
              <div className="text-sm">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Estimated total
                </p>
                <p className="text-xl font-semibold tabular-nums">{formatINR(total.afterDisc)}</p>
              </div>
              <Button onClick={create} disabled={pending || mix.length === 0}>
                {pending ? "Creating…" : "Create package + invoice"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Packages ({packages.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {packages.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No packages for this patient yet.</p>
          ) : (
            <ul className="divide-y">
              {packages.map((p) => (
                <li key={p.id} className="px-6 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {p.completedSessions}/{p.totalSessions} sessions used
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Valid till {new Date(p.validUntil).toLocaleDateString("en-IN")} · total{" "}
                        {formatINR(p.totalPrice)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={p.status === "ACTIVE" ? "success" : "default"}>
                        {p.status}
                      </Badge>
                      {p.invoices.length > 0 ? (
                        p.invoices.map((inv) => (
                          <Link
                            key={inv.id}
                            href={`/dashboard/billing/invoices/${inv.id}`}
                            className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
                          >
                            {inv.invoiceNumber}
                          </Link>
                        ))
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
