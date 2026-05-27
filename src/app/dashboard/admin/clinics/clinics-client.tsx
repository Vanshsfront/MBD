"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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
import { SELECT_NONE } from "@/lib/select-styles";
import { readApiError } from "@/lib/error-messages";

interface CentreRow {
  id: string;
  name: string;
  slug: string;
  location: string;
  isActive: boolean;
  staffCount: number;
  clientCount: number;
  serviceCount: number;
}

export function ClinicsAdminView({ centres }: { centres: CentreRow[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    location: "",
    contactPhone: "",
    gstNumber: "",
    panNumber: "",
    bankName: "",
    bankAccountNumber: "",
    bankIfsc: "",
    bankBranch: "",
    copyFromCentreId: "",
  });

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim() || !form.location.trim()) {
      toast.error("Name, slug, location required");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/admin/clinics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          slug: form.slug.trim().toUpperCase(),
          location: form.location.trim(),
          contactPhone: form.contactPhone.trim() || undefined,
          gstNumber: form.gstNumber.trim() || undefined,
          panNumber: form.panNumber.trim() || undefined,
          bankName: form.bankName.trim() || undefined,
          bankAccountNumber: form.bankAccountNumber.trim() || undefined,
          bankIfsc: form.bankIfsc.trim() || undefined,
          bankBranch: form.bankBranch.trim() || undefined,
          copyFromCentreId: form.copyFromCentreId || undefined,
        }),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, { fallback: "Couldn't create the centre." }),
        );
      }
      const out = (await res.json()) as { copiedServices: number; copiedProducts: number };
      toast.success(
        `Centre created${
          out.copiedServices + out.copiedProducts > 0
            ? ` · copied ${out.copiedServices} services + ${out.copiedProducts} products`
            : ""
        }`,
      );
      setForm({
        name: "",
        slug: "",
        location: "",
        contactPhone: "",
        gstNumber: "",
        panNumber: "",
        bankName: "",
        bankAccountNumber: "",
        bankIfsc: "",
        bankBranch: "",
        copyFromCentreId: "",
      });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Clinics</h1>
        <p className="text-sm text-muted-foreground">
          Each centre runs its own staff, services, and inventory. New clinics start with zero
          staff (PRD §6.10).
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Existing centres ({centres.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {centres.length === 0 ? (
            <EmptyState
              className="border-0"
              icon={<Building2 className="h-8 w-8" />}
              title="No centres yet"
              description="Add your first clinic below to start onboarding patients."
            />
          ) : (
          <ul className="divide-y">
            {centres.map((c) => (
              <li key={c.id} className="px-6 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {c.name}{" "}
                      <code className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {c.slug}
                      </code>{" "}
                      <Badge variant={c.isActive ? "success" : "default"}>
                        {c.isActive ? "active" : "inactive"}
                      </Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.location} · {c.staffCount} staff · {c.serviceCount} services ·{" "}
                      {c.clientCount} patients
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add new clinic</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => update("name", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Slug (e.g. AND-MBD)</Label>
              <Input
                value={form.slug}
                onChange={(e) => update("slug", e.target.value.toUpperCase())}
                required
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Location</Label>
              <Input
                value={form.location}
                onChange={(e) => update("location", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Contact phone</Label>
              <Input value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>GST number</Label>
              <Input value={form.gstNumber} onChange={(e) => update("gstNumber", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>PAN</Label>
              <Input value={form.panNumber} onChange={(e) => update("panNumber", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Bank name</Label>
              <Input value={form.bankName} onChange={(e) => update("bankName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Account #</Label>
              <Input
                value={form.bankAccountNumber}
                onChange={(e) => update("bankAccountNumber", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>IFSC</Label>
              <Input value={form.bankIfsc} onChange={(e) => update("bankIfsc", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Branch</Label>
              <Input value={form.bankBranch} onChange={(e) => update("bankBranch", e.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Copy services + products from</Label>
              <Select
                value={form.copyFromCentreId === "" ? SELECT_NONE : form.copyFromCentreId}
                onValueChange={(v) => update("copyFromCentreId", v === SELECT_NONE ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="— start blank —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_NONE}>— start blank —</SelectItem>
                  {centres.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.serviceCount} services)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Staff are NOT copied. Stock starts at 0; record stock-ins after opening.
              </p>
            </div>
            <div className="md:col-span-2 md:flex md:justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? "Creating…" : "Create clinic"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
