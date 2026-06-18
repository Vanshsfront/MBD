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
  discountPercent: number;
  discountAmount: number;
  validFrom: string;
  validUntil: string;
  status: string;
  serviceMix: string;
  invoices: Array<{ id: string; invoiceNumber: string; status: string; totalAmount: number }>;
  sessions: Array<{
    id: string;
    date: string;
    startedAt: string | null;
    endedAt: string | null;
    durationMin: number | null;
    formType: string | null;
    status: string;
    therapist: string | null;
    service: string | null;
  }>;
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

      <div className="space-y-4">
        <h2 className="text-base font-semibold">Packages ({packages.length})</h2>
        {packages.length === 0 ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">No packages for this patient yet.</p>
            </CardContent>
          </Card>
        ) : (
          packages.map((p) => <PackageDetailCard key={p.id} pkg={p} />)
        )}
      </div>
    </div>
  );
}

function PackageDetailCard({ pkg }: { pkg: PackageRow }) {
  const mix = parseServiceMix(pkg.serviceMix);
  const pct = pkg.totalSessions > 0
    ? Math.min(100, Math.round((pkg.completedSessions / pkg.totalSessions) * 100))
    : 0;
  const remaining = pkg.totalSessions - pkg.completedSessions;
  const daysToExpiry = Math.ceil(
    (new Date(pkg.validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  const isExpiringSoon = pkg.status === "ACTIVE" && daysToExpiry >= 0 && daysToExpiry <= 14;

  return (
    <Card className="overflow-hidden">
      <div className="p-6">
        {/* Header: name (derived from mix), status, valid range */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="eyebrow !mb-1">Package</p>
            <h3 className="text-lg font-semibold tracking-tight">
              {packageName(mix, pkg.totalSessions)}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDate(pkg.validFrom)} – {formatDate(pkg.validUntil)}
              {isExpiringSoon ? (
                <span className="ml-2 chip chip-warning">expires in {daysToExpiry}d</span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge
              variant={
                pkg.status === "ACTIVE"
                  ? "success"
                  : pkg.status === "COMPLETED"
                    ? "info"
                    : pkg.status === "EXPIRED"
                      ? "warning"
                      : "default"
              }
            >
              {pkg.status}
            </Badge>
            {pkg.status === "COMPLETED" && pkg.sessions.length > 0 ? (
              <span className="text-[10px] text-muted-foreground tabular">
                Completed on{" "}
                {formatDate(
                  pkg.sessions
                    .filter((s) => s.status === "COMPLETED")
                    .map((s) => s.endedAt ?? s.date)[0] ?? pkg.sessions[0]!.date,
                )}
              </span>
            ) : null}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">
              {pkg.completedSessions} of {pkg.totalSessions} sessions used
            </span>
            <span className="text-muted-foreground tabular-nums">
              {remaining} remaining · {pct}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-[color:var(--primary)] transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Service mix breakdown */}
        {mix.length > 0 ? (
          <div className="mt-4 border-t border-[color:var(--border-light)] pt-4">
            <p className="eyebrow !mb-2">Service mix</p>
            <ul className="space-y-1 text-sm">
              {mix.map((entry, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>
                    <span className="font-mono text-xs text-[color:var(--text-tertiary)]">
                      {entry.count}×{" "}
                    </span>
                    {entry.serviceName ?? entry.serviceId ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Pricing */}
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-[color:var(--border-light)] pt-4 text-sm sm:grid-cols-3">
          <KvLine k="Total price" v={formatINR(pkg.totalPrice)} />
          {pkg.discountPercent > 0 ? (
            <KvLine k="Discount" v={`${pkg.discountPercent}%`} />
          ) : pkg.discountAmount > 0 ? (
            <KvLine k="Discount" v={formatINR(pkg.discountAmount)} />
          ) : null}
          <KvLine k="Per session" v={formatINR(perSession(pkg))} />
        </div>

        {/* Linked invoices */}
        {pkg.invoices.length > 0 ? (
          <div className="mt-4 border-t border-[color:var(--border-light)] pt-4">
            <p className="eyebrow !mb-2">Linked invoices</p>
            <ul className="flex flex-wrap gap-2">
              {pkg.invoices.map((inv) => (
                <li key={inv.id}>
                  <Link
                    href={`/dashboard/billing/invoices/${inv.id}`}
                    className="inline-flex items-center gap-2 rounded-md border border-[color:var(--border-light)] px-2.5 py-1 text-xs font-medium hover:bg-secondary"
                  >
                    <span className="font-mono">{inv.invoiceNumber}</span>
                    <Badge
                      variant={inv.status === "PAID" ? "success" : "warning"}
                      className="text-[10px]"
                    >
                      {inv.status}
                    </Badge>
                    <span className="tabular-nums">{formatINR(inv.totalAmount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Linked sessions — chronological consumption log. Survives package
          * status flips (e.g. ACTIVE → COMPLETED), so a fully-consumed
          * package still surfaces its full history. */}
        {pkg.sessions.length > 0 ? (
          <div className="mt-4 border-t border-[color:var(--border-light)] pt-4">
            <p className="eyebrow !mb-2">Session log ({pkg.sessions.length})</p>
            <div className="overflow-x-auto">
              <table className="tbl tbl-compact">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Service</th>
                    <th>Form type</th>
                    <th>Therapist</th>
                    <th>Duration</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pkg.sessions.map((s) => (
                    <tr key={s.id}>
                      <td className="muted tabular">
                        {formatDateTime(s.startedAt ?? s.date)}
                      </td>
                      <td>{s.service ?? "—"}</td>
                      <td className="muted text-[11px]">
                        {s.formType ? (
                          <span className="chip text-[10px]">{s.formType}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="muted">{s.therapist ?? "—"}</td>
                      <td className="muted tabular">
                        {s.durationMin != null ? `${s.durationMin} min` : "—"}
                      </td>
                      <td>
                        <Badge
                          variant={
                            s.status === "COMPLETED"
                              ? "success"
                              : s.status === "CANCELLED" || s.status === "NO_SHOW"
                                ? "danger"
                                : "info"
                          }
                          className="text-[10px]"
                        >
                          {s.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function KvLine({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-tertiary)]">
        {k}
      </span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}

interface MixEntry {
  serviceId?: string;
  serviceName?: string;
  count: number;
}

function parseServiceMix(json: string | null | undefined): MixEntry[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((e): e is MixEntry => e && typeof e === "object" && typeof e.count === "number")
      .map((e) => ({
        serviceId: typeof e.serviceId === "string" ? e.serviceId : undefined,
        serviceName: typeof e.serviceName === "string" ? e.serviceName : undefined,
        count: e.count,
      }));
  } catch {
    return [];
  }
}

function packageName(mix: MixEntry[], totalSessions: number): string {
  if (mix.length === 0) return `${totalSessions}-session package`;
  // "Physio 12-pack" if single service; otherwise "Mixed package (4 services)"
  if (mix.length === 1 && mix[0]!.serviceName) {
    return `${mix[0]!.serviceName} · ${totalSessions}-pack`;
  }
  const primary = mix[0]!.serviceName ?? "Mixed";
  return `${primary} package (${mix.length} services · ${totalSessions} sessions)`;
}

function perSession(pkg: PackageRow): number {
  if (pkg.totalSessions <= 0) return 0;
  return pkg.totalPrice / pkg.totalSessions;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })} · ${d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
}
