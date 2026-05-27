"use client";

import { useState } from "react";
import { useApiCache, invalidateCache } from "@/hooks/use-api-cache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Tag, Edit2, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Promotion {
  id: string;
  name: string;
  code: string;
  description: string | null;
  discountType: "PERCENT" | "FLAT";
  discountValue: number;
  maxDiscount: number | null;
  validFrom: string | null;
  validUntil: string | null;
  maxUses: number | null;
  usedCount: number;
  isActive: boolean;
  createdAt: string;
}

const emptyPromo = {
  name: "",
  code: "",
  description: "",
  discountType: "PERCENT" as "PERCENT" | "FLAT",
  discountValue: 0,
  maxDiscount: null as number | null,
  validFrom: "",
  validUntil: "",
  maxUses: null as number | null,
  isActive: true,
};

export default function PromotionsPage() {
  const { data: promotions, loading, refetch } = useApiCache<Promotion[]>("/api/promotions");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [form, setForm] = useState({ ...emptyPromo });
  const [submitting, setSubmitting] = useState(false);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyPromo });
    setDialogOpen(true);
  };

  const openEdit = (p: Promotion) => {
    setEditing(p);
    setForm({
      name: p.name,
      code: p.code,
      description: p.description || "",
      discountType: p.discountType,
      discountValue: p.discountValue,
      maxDiscount: p.maxDiscount,
      validFrom: p.validFrom ? p.validFrom.split("T")[0] : "",
      validUntil: p.validUntil ? p.validUntil.split("T")[0] : "",
      maxUses: p.maxUses,
      isActive: p.isActive,
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      toast.error("Name and code are required");
      return;
    }
    if (form.discountValue <= 0) {
      toast.error("Discount value must be greater than 0");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        code: form.code.toUpperCase().trim(),
        validFrom: form.validFrom || null,
        validUntil: form.validUntil || null,
        maxUses: form.maxUses ?? null,
        maxDiscount: form.maxDiscount ?? null,
      };
      const url = editing ? `/api/promotions/${editing.id}` : "/api/promotions";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast.success(editing ? "Promotion updated" : "Promotion created");
      setDialogOpen(false);
      invalidateCache("/api/promotions");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const del = async (p: Promotion) => {
    if (!confirm(`Delete promotion "${p.name}"?`)) return;
    try {
      const res = await fetch(`/api/promotions/${p.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Deleted");
      invalidateCache("/api/promotions");
      refetch();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const toggleActive = async (p: Promotion) => {
    try {
      const res = await fetch(`/api/promotions/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !p.isActive }),
      });
      if (!res.ok) throw new Error("Failed");
      invalidateCache("/api/promotions");
      refetch();
    } catch {
      toast.error("Failed");
    }
  };

  return (
    <div className="space-y-6 pb-12 w-full max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary flex items-center gap-3">
            <Tag className="h-7 w-7 text-blue-600" /> Promotions
          </h1>
          <p className="text-sm text-text-tertiary">
            Create discount codes that FO can apply on top of the regular invoice discount.
            Promo discount is calculated AFTER the manual invoice discount.
          </p>
        </div>
        <Button onClick={openNew} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4 mr-1" /> New Promotion
        </Button>
      </div>

      <div className="neumorphic-card overflow-hidden">
        <Table>
          <TableHeader className="bg-surface-secondary border-b border-border-light">
            <TableRow className="hover:bg-surface-secondary border-0">
              <TableHead className="text-text-tertiary text-xs uppercase tracking-wider py-4 pl-6">Name / Code</TableHead>
              <TableHead className="text-text-tertiary text-xs uppercase tracking-wider py-4">Discount</TableHead>
              <TableHead className="text-text-tertiary text-xs uppercase tracking-wider py-4">Validity</TableHead>
              <TableHead className="text-text-tertiary text-xs uppercase tracking-wider py-4">Usage</TableHead>
              <TableHead className="text-text-tertiary text-xs uppercase tracking-wider py-4">Status</TableHead>
              <TableHead className="text-text-tertiary text-xs uppercase tracking-wider py-4 pr-6 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border-light">
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-16">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600" />
              </TableCell></TableRow>
            ) : !promotions || promotions.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-16 text-text-tertiary text-sm">
                No promotions yet. Click &ldquo;New Promotion&rdquo; to create one.
              </TableCell></TableRow>
            ) : promotions.map(p => (
              <TableRow key={p.id} className="hover:bg-surface-secondary">
                <TableCell className="pl-6 py-4">
                  <div className="font-semibold text-text-primary text-sm">{p.name}</div>
                  <div className="font-mono text-[11px] text-blue-700">{p.code}</div>
                  {p.description && <div className="text-xs text-text-tertiary mt-1 max-w-md truncate">{p.description}</div>}
                </TableCell>
                <TableCell className="py-4 text-sm">
                  {p.discountType === "PERCENT" ? (
                    <>
                      <span className="font-bold">{p.discountValue}%</span> off
                      {p.maxDiscount != null && <span className="text-text-tertiary"> upto ₹{p.maxDiscount}</span>}
                    </>
                  ) : (
                    <><span className="font-bold">₹{p.discountValue}</span> flat off</>
                  )}
                </TableCell>
                <TableCell className="py-4 text-xs text-text-secondary">
                  {p.validFrom || p.validUntil ? (
                    <>
                      {p.validFrom ? format(new Date(p.validFrom), "dd MMM yyyy") : "Always"} —{" "}
                      {p.validUntil ? format(new Date(p.validUntil), "dd MMM yyyy") : "No end"}
                    </>
                  ) : "Always valid"}
                </TableCell>
                <TableCell className="py-4 text-sm">
                  {p.usedCount}{p.maxUses != null ? ` / ${p.maxUses}` : ""}
                </TableCell>
                <TableCell className="py-4">
                  <button onClick={() => toggleActive(p)} className="inline-flex items-center gap-1 text-xs font-semibold">
                    {p.isActive ? (
                      <Badge className="bg-green-50 text-green-700 border border-green-200 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" /> Active</Badge>
                    ) : (
                      <Badge className="bg-gray-50 text-gray-700 border border-gray-200 text-[10px]"><XCircle className="h-3 w-3 mr-1" /> Inactive</Badge>
                    )}
                  </button>
                </TableCell>
                <TableCell className="pr-6 py-4 text-right">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(p)} className="h-8 w-8 p-0"><Edit2 className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => del(p)} className="h-8 w-8 p-0 text-red-600"><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl bg-surface border-border-light">
          <DialogTitle className="text-base font-bold">{editing ? "Edit Promotion" : "New Promotion"}</DialogTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs font-semibold">Name *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Senior Citizen 5%" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Code *</Label>
              <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. SENIOR5" className="h-10 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Type *</Label>
              <Select value={form.discountType} onValueChange={v => v && setForm({ ...form, discountType: v as "PERCENT" | "FLAT" })}>
                <SelectTrigger className="h-10"><SelectValue>{form.discountType === "PERCENT" ? "Percentage (%)" : "Flat (₹)"}</SelectValue></SelectTrigger>
                <SelectContent className="bg-surface">
                  <SelectItem value="PERCENT">Percentage (%)</SelectItem>
                  <SelectItem value="FLAT">Flat (₹)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Value *</Label>
              <Input type="number" value={form.discountValue || ""} onChange={e => setForm({ ...form, discountValue: parseFloat(e.target.value) || 0 })} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Max Discount (₹, for %)</Label>
              <Input type="number" value={form.maxDiscount ?? ""} onChange={e => setForm({ ...form, maxDiscount: e.target.value ? parseFloat(e.target.value) : null })} placeholder="Upto cap" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Valid From</Label>
              <Input type="date" value={form.validFrom} onChange={e => setForm({ ...form, validFrom: e.target.value })} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Valid Until</Label>
              <Input type="date" value={form.validUntil} onChange={e => setForm({ ...form, validUntil: e.target.value })} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Max Uses (blank = unlimited)</Label>
              <Input type="number" value={form.maxUses ?? ""} onChange={e => setForm({ ...form, maxUses: e.target.value ? parseInt(e.target.value) : null })} className="h-10" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs font-semibold">Description</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional — shown in the apply-promo dropdown" className="min-h-[60px]" />
            </div>
            <div className="flex items-center gap-2 md:col-span-2">
              <input type="checkbox" id="isActive" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} />
              <Label htmlFor="isActive" className="text-sm font-semibold cursor-pointer">Active</Label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-border-light">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-white">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Save" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
