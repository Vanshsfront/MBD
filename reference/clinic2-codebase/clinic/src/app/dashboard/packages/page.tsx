"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Package, CalendarDays, CheckCircle2, Zap, Loader2, Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { invalidateCache } from "@/hooks/use-api-cache";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface PackageItem {
  id: string; totalSessions: number; completedSessions: number;
  serviceMix: string; validFrom: string; validUntil: string;
  status: string; totalPrice: number; discountPercent: number;
  client: { firstName: string; lastName: string; clientCode: string };
  consultation: { consultant: { name: string }; service: { name: string } } | null;
  sessions: Array<{ id: string; sessionDate: string; status: string; therapist: { name: string }; service: { name: string } }>;
}

export default function PackagesPage() {
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState<PackageItem | null>(null);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Record<string, string | number>>({});
  const [saving, setSaving] = useState(false);

  const enterEditMode = () => {
    if (!selectedPkg) return;
    setEditData({
      status: selectedPkg.status,
      totalSessions: selectedPkg.totalSessions,
      validFrom: selectedPkg.validFrom?.split("T")[0] || "",
      validUntil: selectedPkg.validUntil?.split("T")[0] || "",
      discountPercent: selectedPkg.discountPercent || 0,
      totalPrice: selectedPkg.totalPrice || 0,
    });
    setEditMode(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedPkg) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/packages/${selectedPkg.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });
      if (!res.ok) throw new Error("Failed");
      const updated = await res.json();
      setPackages((prev) => prev.map((p) => p.id === updated.id ? { ...p, ...updated } : p));
      setSelectedPkg({ ...selectedPkg, ...updated });
      setEditMode(false);
      toast.success("Package updated successfully!");
      invalidateCache("/api/packages");
    } catch {
      toast.error("Failed to update package");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetch("/api/packages")
      .then((r) => r.json())
      .then((data) => { setPackages(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
      COMPLETED: "bg-blue-50 text-blue-700 border-blue-200",
      EXPIRED: "bg-red-50 text-red-700 border-red-200",
      CANCELLED: "bg-surface-secondary text-text-secondary border-border-light",
    };
    return map[status] || "bg-surface-secondary text-text-secondary border-border-light";
  };

  const filtered = filterStatus === "ALL" ? packages : packages.filter((p) => p.status === filterStatus);

  const parseServiceMix = (str: string) => {
    try { return JSON.parse(str) as Array<{ serviceName: string; count: number }>; } catch { return []; }
  };

  return (
    <div className="space-y-6 pb-12 w-full max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight flex items-center gap-3">
             <Package className="h-8 w-8 text-emerald-600" /> Active Packages
          </h1>
          <p className="text-text-tertiary font-medium">Monitor client treatment bundles and session utilization.</p>
        </div>
        
        {/* Quick Filters */}
        <div className="flex flex-wrap items-center gap-2 bg-surface px-2 py-2 rounded-xl border border-border-light shadow-sm w-fit">
          {["ALL", "ACTIVE", "COMPLETED", "EXPIRED", "CANCELLED"].map((s) => (
            <button key={s} 
              onClick={() => setFilterStatus(s)}
              className={`text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all ${filterStatus === s ? "bg-emerald-50 text-emerald-700 shadow-sm border border-emerald-100" : "text-text-tertiary hover:text-text-primary hover:bg-surface-secondary border border-transparent"}`}
            >
              {s === "ALL" ? "All" : s}
            </button>
          ))}
          <div className="w-px h-6 bg-border-light mx-1"></div>
          <Badge className="bg-surface-secondary text-text-secondary font-bold border-none shadow-none text-xs px-2.5">
             {filtered.length} BUNDLES
          </Badge>
        </div>
      </div>

      {loading ? (
        <div className="bg-surface rounded-xl py-16 text-center flex flex-col items-center gap-4 border border-border-light shadow-sm">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
          <p className="text-sm font-semibold tracking-wide text-emerald-700">Fetching Active Packages...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface rounded-xl py-16 text-center flex flex-col items-center gap-4 border border-border-light shadow-sm">
          <Package className="h-12 w-12 text-text-tertiary mb-2 opacity-80" />
          <p className="text-sm font-medium text-text-tertiary">No packages match the current criteria.</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((pkg) => {
            const progress = pkg.totalSessions > 0 ? (pkg.completedSessions / pkg.totalSessions) * 100 : 0;
            const isExpired = new Date(pkg.validUntil) < new Date() && pkg.status === "ACTIVE";
            return (
              <div key={pkg.id} 
                className="bg-surface rounded-xl border border-border-light shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col"
                onClick={() => { setSelectedPkg(pkg); setDetailOpen(true); }}
              >
                <div className="p-5 flex-1 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-text-primary leading-tight">{pkg.client.firstName} {pkg.client.lastName}</p>
                      <p className="text-xs font-semibold text-text-tertiary mt-0.5">{pkg.client.clientCode}</p>
                    </div>
                    <Badge className={`${statusColor(isExpired ? "EXPIRED" : pkg.status)} px-2 py-0.5 text-[10px] shadow-none uppercase tracking-wider font-bold`}>{isExpired ? "EXPIRED" : pkg.status}</Badge>
                  </div>

                  {/* Progress */}
                  <div className="bg-surface-secondary p-3.5 rounded-lg border border-border-light">
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">Utilization</span>
                      <span className="text-sm font-bold text-text-primary">{pkg.completedSessions}<span className="text-text-tertiary font-medium">/{pkg.totalSessions}</span></span>
                    </div>
                    <Progress value={progress} className="h-2 bg-border-light [&>div]:bg-emerald-500" />
                  </div>

                  {/* Service Mix */}
                  <div className="flex flex-wrap gap-1.5">
                    {parseServiceMix(pkg.serviceMix).map((s, i) => (
                      <Badge key={i} className="bg-surface-secondary text-text-secondary shadow-none border-0 text-[10px] hover:bg-surface-secondary font-medium px-2 py-0.5">
                        {s.serviceName.split(" ").slice(0, 2).join(" ")} <span className="text-emerald-600 font-bold ml-1">×{s.count}</span>
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border-light bg-surface-secondary flex items-center justify-between mt-auto rounded-b-xl">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                    <CalendarDays className="h-3.5 w-3.5 text-text-tertiary" />
                    Exp: {format(new Date(pkg.validUntil), "MMM d, yyyy")}
                  </div>
                  <span className="font-bold text-text-primary">₹{pkg.totalPrice.toLocaleString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) setEditMode(false); }}>
        <DialogContent className="sm:max-w-2xl bg-surface border-border-light shadow-xl p-0 overflow-hidden">
          {selectedPkg && (
             <>
                <div className="p-6 border-b border-border-light bg-surface-secondary flex justify-between items-start">
                   <div>
                       <div className="flex items-center gap-3 mb-1">
                          <Avatar className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-700 font-bold border border-emerald-200 flex items-center justify-center text-sm">
                             <AvatarFallback className="bg-transparent">{selectedPkg.client.firstName[0]}{selectedPkg.client.lastName[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                             <DialogTitle className="text-xl font-bold text-text-primary tracking-tight leading-none">
                                {selectedPkg.client.firstName} {selectedPkg.client.lastName}
                             </DialogTitle>
                             <span className="block text-xs font-medium text-text-tertiary mt-1">{selectedPkg.client.clientCode}</span>
                          </div>
                       </div>
                   </div>
                   <div className="flex items-center gap-3">
                     <div className="text-right">
                       <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-1">Status</p>
                       <Badge className={`${statusColor(selectedPkg.status)} px-2.5 py-0.5 text-xs tracking-wider uppercase font-bold shadow-none`}>{selectedPkg.status}</Badge>
                     </div>
                     {!editMode ? (
                       <Button variant="outline" size="sm" onClick={enterEditMode} className="border-border-light text-text-secondary hover:bg-surface-secondary h-8 gap-1.5">
                         <Pencil className="h-3.5 w-3.5" /> Edit
                       </Button>
                     ) : (
                       <div className="flex gap-2">
                         <Button variant="outline" size="sm" onClick={() => setEditMode(false)} className="border-border-light text-text-secondary hover:bg-surface-secondary h-8 gap-1.5">
                           <X className="h-3.5 w-3.5" /> Cancel
                         </Button>
                         <Button size="sm" onClick={handleSaveEdit} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white h-8 gap-1.5">
                           {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                         </Button>
                       </div>
                     )}
                   </div>
                </div>
                
                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                   {/* Edit mode fields */}
                   {editMode && (
                     <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-4">
                       <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-2">
                           <Label className="text-xs font-semibold text-blue-800 uppercase">Status</Label>
                           <Select value={String(editData.status)} onValueChange={(v) => v && setEditData({ ...editData, status: v })}>
                             <SelectTrigger className="bg-surface border-blue-200 text-text-primary h-10"><SelectValue /></SelectTrigger>
                             <SelectContent className="bg-surface border-border-light">
                               {["ACTIVE", "COMPLETED", "EXPIRED", "CANCELLED"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                             </SelectContent>
                           </Select>
                         </div>
                         <div className="space-y-2">
                           <Label className="text-xs font-semibold text-blue-800 uppercase">Total Sessions</Label>
                           <Input type="number" min="1" value={editData.totalSessions} onChange={(e) => setEditData({ ...editData, totalSessions: parseInt(e.target.value) || 0 })} className="bg-surface border-blue-200 text-text-primary h-10" />
                         </div>
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-2">
                           <Label className="text-xs font-semibold text-blue-800 uppercase">Valid From</Label>
                           <Input type="date" value={editData.validFrom} onChange={(e) => setEditData({ ...editData, validFrom: e.target.value })} className="bg-surface border-blue-200 text-text-primary h-10" />
                         </div>
                         <div className="space-y-2">
                           <Label className="text-xs font-semibold text-blue-800 uppercase">Valid Until</Label>
                           <Input type="date" value={editData.validUntil} onChange={(e) => setEditData({ ...editData, validUntil: e.target.value })} className="bg-surface border-blue-200 text-text-primary h-10" />
                         </div>
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-2">
                           <Label className="text-xs font-semibold text-blue-800 uppercase">Total Price (₹)</Label>
                           <Input type="number" min="0" value={editData.totalPrice} onChange={(e) => setEditData({ ...editData, totalPrice: parseFloat(e.target.value) || 0 })} className="bg-surface border-blue-200 text-text-primary h-10" />
                         </div>
                         <div className="space-y-2">
                           <Label className="text-xs font-semibold text-blue-800 uppercase">Discount %</Label>
                           <Input type="number" min="0" max="100" value={editData.discountPercent} onChange={(e) => setEditData({ ...editData, discountPercent: parseFloat(e.target.value) || 0 })} className="bg-surface border-blue-200 text-text-primary h-10" />
                         </div>
                       </div>
                     </div>
                   )}

                   {/* Overview Cards */}
                   <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                     <div className="bg-surface-secondary p-4 rounded-xl border border-border-light">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-1">Consumption</span> 
                        <span className="text-lg font-bold text-text-primary">{selectedPkg.completedSessions}<span className="text-text-tertiary text-sm">/{selectedPkg.totalSessions}</span></span>
                     </div>
                     <div className="bg-surface-secondary p-4 rounded-xl border border-border-light">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-1">Total Value</span> 
                        <span className="text-lg font-bold text-text-primary">₹{selectedPkg.totalPrice.toLocaleString()}</span>
                     </div>
                     <div className="bg-surface-secondary p-4 rounded-xl border border-border-light md:col-span-2">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-1">Validity Period</span> 
                        <span className="text-sm font-semibold text-text-primary mt-1 block">{format(new Date(selectedPkg.validFrom), "dd MMM yyyy")} — {format(new Date(selectedPkg.validUntil), "dd MMM yyyy")}</span>
                     </div>
                   </div>

                   {/* Service Mix */}
                   <div className="space-y-3">
                     <h4 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
                        Service Constitution
                     </h4>
                     <div className="grid gap-2">
                        {parseServiceMix(selectedPkg.serviceMix).map((s, i) => (
                           <div key={i} className="flex justify-between items-center text-sm bg-surface rounded-lg p-3 border border-border-light shadow-sm">
                             <span className="text-text-secondary font-semibold">{s.serviceName}</span>
                             <Badge className="bg-surface-secondary text-emerald-700 border border-border-light shadow-none font-bold text-xs uppercase px-2.5">×{s.count}</Badge>
                           </div>
                        ))}
                     </div>
                   </div>

                   {/* Sessions Tracker */}
                   {selectedPkg.sessions.length > 0 && (
                     <div className="space-y-3">
                       <h4 className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-text-tertiary border-b border-border-light pb-2">
                          Execution Log <Badge className="bg-surface-secondary text-text-secondary border-none shadow-none">{selectedPkg.sessions.length}</Badge>
                       </h4>
                       <div className="space-y-2">
                          {selectedPkg.sessions.map((s) => (
                            <div key={s.id} className="flex justify-between items-center bg-surface border border-border-light shadow-sm rounded-lg p-3">
                              <div className="flex items-center gap-3">
                                <div className={`h-8 w-8 rounded-full flex items-center justify-center border ${s.status === "COMPLETED" ? "bg-green-50 text-green-600 border-green-200" : "bg-blue-50 text-blue-600 border-blue-200"}`}>
                                   {s.status === "COMPLETED" ? <CheckCircle2 className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
                                </div>
                                <div>
                                   <p className="text-sm font-semibold text-text-primary line-clamp-1">{s.service.name}</p>
                                   <p className={`text-[10px] uppercase font-bold ${s.status === "COMPLETED" ? "text-green-600" : "text-blue-600"}`}>{s.status}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="text-xs font-medium text-text-secondary block">{format(new Date(s.sessionDate), "dd MMM yyyy, HH:mm")}</span>
                                <span className="text-[10px] uppercase font-bold text-text-tertiary mt-0.5 block">By {s.therapist.name}</span>
                              </div>
                            </div>
                          ))}
                       </div>
                     </div>
                   )}
                </div>
             </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
