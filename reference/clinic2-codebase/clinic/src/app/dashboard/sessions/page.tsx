"use client";

import { useState, useEffect } from "react";
import { useApiCache, invalidateCache } from "@/hooks/use-api-cache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, CalendarDays, CheckCircle2, XCircle, AlertTriangle, Clock, Activity, Edit, Search, Trash2, Users, Download } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { exportToCSV } from "@/lib/csv-export";

// Session usage popup state
interface SessionUsageInfo {
  clientName: string;
  completedSessions: number;
  totalSessions: number;
  remaining: number;
  packageStatus: string;
  validUntil?: string;
}

interface SessionItem {
  id: string; sessionDate: string; status: string;
  treatmentNotes: string | null; progressUpdates: string | null;
  allotments: string | null;
  client: { firstName: string; lastName: string; clientCode: string };
  therapist: { name: string };
  service: { name: string };
  package: { id: string; totalSessions: number; completedSessions: number } | null;
}

interface Client { id: string; clientCode: string; firstName: string; lastName: string; preferredTherapist?: { id: string; name: string } | null; }
interface Staff { id: string; name: string; designation: string | null; }
interface Service { id: string; name: string; department: { name: string }; }
interface PackageItem { id: string; totalSessions: number; completedSessions: number; status: string; client: { firstName: string; lastName: string }; }

interface Allotment { therapistId: string; therapistName: string; serviceId: string; serviceName: string; }

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [therapists, setTherapists] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [therapistSearch, setTherapistSearch] = useState("");

  // Create form
  const [clientId, setClientId] = useState("");
  const [therapistId, setTherapistId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [sessionDate, setSessionDate] = useState("");
  const [treatmentNotes, setTreatmentNotes] = useState("");
  const [sessionStatus, setSessionStatus] = useState("SCHEDULED");
  
  // Multiple allotments
  const [allotments, setAllotments] = useState<Allotment[]>([]);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editSession, setEditSession] = useState<SessionItem | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editProgress, setEditProgress] = useState("");
  const [updating, setUpdating] = useState(false);

  // Session usage popup
  const [usagePopup, setUsagePopup] = useState<SessionUsageInfo | null>(null);
  const [usagePopupOpen, setUsagePopupOpen] = useState(false);

  const { data: sessionData, loading: sessionsLoading } = useApiCache<SessionItem[]>("/api/sessions");
  const { data: clientData } = useApiCache<{ clients: Client[] }>("/api/clients");
  const { data: therapistData } = useApiCache<Staff[]>("/api/staff?role=THERAPIST");
  const { data: serviceData } = useApiCache<Service[]>("/api/services");
  const { data: packageData } = useApiCache<PackageItem[]>("/api/packages?status=ACTIVE");

  const loading = sessionsLoading;

  useEffect(() => { if (sessionData) setSessions(sessionData); }, [sessionData]);
  useEffect(() => { if (clientData) setClients(clientData.clients || []); }, [clientData]);
  useEffect(() => { if (therapistData) setTherapists(therapistData); }, [therapistData]);
  useEffect(() => { if (serviceData) setServices(serviceData); }, [serviceData]);
  useEffect(() => { if (packageData) setPackages(packageData); }, [packageData]);

  // Auto-select preferred therapist when client changes
  useEffect(() => {
    if (clientId) {
      const client = clients.find(c => c.id === clientId);
      if (client?.preferredTherapist) {
        setTherapistId(client.preferredTherapist.id);
      }
    }
  }, [clientId, clients]);

  const filteredSessions = sessions.filter((s) => {
    const matchesStatus = filterStatus === "ALL" || s.status === filterStatus;
    const matchesTherapist = !therapistSearch || s.therapist.name.toLowerCase().includes(therapistSearch.toLowerCase());
    return matchesStatus && matchesTherapist;
  });

  const handleExportCSV = () => {
    exportToCSV(
      filteredSessions,
      [
        { header: "Date", accessor: (r) => new Date(r.sessionDate).toLocaleDateString("en-IN") },
        { header: "Patient Code", accessor: (r) => r.client.clientCode },
        { header: "Patient", accessor: (r) => `${r.client.firstName} ${r.client.lastName}` },
        { header: "Therapist", accessor: (r) => r.therapist.name },
        { header: "Service", accessor: (r) => r.service.name },
        { header: "Status", accessor: (r) => r.status },
        { header: "Notes", accessor: (r) => r.treatmentNotes },
      ],
      `sessions-${new Date().toISOString().split("T")[0]}`,
    );
  };

  const addAllotment = () => {
    setAllotments([...allotments, { therapistId: "", therapistName: "", serviceId: "", serviceName: "" }]);
  };

  const updateAllotment = (i: number, field: keyof Allotment, value: string) => {
    const updated = [...allotments];
    updated[i] = { ...updated[i], [field]: value };
    
    if (field === "therapistId") {
      const t = therapists.find(t => t.id === value);
      if (t) updated[i].therapistName = t.name;
    }
    if (field === "serviceId") {
      const s = services.find(s => s.id === value);
      if (s) updated[i].serviceName = s.name;
    }
    
    setAllotments(updated);
  };

  const removeAllotment = (i: number) => {
    setAllotments(allotments.filter((_, idx) => idx !== i));
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "COMPLETED": return <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />;
      case "CANCELLED": return <XCircle className="h-3.5 w-3.5 text-rose-600" />;
      case "NO_SHOW": return <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />;
      default: return <Clock className="h-3.5 w-3.5 text-blue-600" />;
    }
  };

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      SCHEDULED: "bg-blue-50 text-blue-700 border-blue-200",
      COMPLETED: "bg-green-50 text-green-700 border-green-200",
      CANCELLED: "bg-rose-50 text-rose-700 border-rose-200",
      NO_SHOW: "bg-yellow-50 text-yellow-700 border-yellow-200",
    };
    return map[status] || "bg-surface-secondary text-text-secondary border-border-light";
  };

  const handleCreate = async () => {
    if (!clientId || !therapistId || !serviceId || !sessionDate) {
      toast.error("Client, therapist, service, and date are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId, therapistId, serviceId,
          packageId: packageId || undefined,
          sessionDate, treatmentNotes, status: sessionStatus,
          allotments: allotments.length > 0 ? allotments : undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const newSession = await res.json();
      toast.success("Session created!");
      setDialogOpen(false);
      setAllotments([]);
      invalidateCache("/api/sessions");
      invalidateCache("/api/packages");
      const refreshed = await fetch("/api/sessions").then((r) => r.json());
      setSessions(refreshed);
      
      // Show session usage popup if package is linked
      if (packageId && packageId !== "none") {
        try {
          const pkgRes = await fetch(`/api/packages/${packageId}`);
          if (pkgRes.ok) {
            const pkg = await pkgRes.json();
            const clientName = clients.find(c => c.id === clientId);
            setUsagePopup({
              clientName: clientName ? `${clientName.firstName} ${clientName.lastName}` : "Patient",
              completedSessions: pkg.completedSessions,
              totalSessions: pkg.totalSessions,
              remaining: pkg.totalSessions - pkg.completedSessions,
              packageStatus: pkg.status,
              validUntil: pkg.validUntil,
            });
            setUsagePopupOpen(true);
          }
        } catch { /* silently fail */ }
      }
    } catch { toast.error("Failed to create session"); }
    finally { setSubmitting(false); }
  };

  const handleUpdate = async () => {
    if (!editSession) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/sessions/${editSession.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: editStatus, treatmentNotes: editNotes, progressUpdates: editProgress }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Session updated!");
      setEditOpen(false);
      invalidateCache("/api/sessions");
      invalidateCache("/api/packages");
      const refreshed = await fetch("/api/sessions").then((r) => r.json());
      setSessions(refreshed);

      // Show session usage popup if status changed to COMPLETED and has package
      if (editStatus === "COMPLETED" && editSession.package) {
        try {
          const pkgRes = await fetch(`/api/packages/${editSession.package.id}`);
          if (pkgRes.ok) {
            const pkg = await pkgRes.json();
            setUsagePopup({
              clientName: `${editSession.client.firstName} ${editSession.client.lastName}`,
              completedSessions: pkg.completedSessions,
              totalSessions: pkg.totalSessions,
              remaining: pkg.totalSessions - pkg.completedSessions,
              packageStatus: pkg.status,
              validUntil: pkg.validUntil,
            });
            setUsagePopupOpen(true);
          }
        } catch { /* silently fail */ }
      }
    } catch { toast.error("Failed to update session"); }
    finally { setUpdating(false); }
  };

  return (
    <div className="space-y-6 pb-12 w-full max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary flex items-center gap-3">
             <Activity className="h-8 w-8 text-blue-600" /> Therapy Sessions
          </h1>
          <p className="text-sm text-text-tertiary">Track and manage therapeutic interventions and recovery sessions.</p>
        </div>
        
        {/* Search + Filters */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
            <Input
              placeholder="Search by therapist name..."
              value={therapistSearch}
              onChange={(e) => setTherapistSearch(e.target.value)}
              className="pl-9 bg-surface border-border-light focus:ring-blue-500 h-10"
            />
          </div>
          <button onClick={handleExportCSV} className="flex items-center justify-center gap-2 h-10 px-4 rounded-md border border-border-light bg-surface text-text-secondary hover:bg-surface-secondary transition-colors text-sm font-semibold whitespace-nowrap">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* Quick Filters */}
      <div className="flex flex-wrap items-center gap-2 bg-surface px-2 py-2 rounded-2xl border border-border-light">
        <div className="flex items-center space-x-1 px-2">
          {["ALL", "SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"].map((s) => (
            <button key={s} 
              onClick={() => setFilterStatus(s)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${filterStatus === s ? "bg-surface-secondary text-text-primary" : "text-text-tertiary hover:text-text-primary hover:bg-surface-secondary"}`}
            >
              {s === "ALL" ? "All" : s.replace("_", " ")}
            </button>
          ))}
        </div>
        <div className="w-px h-6 bg-border-light mx-1"></div>
        <Button onClick={() => { setDialogOpen(true); setAllotments([]); }} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-4 h-9 rounded-md">
          <Plus className="h-4 w-4 mr-2" /> Schedule
        </Button>
      </div>

      <div className="neumorphic-card overflow-hidden">
        <div className="p-0">
          <Table>
            <TableHeader className="bg-surface-secondary border-b border-border-light">
              <TableRow className="hover:bg-surface-secondary border-0">
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4 pl-6 w-40">Date</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4">Client</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4">Service</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4">Therapist</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4">Status</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4 text-center">Package Progress</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4 pr-6 w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border-light">
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-text-tertiary py-16"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-3" />Loading sessions...</TableCell></TableRow>
              ) : filteredSessions.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-text-tertiary py-16 font-medium">No sessions found in this category.</TableCell></TableRow>
              ) : filteredSessions.map((s) => (
                <TableRow key={s.id} className="hover:bg-surface-secondary transition-colors group">
                  <TableCell className="text-text-secondary text-sm font-medium pl-6 py-4">
                     <div className="flex flex-col">
                        <span>{format(new Date(s.sessionDate), "dd MMM yyyy")}</span>
                        <span className="text-xs text-text-tertiary">{format(new Date(s.sessionDate), "hh:mm a")}</span>
                     </div>
                  </TableCell>
                  <TableCell className="py-4">
                     <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs border border-blue-200 flex items-center justify-center">
                           <AvatarFallback className="bg-transparent">{s.client.firstName[0]}{s.client.lastName[0]}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-semibold text-text-primary">{s.client.firstName} {s.client.lastName}</span>
                     </div>
                  </TableCell>
                  <TableCell className="text-text-secondary font-medium text-sm max-w-48 truncate py-4">{s.service.name}</TableCell>
                  <TableCell className="py-4">
                    <div>
                      <span className="text-text-secondary text-sm">{s.therapist.name}</span>
                      {s.allotments && (() => {
                        try {
                          const allots = JSON.parse(s.allotments) as Allotment[];
                          if (allots.length > 0) {
                            return <span className="text-[10px] text-blue-600 font-semibold ml-1.5">+{allots.length} more</span>;
                          }
                        } catch { /* noop */ }
                        return null;
                      })()}
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge className={`${statusColor(s.status)} border px-2 py-0.5 text-xs font-semibold gap-1.5 shadow-none`}>
                      {statusIcon(s.status)} {s.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center py-4">
                    {s.package ? (
                       <div className="flex flex-col items-center">
                          <span className="text-xs font-bold text-text-secondary">{s.package.completedSessions} / {s.package.totalSessions}</span>
                          <div className="w-16 h-1.5 bg-surface-secondary rounded-full mt-1 overflow-hidden">
                             <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(s.package.completedSessions / s.package.totalSessions) * 100}%` }}></div>
                          </div>
                       </div>
                    ) : <span className="text-text-tertiary">—</span>}
                  </TableCell>
                  <TableCell className="pr-6 py-4 text-right">
                    <Button variant="ghost" size="sm" className="text-text-tertiary hover:text-blue-600 hover:bg-blue-50 h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-all focus:opacity-100"
                      onClick={() => { setEditSession(s); setEditStatus(s.status); setEditNotes(s.treatmentNotes || ""); setEditProgress(s.progressUpdates || ""); setEditOpen(true); }}>
                      <Edit className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl bg-surface border-border-light shadow-lg p-0 overflow-hidden w-full text-text-primary max-h-[90vh] flex flex-col">
           <div className="bg-surface-secondary border-b border-border-light p-6 flex flex-col gap-1 shrink-0">
             <DialogTitle className="text-text-primary text-lg font-bold flex items-center gap-2">
               <CalendarDays className="h-5 w-5 text-blue-600" /> Schedule Therapy Session
             </DialogTitle>
             <p className="text-xs text-text-tertiary">Schedule a new therapy session.</p>
          </div>

          <div className="p-6 space-y-6 overflow-y-auto flex-1">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-text-secondary">Client <span className="text-red-500">*</span></Label>
                <Select value={clientId} onValueChange={(v) => v && setClientId(v)}>
                  <SelectTrigger className="bg-surface border-border-light text-text-primary focus:ring-blue-500 h-10"><SelectValue placeholder="Select client">{clientId ? (() => { const c = clients.find(c => c.id === clientId); return c ? `${c.firstName} ${c.lastName}` : "Select client"; })() : "Select client"}</SelectValue></SelectTrigger>
                  <SelectContent className="bg-surface border-border-light max-h-48">{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName}</SelectItem>)}</SelectContent>
                </Select>
                {clientId && (() => {
                  const client = clients.find(c => c.id === clientId);
                  if (client?.preferredTherapist) {
                    return (
                      <div className="bg-blue-50 border border-blue-100 rounded-md px-3 py-2 text-xs text-blue-800">
                        <span className="font-semibold">Preferred Therapist:</span> {client.preferredTherapist.name}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-text-secondary">Primary Therapist <span className="text-red-500">*</span></Label>
                <Select value={therapistId} onValueChange={(v) => v && setTherapistId(v)}>
                  <SelectTrigger className="bg-surface border-border-light text-text-primary focus:ring-blue-500 h-10"><SelectValue placeholder="Select therapist">{therapistId ? therapists.find(t => t.id === therapistId)?.name || "Select therapist" : "Select therapist"}</SelectValue></SelectTrigger>
                  <SelectContent className="bg-surface border-border-light">{therapists.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-text-secondary">Service <span className="text-red-500">*</span></Label>
                <Select value={serviceId} onValueChange={(v) => v && setServiceId(v)}>
                  <SelectTrigger className="bg-surface border-border-light text-text-primary focus:ring-blue-500 h-10"><SelectValue placeholder="Select service">{serviceId ? services.find(s => s.id === serviceId)?.name || "Select service" : "Select service"}</SelectValue></SelectTrigger>
                  <SelectContent className="bg-surface border-border-light max-h-48">{services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-text-secondary">Link to Package (Optional)</Label>
                <Select value={packageId} onValueChange={(v) => v && setPackageId(v)}>
                  <SelectTrigger className="bg-surface border-border-light text-text-primary focus:ring-blue-500 h-10"><SelectValue placeholder="None">{packageId === "none" ? "No Package" : packageId ? (() => { const p = packages.find(p => p.id === packageId); return p ? `${p.client.firstName} ${p.client.lastName} (${p.completedSessions}/${p.totalSessions})` : "None"; })() : "None"}</SelectValue></SelectTrigger>
                  <SelectContent className="bg-surface border-border-light">
                    <SelectItem value="none">No Package</SelectItem>
                    {packages.map((p) => <SelectItem key={p.id} value={p.id}>{p.client.firstName} {p.client.lastName} (Valid: {p.completedSessions}/{p.totalSessions})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-text-secondary">Date & Time <span className="text-red-500">*</span></Label>
                <Input type="datetime-local" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} className="bg-surface border-border-light text-text-primary focus:ring-blue-500 h-10" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-text-secondary">Initial Status</Label>
                <Select value={sessionStatus} onValueChange={(v) => v && setSessionStatus(v)}>
                  <SelectTrigger className="bg-surface border-border-light text-text-primary focus:ring-blue-500 h-10"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-surface border-border-light">
                     <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                     <SelectItem value="COMPLETED">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Multiple Allotments */}
            <div className="bg-surface-secondary p-5 rounded-2xl border border-border-light">
              <div className="flex items-center justify-between mb-4 border-b border-border-light pb-3">
                <Label className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <Users className="h-4 w-4 text-text-tertiary" /> Additional Allotments
                </Label>
                <Button variant="outline" size="sm" onClick={addAllotment} className="text-xs font-semibold h-8 border-border-light bg-surface hover:bg-surface-secondary text-text-secondary">
                  <Plus className="h-3 w-3 mr-1" /> Add Therapist
                </Button>
              </div>
              <p className="text-xs text-text-tertiary mb-3">Assign additional therapists and services for this session (multi-disciplinary allotment).</p>
              
              {allotments.length === 0 ? (
                <div className="text-center py-4 text-text-tertiary text-sm">No additional allotments. Click &quot;Add Therapist&quot; to assign more.</div>
              ) : (
                <div className="space-y-3">
                  {allotments.map((allot, i) => (
                    <div key={i} className="grid grid-cols-12 gap-3 items-end bg-surface rounded-lg p-3 border border-border-light">
                      <div className="col-span-5 space-y-1.5">
                        <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Therapist</Label>
                        <Select value={allot.therapistId} onValueChange={(v) => v && updateAllotment(i, "therapistId", v)}>
                          <SelectTrigger className="bg-surface border-border-light text-text-primary text-sm h-9"><SelectValue placeholder="Select">{allot.therapistId ? therapists.find(t => t.id === allot.therapistId)?.name || "Select" : "Select"}</SelectValue></SelectTrigger>
                          <SelectContent className="bg-surface border-border-light">{therapists.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-5 space-y-1.5">
                        <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Service</Label>
                        <Select value={allot.serviceId} onValueChange={(v) => v && updateAllotment(i, "serviceId", v)}>
                          <SelectTrigger className="bg-surface border-border-light text-text-primary text-sm h-9"><SelectValue placeholder="Select">{allot.serviceId ? services.find(s => s.id === allot.serviceId)?.name || "Select" : "Select"}</SelectValue></SelectTrigger>
                          <SelectContent className="bg-surface border-border-light">{services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2 flex justify-center">
                        <Button variant="ghost" size="icon" onClick={() => removeAllotment(i)} className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 w-8">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-text-secondary">Pre-treatment Notes</Label>
              <Textarea value={treatmentNotes} onChange={(e) => setTreatmentNotes(e.target.value)} placeholder="Guidelines or initial remarks..." className="bg-surface border-border-light text-text-primary focus:ring-blue-500 resize-none min-h-[80px]" />
            </div>
            
            <div className="flex justify-end pt-4 border-t border-border-light">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="mr-3 border-border-light text-text-secondary hover:bg-surface-secondary">Cancel</Button>
              <Button onClick={handleCreate} disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-white px-6">
                {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scheduling...</> : "Confirm Booking"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg bg-surface border-border-light shadow-lg p-0 overflow-hidden w-full">
          <div className="bg-surface-secondary border-b border-border-light p-6 flex flex-col gap-1">
             <DialogTitle className="text-text-primary text-lg font-bold flex items-center gap-2">
               <Activity className="h-5 w-5 text-blue-600" /> Log Session Outcomes
             </DialogTitle>
             <p className="text-xs text-text-tertiary">Update status and record therapeutic progression.</p>
          </div>
          
          {editSession && (
            <div className="p-6 space-y-6">
              <div className="bg-surface-secondary p-4 rounded-2xl border border-border-light flex items-center justify-between">
                <div>
                   <p className="text-xs font-bold uppercase tracking-wider text-text-tertiary mb-1">Patient</p>
                   <p className="text-sm font-bold text-text-primary">{editSession.client.firstName} {editSession.client.lastName}</p>
                </div>
                <div className="text-right">
                   <p className="text-xs font-bold uppercase tracking-wider text-text-tertiary mb-1">Service</p>
                   <p className="text-sm font-semibold text-blue-700">{editSession.service.name}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-text-secondary">Session Status</Label>
                <Select value={editStatus} onValueChange={(v) => v && setEditStatus(v)}>
                  <SelectTrigger className="bg-surface border-border-light text-text-primary focus:ring-blue-500 h-10"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-surface border-border-light">
                    <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                    <SelectItem value="NO_SHOW">No Show</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-text-secondary">Clinical Treatment Notes</Label>
                <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Detail modalities used, patient response, etc." className="bg-surface border-border-light text-text-primary focus:ring-blue-500 resize-none min-h-[100px]" />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-text-secondary">Progress Update & Next Steps</Label>
                <Textarea value={editProgress} onChange={(e) => setEditProgress(e.target.value)} placeholder="Patient milestone tracking..." className="bg-surface border-border-light text-text-primary focus:ring-blue-500 resize-none min-h-[80px]" />
              </div>

              <div className="flex justify-end pt-4 border-t border-border-light">
                <Button variant="outline" onClick={() => setEditOpen(false)} className="mr-3 border-border-light text-text-secondary hover:bg-surface-secondary">Cancel</Button>
                <Button onClick={handleUpdate} disabled={updating} className="bg-green-600 hover:bg-green-700 text-white px-6">
                  {updating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Session Usage Popup */}
      <Dialog open={usagePopupOpen} onOpenChange={setUsagePopupOpen}>
        <DialogContent className="sm:max-w-md bg-surface border-border-light shadow-lg p-0 overflow-hidden">
          {usagePopup && (() => {
            const pct = Math.round((usagePopup.completedSessions / usagePopup.totalSessions) * 100);
            const isOver = usagePopup.remaining <= 0;
            const isLow = usagePopup.remaining <= 2 && usagePopup.remaining > 0;
            const isWarning = usagePopup.remaining <= Math.ceil(usagePopup.totalSessions * 0.25) && !isLow && !isOver;
            const color = isOver ? "red" : isLow ? "red" : isWarning ? "amber" : "green";

            return (
              <div className="text-center">
                <div className={`p-6 ${color === 'red' ? 'bg-red-50' : color === 'amber' ? 'bg-amber-50' : 'bg-green-50'}`}>
                  <DialogTitle className={`text-lg font-bold ${color === 'red' ? 'text-red-800' : color === 'amber' ? 'text-amber-800' : 'text-green-800'}`}>
                    Session Usage Update
                  </DialogTitle>
                  <p className="text-sm text-text-secondary mt-1">{usagePopup.clientName}</p>
                </div>
                <div className="p-8">
                  <div className={`text-6xl font-black mb-2 ${color === 'red' ? 'text-red-600' : color === 'amber' ? 'text-amber-600' : 'text-green-600'}`}>
                    {usagePopup.completedSessions} / {usagePopup.totalSessions}
                  </div>
                  <p className="text-sm text-text-tertiary mb-4">sessions used</p>
                  
                  {/* Progress bar */}
                  <div className="w-full h-3 bg-surface-secondary rounded-full overflow-hidden mx-auto max-w-xs">
                    <div 
                      className={`h-full rounded-full transition-all ${color === 'red' ? 'bg-red-500' : color === 'amber' ? 'bg-amber-500' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>

                  <div className={`mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${
                    color === 'red' ? 'bg-red-100 text-red-700' : 
                    color === 'amber' ? 'bg-amber-100 text-amber-700' : 
                    'bg-green-100 text-green-700'
                  }`}>
                    {isOver ? (
                      <><AlertTriangle className="h-4 w-4" /> Package exhausted — renew required</>
                    ) : isLow ? (
                      <><AlertTriangle className="h-4 w-4" /> Only {usagePopup.remaining} session{usagePopup.remaining !== 1 ? 's' : ''} left!</>
                    ) : isWarning ? (
                      <><Clock className="h-4 w-4" /> {usagePopup.remaining} sessions remaining</>
                    ) : (
                      <><CheckCircle2 className="h-4 w-4" /> {usagePopup.remaining} sessions remaining</>
                    )}
                  </div>

                  {usagePopup.validUntil && (
                    <p className="text-xs text-text-tertiary mt-3">
                      Package valid until {format(new Date(usagePopup.validUntil), "dd MMM yyyy")}
                    </p>
                  )}
                </div>
                <div className="border-t border-border-light p-4">
                  <Button onClick={() => setUsagePopupOpen(false)} className="bg-text-primary hover:bg-text-secondary text-white px-8">
                    OK, Got It
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
