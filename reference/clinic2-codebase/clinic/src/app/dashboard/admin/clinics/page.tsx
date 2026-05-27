"use client";

import { useState } from "react";
import { useApiCache, invalidateCache } from "@/hooks/use-api-cache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Loader2, Edit2, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Centre {
  id: string;
  name: string;
  slug: string;
  location: string;
  isActive: boolean;
  _count?: { staff: number; clients: number };
}

export default function ClinicsPage() {
  const { data: centres, loading, refetch } = useApiCache<Centre[]>("/api/centres");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Centre | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", location: "", isActive: true });
  const [submitting, setSubmitting] = useState(false);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", slug: "", location: "", isActive: true });
    setDialogOpen(true);
  };

  const openEdit = (c: Centre) => {
    setEditing(c);
    setForm({ name: c.name, slug: c.slug, location: c.location, isActive: c.isActive });
    setDialogOpen(true);
  };

  const remove = async (c: Centre) => {
    const counts = c._count;
    const hasData = counts && (counts.staff > 0 || counts.clients > 0);
    const msg = hasData
      ? `"${c.name}" has ${counts.staff} staff and ${counts.clients} patients. It will be deactivated (hidden) but kept for history. Continue?`
      : `Delete "${c.name}" permanently?`;
    if (!confirm(msg)) return;
    try {
      const res = await fetch(`/api/centres/${c.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(data.softDelete ? "Clinic deactivated" : "Clinic deleted");
      invalidateCache("/api/centres");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Name required");
    if (!editing && !form.slug.trim()) return toast.error("Slug required (e.g. MBDCOLABA)");
    setSubmitting(true);
    try {
      const url = editing ? `/api/centres/${editing.id}` : "/api/centres";
      const method = editing ? "PUT" : "POST";
      const payload = editing
        ? { name: form.name, location: form.location, isActive: form.isActive }
        : { ...form, slug: form.slug.toUpperCase().replace(/[^A-Z0-9]/g, "") };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast.success(editing ? "Updated" : "Clinic created. Now configure staff for it.");
      setDialogOpen(false);
      invalidateCache("/api/centres");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const activeCentres = centres?.filter(c => c.isActive) || [];

  return (
    <div className="space-y-6 pb-12 w-full max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary flex items-center gap-3">
            <Building2 className="h-7 w-7 text-blue-600" /> Clinics
          </h1>
          <p className="text-sm text-text-tertiary">
            Each clinic has its own slug which prefixes patient IDs and invoice numbers (e.g. MBDCOLABA-0001, MBDCOLABA/001/2026).
            Services and departments are shared across clinics; only staff are configured per clinic.
          </p>
        </div>
        <Button onClick={openNew} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4 mr-1" /> New Clinic
        </Button>
      </div>

      <div className="neumorphic-card overflow-hidden">
        <Table>
          <TableHeader className="bg-surface-secondary border-b border-border-light">
            <TableRow className="hover:bg-surface-secondary border-0">
              <TableHead className="text-text-tertiary text-xs uppercase tracking-wider py-4 pl-6">Name</TableHead>
              <TableHead className="text-text-tertiary text-xs uppercase tracking-wider py-4">Slug</TableHead>
              <TableHead className="text-text-tertiary text-xs uppercase tracking-wider py-4">Location</TableHead>
              <TableHead className="text-text-tertiary text-xs uppercase tracking-wider py-4">Staff</TableHead>
              <TableHead className="text-text-tertiary text-xs uppercase tracking-wider py-4">Patients</TableHead>
              <TableHead className="text-text-tertiary text-xs uppercase tracking-wider py-4">Status</TableHead>
              <TableHead className="text-text-tertiary text-xs uppercase tracking-wider py-4 pr-6 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border-light">
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600" /></TableCell></TableRow>
            ) : activeCentres.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-text-tertiary">No clinics yet</TableCell></TableRow>
            ) : activeCentres.map(c => (
              <TableRow key={c.id}>
                <TableCell className="pl-6 py-4 font-semibold text-sm">{c.name}</TableCell>
                <TableCell className="py-4 font-mono text-xs text-blue-700">{c.slug}</TableCell>
                <TableCell className="py-4 text-sm">{c.location}</TableCell>
                <TableCell className="py-4 text-sm">{c._count?.staff ?? 0}</TableCell>
                <TableCell className="py-4 text-sm">{c._count?.clients ?? 0}</TableCell>
                <TableCell className="py-4">
                  <Badge className={c.isActive ? "bg-green-50 text-green-700 border border-green-200 text-[10px]" : "bg-gray-50 text-gray-700 border border-gray-200 text-[10px]"}>
                    {c.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="pr-6 py-4 text-right">
                  <div className="inline-flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(c)} className="h-8 w-8 p-0"><Edit2 className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(c)} className="h-8 w-8 p-0 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="text-xs text-text-tertiary bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="font-bold mb-1">ℹ️ How the multi-clinic scaffold works right now</p>
        <p>You can create new clinics with unique slugs; patient IDs and invoice numbers for each new clinic will use that slug (e.g. MBDCOLABA-0001). Services and departments are shared across all clinics. Staff are configured per clinic from the Staff admin page (coming: centre dropdown there). Full data isolation (users only see their clinic&apos;s data) is planned for a later phase.</p>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md bg-surface border-border-light">
          <DialogTitle className="text-base font-bold">{editing ? "Edit Clinic" : "New Clinic"}</DialogTitle>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Name *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Movement By Design - Colaba" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Slug {editing ? "(cannot be changed)" : "*"}</Label>
              <Input
                value={form.slug}
                onChange={e => setForm({ ...form, slug: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
                placeholder="e.g. MBDCOLABA"
                className="h-10 font-mono"
                disabled={!!editing}
              />
              <p className="text-[10px] text-text-tertiary">Uppercase alphanumeric only. Used as a prefix in patient IDs (SLUG-0001) and invoice numbers (SLUG/001/2026).</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Location</Label>
              <Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Colaba, Mumbai" className="h-10" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="clinicActive" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} />
              <Label htmlFor="clinicActive" className="text-sm cursor-pointer">Active</Label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-border-light">
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
