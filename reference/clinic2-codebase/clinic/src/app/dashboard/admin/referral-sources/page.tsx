"use client";

import { useState } from "react";
import { useApiCache, invalidateCache } from "@/hooks/use-api-cache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, MapPin, Edit2, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Source {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export default function ReferralSourcesPage() {
  const { data: sources, loading, refetch } = useApiCache<Source[]>("/api/referral-sources");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Source | null>(null);
  const [form, setForm] = useState({ name: "", isActive: true, sortOrder: 0 });
  const [submitting, setSubmitting] = useState(false);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", isActive: true, sortOrder: (sources?.length ?? 0) + 1 });
    setDialogOpen(true);
  };

  const openEdit = (s: Source) => {
    setEditing(s);
    setForm({ name: s.name, isActive: s.isActive, sortOrder: s.sortOrder });
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Name required");
      return;
    }
    setSubmitting(true);
    try {
      const url = editing ? `/api/referral-sources/${editing.id}` : "/api/referral-sources";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast.success(editing ? "Updated" : "Created");
      setDialogOpen(false);
      invalidateCache("/api/referral-sources");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const del = async (s: Source) => {
    if (!confirm(`Delete "${s.name}"?`)) return;
    try {
      const res = await fetch(`/api/referral-sources/${s.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Deleted");
      invalidateCache("/api/referral-sources");
      refetch();
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <div className="space-y-6 pb-12 w-full max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary flex items-center gap-3">
            <MapPin className="h-7 w-7 text-blue-600" /> Referral Sources
          </h1>
          <p className="text-sm text-text-tertiary">Options available in the &ldquo;Referred By&rdquo; dropdown on patient forms.</p>
        </div>
        <Button onClick={openNew} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4 mr-1" /> New Source
        </Button>
      </div>

      <div className="neumorphic-card overflow-hidden">
        <Table>
          <TableHeader className="bg-surface-secondary border-b border-border-light">
            <TableRow className="hover:bg-surface-secondary border-0">
              <TableHead className="text-text-tertiary text-xs uppercase tracking-wider py-4 pl-6">Name</TableHead>
              <TableHead className="text-text-tertiary text-xs uppercase tracking-wider py-4">Sort Order</TableHead>
              <TableHead className="text-text-tertiary text-xs uppercase tracking-wider py-4">Status</TableHead>
              <TableHead className="text-text-tertiary text-xs uppercase tracking-wider py-4 pr-6 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border-light">
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600" /></TableCell></TableRow>
            ) : !sources || sources.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-12 text-text-tertiary text-sm">No sources configured</TableCell></TableRow>
            ) : sources.map(s => (
              <TableRow key={s.id}>
                <TableCell className="pl-6 py-4 font-semibold text-sm text-text-primary">{s.name}</TableCell>
                <TableCell className="py-4 text-sm">{s.sortOrder}</TableCell>
                <TableCell className="py-4">
                  <Badge className={s.isActive ? "bg-green-50 text-green-700 border border-green-200 text-[10px]" : "bg-gray-50 text-gray-700 border border-gray-200 text-[10px]"}>
                    {s.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="pr-6 py-4 text-right">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(s)} className="h-8 w-8 p-0"><Edit2 className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => del(s)} className="h-8 w-8 p-0 text-red-600"><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md bg-surface border-border-light">
          <DialogTitle className="text-base font-bold">{editing ? "Edit Source" : "New Source"}</DialogTitle>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Name *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Google Ads" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Sort Order</Label>
              <Input type="number" value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })} className="h-10" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="active" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} />
              <Label htmlFor="active" className="text-sm cursor-pointer">Active</Label>
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
