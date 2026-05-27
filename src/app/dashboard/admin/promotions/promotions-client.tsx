"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
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
import { readApiError } from "@/lib/error-messages";

interface PromoRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  maxDiscount: number | null;
  validUntil: string | null;
  usedCount: number;
  maxUses: number | null;
  isActive: boolean;
}

export function PromotionsAdminView({ promos }: { promos: PromoRow[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    discountType: "PERCENT" as "PERCENT" | "FLAT",
    discountValue: "",
    maxDiscount: "",
    validUntil: "",
    maxUses: "",
  });

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Code and name required");
      return;
    }
    setPending("new");
    try {
      const res = await fetch("/api/admin/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim(),
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          discountType: form.discountType,
          discountValue: Number(form.discountValue),
          maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : undefined,
          validUntil: form.validUntil
            ? new Date(form.validUntil + "T23:59:59").toISOString()
            : undefined,
          maxUses: form.maxUses ? Number(form.maxUses) : undefined,
        }),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, { fallback: "Couldn't create the promotion." }),
        );
      }
      toast.success("Promotion created");
      setForm({
        code: "",
        name: "",
        description: "",
        discountType: "PERCENT",
        discountValue: "",
        maxDiscount: "",
        validUntil: "",
        maxUses: "",
      });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setPending(null);
    }
  }

  async function toggle(p: PromoRow) {
    setPending(p.id);
    try {
      const res = await fetch("/api/admin/promotions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, isActive: !p.isActive }),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, { fallback: "Couldn't toggle the promotion." }),
        );
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Toggle failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Promotions</h1>
        <p className="text-sm text-muted-foreground">
          Promo codes apply AFTER manual discount per PRD §6.3.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Create promotion</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                placeholder="SUMMER10"
                required
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Display name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5 md:col-span-3">
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={form.discountType}
                onValueChange={(v) =>
                  setForm((p) => ({ ...p, discountType: v as "PERCENT" | "FLAT" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENT">% off</SelectItem>
                  <SelectItem value="FLAT">Flat ₹ off</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Value</Label>
              <Input
                type="number"
                step="0.01"
                value={form.discountValue}
                onChange={(e) => setForm((p) => ({ ...p, discountValue: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Max discount (₹, optional)</Label>
              <Input
                type="number"
                value={form.maxDiscount}
                onChange={(e) => setForm((p) => ({ ...p, maxDiscount: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valid until</Label>
              <Input
                type="date"
                value={form.validUntil}
                onChange={(e) => setForm((p) => ({ ...p, validUntil: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Max uses (optional)</Label>
              <Input
                type="number"
                value={form.maxUses}
                onChange={(e) => setForm((p) => ({ ...p, maxUses: e.target.value }))}
              />
            </div>
            <div className="md:col-span-3 md:flex md:justify-end">
              <Button type="submit" disabled={pending === "new"}>
                {pending === "new" ? "Creating…" : "Create"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing promotions ({promos.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y">
            {promos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{p.code}</code>
                    <span className="text-sm font-medium">{p.name}</span>
                    <Badge variant={p.isActive ? "success" : "default"}>
                      {p.isActive ? "active" : "inactive"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.discountType === "PERCENT"
                      ? `${p.discountValue}% off`
                      : `${formatINR(p.discountValue)} off`}
                    {p.maxDiscount ? ` (max ${formatINR(p.maxDiscount)})` : ""}
                    {p.validUntil ? ` · valid till ${new Date(p.validUntil).toLocaleDateString("en-IN")}` : ""}
                    {` · used ${p.usedCount}${p.maxUses ? `/${p.maxUses}` : ""} times`}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => toggle(p)} disabled={pending === p.id}>
                  {p.isActive ? "Deactivate" : "Activate"}
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
