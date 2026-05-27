"use client";

import { useState, useEffect, useMemo } from "react";
import { useApiCache, invalidateCache } from "@/hooks/use-api-cache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Package, Plus, Loader2, Pencil, Trash2, Download, Building2 } from "lucide-react";
import { toast } from "sonner";

interface Department { id: string; name: string; defaultGstRate: number; }
interface Service {
  id: string;
  name: string;
  basePrice: number;
  gstRate: number;
  hsnSacCode: string | null;
  participantCount: number;
  isActive: boolean;
  departmentId: string;
  centreId: string | null;
  department: { id: string; name: string };
  centre: { name: string; slug: string } | null;
}
interface ActiveCentreInfo {
  activeCentreId: string | null;
  canSwitch: boolean;
  centre: { id: string; name: string; slug: string; location: string } | null;
}

const GST_OPTIONS = [0, 0.05, 0.12, 0.18];

export default function ServicesAdminPage() {
  const { data: services, loading, refetch } = useApiCache<Service[]>("/api/services");
  const { data: departments } = useApiCache<Department[]>("/api/departments");
  const { data: active } = useApiCache<ActiveCentreInfo>("/api/active-centre", { ttl: 30_000 });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    departmentId: "",
    basePrice: "",
    gstRate: "0",
    hsnSacCode: "",
    participantCount: "1",
  });

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        departmentId: editing.departmentId,
        basePrice: String(editing.basePrice),
        gstRate: String(editing.gstRate),
        hsnSacCode: editing.hsnSacCode ?? "",
        participantCount: String(editing.participantCount),
      });
    } else {
      setForm({ name: "", departmentId: "", basePrice: "", gstRate: "0", hsnSacCode: "", participantCount: "1" });
    }
  }, [editing]);

  const grouped = useMemo(() => {
    const map = new Map<string, Service[]>();
    (services || []).forEach((s) => {
      const key = s.department.name;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [services]);

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (s: Service) => { setEditing(s); setDialogOpen(true); };

  const submit = async () => {
    if (!form.name || !form.departmentId || !form.basePrice) return toast.error("Name, department, base price required");
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        departmentId: form.departmentId,
        basePrice: Number(form.basePrice),
        gstRate: Number(form.gstRate),
        hsnSacCode: form.hsnSacCode.trim() || null,
        participantCount: Number(form.participantCount) || 1,
      };
      const url = editing ? `/api/services/${editing.id}` : "/api/services";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast.success(editing ? "Service updated" : "Service added");
      setDialogOpen(false);
      invalidateCache("/api/services");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (s: Service) => {
    if (!confirm(`Delete "${s.name}"? If it's in use it will be deactivated instead.`)) return;
    try {
      const res = await fetch(`/api/services/${s.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(data.softDelete ? "Deactivated (in use)" : "Deleted");
      invalidateCache("/api/services");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const importDefault = async () => {
    if (!confirm("Import the default MBD service catalogue into this clinic? Existing services with the same name will be skipped.")) return;
    setImporting(true);
    try {
      const res = await fetch("/api/services/import", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`Imported ${data.created} services (${data.skipped} skipped)`);
      invalidateCache("/api/services");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 w-full max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary flex items-center gap-3">
            <Package className="h-7 w-7 text-amber-600" /> Services
          </h1>
          <p className="text-sm text-text-tertiary">
            Each clinic has its own catalogue and pricing. Add services manually, or import the default MBD rate card.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={importDefault} disabled={importing || !active?.centre}>
            {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            Import MBD defaults
          </Button>
          <Button onClick={openNew} disabled={!active?.centre} className="bg-amber-600 hover:bg-amber-700 text-white">
            <Plus className="h-4 w-4 mr-1" /> Add Service
          </Button>
        </div>
      </div>

      {/* Active clinic banner */}
      {active?.centre ? (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-100 bg-amber-50/40 text-xs">
          <Building2 className="h-4 w-4 text-amber-600" />
          <span className="text-amber-900">
            Catalogue for <strong>{active.centre.name}</strong> <span className="font-mono text-amber-700">{active.centre.slug}</span>.
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-900">
          No active clinic. Pick one from the header switcher.
        </div>
      )}

      {/* Grouped list */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-amber-600" /></div>
      ) : !services || services.length === 0 ? (
        <div className="neumorphic-card p-12 text-center space-y-3">
          <Package className="h-10 w-10 text-text-tertiary mx-auto" />
          <p className="text-sm font-semibold text-text-primary">No services yet</p>
          <p className="text-xs text-text-tertiary">
            Add them one by one with <strong>Add Service</strong>, or seed this clinic with the standard MBD catalogue.
          </p>
          <Button onClick={importDefault} disabled={importing || !active?.centre} className="mt-2">
            <Download className="h-4 w-4 mr-1" /> Import MBD defaults
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([deptName, items]) => (
            <div key={deptName} className="neumorphic-card overflow-hidden">
              <div className="px-5 py-3 bg-surface-secondary border-b border-border-light flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-primary">{deptName}</h2>
                <span className="text-[10px] text-text-tertiary">{items.length} services</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-surface-secondary/60 border-b border-border-light">
                  <tr>
                    <th className="text-left text-[10px] font-bold uppercase tracking-wider text-text-tertiary py-2.5 pl-5">Service</th>
                    <th className="text-right text-[10px] font-bold uppercase tracking-wider text-text-tertiary py-2.5">Base price</th>
                    <th className="text-right text-[10px] font-bold uppercase tracking-wider text-text-tertiary py-2.5">GST</th>
                    <th className="text-right text-[10px] font-bold uppercase tracking-wider text-text-tertiary py-2.5">Inc. tax</th>
                    <th className="text-right text-[10px] font-bold uppercase tracking-wider text-text-tertiary py-2.5 pr-5">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {items.map((s) => {
                    const incTax = Math.round(s.basePrice * (1 + s.gstRate));
                    return (
                      <tr key={s.id} className={`hover:bg-surface-secondary/40 ${!s.isActive ? "opacity-50" : ""}`}>
                        <td className="py-3 pl-5">
                          <p className="text-sm font-medium text-text-primary">{s.name}</p>
                          <p className="text-[10px] text-text-tertiary">
                            {s.hsnSacCode ? `HSN ${s.hsnSacCode} · ` : ""}
                            {s.participantCount > 1 ? `${s.participantCount}-person ` : ""}
                            {!s.isActive && <Badge className="bg-slate-100 text-slate-600 text-[9px] ml-1">Inactive</Badge>}
                          </p>
                        </td>
                        <td className="py-3 text-right font-semibold">₹{s.basePrice.toLocaleString()}</td>
                        <td className="py-3 text-right text-text-secondary">{(s.gstRate * 100).toFixed(0)}%</td>
                        <td className="py-3 text-right text-text-secondary">₹{incTax.toLocaleString()}</td>
                        <td className="py-3 pr-5 text-right">
                          <div className="inline-flex gap-1">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:bg-red-50" onClick={() => remove(s)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl bg-surface">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Package className="h-5 w-5 text-amber-600" /> {editing ? "Edit Service" : "Add Service"}
          </DialogTitle>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Service Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10" placeholder="e.g. Follow Up Session (Head Physiotherapist)" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Department *</Label>
                <Select value={form.departmentId} onValueChange={(v) => v && setForm({ ...form, departmentId: v })}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Choose department">
                      {form.departmentId ? departments?.find(d => d.id === form.departmentId)?.name : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {departments?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Base Price (₹) *</Label>
                <Input type="number" step="50" value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: e.target.value })} className="h-10" placeholder="e.g. 2200" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">GST Rate</Label>
                <Select value={form.gstRate} onValueChange={(v) => v && setForm({ ...form, gstRate: v })}>
                  <SelectTrigger className="h-10">
                    <SelectValue>
                      {form.gstRate !== "" && form.gstRate != null ? `${(Number(form.gstRate) * 100).toFixed(0)}%` : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {GST_OPTIONS.map((g) => <SelectItem key={g} value={String(g)}>{(g * 100).toFixed(0)}%</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Participants</Label>
                <Select value={form.participantCount} onValueChange={(v) => v && setForm({ ...form, participantCount: v })}>
                  <SelectTrigger className="h-10">
                    <SelectValue>
                      {({ "1": "1 — Individual", "2": "2 — Duo", "3": "3 — Trio" } as Record<string, string>)[form.participantCount] ?? null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 — Individual</SelectItem>
                    <SelectItem value="2">2 — Duo</SelectItem>
                    <SelectItem value="3">3 — Trio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">HSN / SAC Code</Label>
              <Input value={form.hsnSacCode} onChange={(e) => setForm({ ...form, hsnSacCode: e.target.value })} className="h-10 font-mono" placeholder="optional" />
            </div>

            {form.basePrice && (
              <div className="text-[11px] text-text-tertiary bg-surface-secondary px-3 py-2 rounded-lg border border-border-light">
                Incl. GST:{" "}
                <strong className="text-text-primary">
                  ₹{Math.round(Number(form.basePrice) * (1 + Number(form.gstRate))).toLocaleString()}
                </strong>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-border-light">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={submitting} className="bg-amber-600 hover:bg-amber-700 text-white">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Save" : "Add"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
