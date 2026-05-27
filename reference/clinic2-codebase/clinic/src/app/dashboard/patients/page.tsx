"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useApiCache, invalidateCache } from "@/hooks/use-api-cache";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Users, Package, CalendarDays, FileText, Phone, Mail, MapPin, MoreVertical, Filter, RefreshCw, Activity, CheckCircle, Clock, Flag, Heart, Share2, Copy, CheckCheck, ExternalLink, Loader2, Pencil, Save, X, Download } from "lucide-react";
import { exportToCSV } from "@/lib/csv-export";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
interface ClientFlag {
  id: string;
  type: string;
  label: string;
  color: string;
  isActive: boolean;
}

interface ClientListItem {
  id: string;
  clientCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  sex: string | null;
  age: number | null;
  createdAt: string;
  address: string | null;
  flags: ClientFlag[];
  preferredTherapist: { id: string; name: string } | null;
  _count: { packages: number; sessions: number; invoices: number; consultations: number };
}

interface ClientDetail {
  id: string;
  clientCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  dob: string | null;
  age: number | null;
  sex: string | null;
  address: string | null;
  emergencyContact: string | null;
  referredBy: string | null;
  createdAt: string;
  consultations: Array<{ id: string; date: string; consultant: { name: string }; service: { name: string } }>;
  packages: Array<{ id: string; totalSessions: number; completedSessions: number; status: string; validUntil: string }>;
  sessions: Array<{ id: string; sessionDate: string; status: string; therapist: { name: string }; service: { name: string } }>;
  invoices: Array<{ id: string; invoiceNumber: string; totalAmount: number; status: string; createdAt: string }>;
}

export default function ClientsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string; id?: string })?.role ?? "THERAPIST";
  const userId = (session?.user as { id?: string })?.id ?? "";
  const isDoctorRole = ["THERAPIST", "CONSULTANT"].includes(userRole);

  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<ClientDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterFlagType, setFilterFlagType] = useState("");
  const [filterTherapistId, setFilterTherapistId] = useState("");
  const [filterHasPackage, setFilterHasPackage] = useState("");

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Record<string, string | number | null>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const handleExportCSV = () => {
    exportToCSV(
      clients,
      [
        { header: "Patient Code", accessor: (r) => r.clientCode },
        { header: "First Name", accessor: (r) => r.firstName },
        { header: "Last Name", accessor: (r) => r.lastName },
        { header: "Phone", accessor: (r) => r.phone },
        { header: "Email", accessor: (r) => r.email },
        { header: "Sex", accessor: (r) => r.sex },
        { header: "Age", accessor: (r) => r.age },
        { header: "Therapist", accessor: (r) => r.preferredTherapist?.name || "" },
        { header: "Sessions", accessor: (r) => r._count.sessions },
        { header: "Packages", accessor: (r) => r._count.packages },
        { header: "Registered", accessor: (r) => new Date(r.createdAt).toLocaleDateString("en-IN") },
      ],
      `patients-${new Date().toISOString().split("T")[0]}`,
    );
  };

  const enterEditMode = () => {
    if (!selectedClient) return;
    setEditData({
      firstName: selectedClient.firstName,
      lastName: selectedClient.lastName,
      phone: selectedClient.phone,
      email: selectedClient.email || "",
      age: selectedClient.age || "",
      sex: selectedClient.sex || "",
      referredBy: selectedClient.referredBy || "",
    });
    setEditMode(true);
  };

  const handleSaveClient = async () => {
    if (!selectedClient) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/clients/${selectedClient.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });
      if (!res.ok) throw new Error("Failed");
      const updated = await res.json();
      setSelectedClient({ ...selectedClient, ...updated });
      setClients((prev) => prev.map((c) => c.id === selectedClient.id ? { ...c, ...updated } : c));
      setEditMode(false);
      toast.success("Client updated successfully!");
      invalidateCache("/api/clients");
    } catch {
      toast.error("Failed to update client");
    } finally {
      setSavingEdit(false);
    }
  };

  // Fetch therapists for filter dropdown
  const { data: therapistData } = useApiCache<Array<{ id: string; name: string }>>("/api/staff?role=THERAPIST");
  const therapistOptions = therapistData || [];

  // Use cached fetch for initial load (no search query and no filters)
  const hasFilters = filterFlagType || filterTherapistId || filterHasPackage;
  const cacheUrl = isDoctorRole && userId ? `/api/clients?assignedDoctorId=${userId}` : "/api/clients";
  const { data: cachedData } = useApiCache<{ clients: ClientListItem[]; total: number }>(cacheUrl);

  // When cached data arrives, populate state
  useEffect(() => {
    if (cachedData && !search && !hasFilters) {
      setClients(cachedData.clients || []);
      setTotal(cachedData.total || 0);
      setLoading(false);
    }
  }, [cachedData, search, hasFilters]);

  const fetchClients = useCallback(async (q = "") => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (filterFlagType) params.set("flagType", filterFlagType);
      if (filterTherapistId) params.set("therapistId", filterTherapistId);
      if (filterHasPackage) params.set("hasActivePackage", filterHasPackage);
      // Doctor/Therapist roles only see their assigned patients
      if (isDoctorRole && userId) params.set("assignedDoctorId", userId);
      const res = await fetch(`/api/clients?${params.toString()}`);
      const data = await res.json();
      setClients(data.clients || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filterFlagType, filterTherapistId, filterHasPackage, isDoctorRole, userId]);

  // Refetch when filters change
  useEffect(() => {
    if (hasFilters) {
      fetchClients(search);
    }
  }, [filterFlagType, filterTherapistId, filterHasPackage, hasFilters, fetchClients, search]);

  useEffect(() => {
    if (!search && !hasFilters) return; // initial load is handled by cache
    const timeout = setTimeout(() => fetchClients(search), 300);
    return () => clearTimeout(timeout);
  }, [search, fetchClients]);

  const viewClient = async (id: string) => {
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const res = await fetch(`/api/clients/${id}`);
      const data = await res.json();
      setSelectedClient(data);
    } catch (e) {
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  };

  const parseJson = (str: string | null) => {
    if (!str) return null;
    try { return JSON.parse(str); } catch { return null; }
  };

  const handleShareDashboard = async (clientId: string) => {
    setSharing(true);
    setShareUrl(null);
    try {
      const res = await fetch("/api/dashboard-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          expiresInDays: 30,
          visibleSections: ["overview", "packages", "sessions", "invoices"],
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const share = await res.json();
      const url = `${window.location.origin}/portal/${share.token}`;
      setShareUrl(url);
      toast.success("Dashboard link generated!");
    } catch {
      toast.error("Failed to generate share link");
    } finally {
      setSharing(false);
    }
  };

  const copyShareUrl = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      ACTIVE: "bg-green-100 text-green-700 border-green-200",
      COMPLETED: "bg-blue-100 text-blue-700 border-blue-200",
      EXPIRED: "bg-red-100 text-red-700 border-red-200",
      CANCELLED: "bg-surface-secondary text-text-secondary border-border-light",
      SCHEDULED: "bg-amber-100 text-amber-700 border-amber-200",
      PAID: "bg-green-100 text-green-700 border-green-200",
    };
    return map[status] || "bg-surface-secondary text-text-secondary border-border-light";
  };

  return (
    <div className="space-y-6 pb-12 w-full max-w-7xl mx-auto">
      {/* Dashboard Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Patient Directory</h1>
          <p className="text-sm text-text-tertiary">Comprehensive patient management and clinical records</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button onClick={handleExportCSV} className="flex items-center justify-center gap-2 h-10 px-4 rounded-md border border-border-light bg-surface text-text-secondary hover:bg-surface-secondary transition-colors text-sm font-semibold">
            <Download className="w-4 h-4" />
            Export
          </button>
          <button onClick={() => setFiltersOpen(!filtersOpen)} className={`flex items-center justify-center gap-2 h-10 px-4 rounded-md border text-sm font-semibold shadow-sm transition-colors ${filtersOpen || hasFilters ? "border-blue-300 bg-blue-50 text-blue-700" : "border-border-light bg-surface text-text-secondary hover:bg-surface-secondary"}`}>
            <Filter className="w-4 h-4" />
            Filters {hasFilters && <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">!</span>}
          </button>
          <button onClick={() => fetchClients(search)} className="flex items-center justify-center gap-2 h-10 px-4 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm font-semibold">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      {filtersOpen && (
        <div className="neumorphic-card p-4 flex flex-wrap items-end gap-4">
          <div className="space-y-1.5 min-w-[160px]">
            <label className="text-xs font-semibold text-text-secondary">Flag Type</label>
            <Select value={filterFlagType} onValueChange={(v) => setFilterFlagType(v === "ALL" ? "" : v || "")}>
              <SelectTrigger className="bg-surface border-border-light h-9 text-sm"><SelectValue placeholder="All Flags" /></SelectTrigger>
              <SelectContent className="bg-surface border-border-light">
                <SelectItem value="ALL">All Flags</SelectItem>
                <SelectItem value="VIP">VIP</SelectItem>
                <SelectItem value="CAUTION">Caution</SelectItem>
                <SelectItem value="OVERDUE">Overdue</SelectItem>
                <SelectItem value="FOLLOWUP">Follow-up</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 min-w-[180px]">
            <label className="text-xs font-semibold text-text-secondary">Therapist</label>
            <Select value={filterTherapistId} onValueChange={(v) => setFilterTherapistId(v === "ALL" ? "" : v || "")}>
              <SelectTrigger className="bg-surface border-border-light h-9 text-sm"><SelectValue placeholder="All Therapists">{filterTherapistId ? therapistOptions.find(t => t.id === filterTherapistId)?.name || "All Therapists" : "All Therapists"}</SelectValue></SelectTrigger>
              <SelectContent className="bg-surface border-border-light">
                <SelectItem value="ALL">All Therapists</SelectItem>
                {therapistOptions.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 min-w-[160px]">
            <label className="text-xs font-semibold text-text-secondary">Active Package</label>
            <Select value={filterHasPackage} onValueChange={(v) => setFilterHasPackage(v === "ALL" ? "" : v || "")}>
              <SelectTrigger className="bg-surface border-border-light h-9 text-sm"><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent className="bg-surface border-border-light">
                <SelectItem value="ALL">Any</SelectItem>
                <SelectItem value="true">Has Active Package</SelectItem>
                <SelectItem value="false">No Active Package</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {hasFilters && (
            <button
              onClick={() => { setFilterFlagType(""); setFilterTherapistId(""); setFilterHasPackage(""); }}
              className="text-xs font-semibold text-red-600 hover:text-red-700 px-3 py-2"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Main Content Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full">
        {/* Left Column: Patient List */}
        <div className="lg:col-span-8 flex flex-col w-full min-w-0">
          <div className="neumorphic-card overflow-hidden flex flex-col h-full w-full">
            <div className="p-4 border-b border-border-light flex flex-col sm:flex-row gap-4 items-center justify-between bg-surface-secondary">
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, ID, phone..."
                  className="w-full bg-surface border border-border-light text-text-primary rounded-md py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors placeholder:text-text-tertiary"
                />
              </div>
              <div className="shrink-0">
                 <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 px-3 py-1 text-xs font-semibold">
                   {total} Total Patients
                 </Badge>
              </div>
            </div>

            <div className="flex-1 w-full min-w-0">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-24 text-text-tertiary">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mb-3" />
                  <p className="text-sm font-medium">Loading patient directory...</p>
                </div>
              ) : clients.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center px-4">
                  <div className="bg-surface-secondary p-3 rounded-full mb-3">
                     <Search className="w-6 h-6 text-text-tertiary" />
                  </div>
                  <h3 className="text-text-primary font-semibold mb-1">No patients found</h3>
                  <p className="text-sm text-text-tertiary">Adjust your search parameters and try again.</p>
                </div>
              ) : (
                <div className="divide-y divide-border-light w-full min-w-0">
                  {clients.map((client) => {
                    return (
                      <div 
                        key={client.id} 
                        onClick={() => router.push(`/dashboard/patients/${client.id}`)}
                        className="p-4 hover:bg-surface-secondary transition-colors cursor-pointer flex items-center justify-between group gap-4 relative w-full"
                      >
                        {/* Interactive invisible left border */}
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-transparent group-hover:bg-blue-500 transition-colors"></div>
                        
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                           <Avatar className="h-10 w-10 shrink-0 bg-surface-secondary text-text-secondary rounded-full font-semibold border-none flex items-center justify-center text-sm">
                             {client.firstName[0]}{client.lastName[0]}
                           </Avatar>
                           <div className="min-w-0 truncate">
                             <div className="flex items-center gap-2 mb-0.5 truncate">
                               <h3 className="text-sm font-semibold text-text-primary truncate">
                                 {client.firstName} {client.lastName}
                               </h3>
                               <span className="text-[10px] font-bold text-text-tertiary bg-surface-secondary px-1.5 py-0.5 rounded border border-border-light shrink-0">
                                 {client.clientCode}
                               </span>
                               {client.age && <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 shrink-0">{client.age}y</span>}
                               {client.flags?.filter(f => f.isActive).map(flag => (
                                 <span key={flag.id} className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
                                   flag.color === 'red' ? 'bg-red-50 text-red-700 border border-red-200' :
                                   flag.color === 'green' ? 'bg-green-50 text-green-700 border border-green-200' :
                                   flag.color === 'blue' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                   flag.color === 'purple' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                                   'bg-yellow-50 text-yellow-700 border border-yellow-200'
                                 }`}>{flag.label}</span>
                               ))}
                             </div>
                             <p className="text-xs text-text-tertiary truncate flex items-center gap-2">
                                <span className="flex items-center"><Phone className="w-3 h-3 mr-1 inline" /> {client.phone}</span>
                                <span className="hidden sm:inline-flex text-text-tertiary">•</span>
                                <span className="hidden sm:inline-flex items-center truncate"><Mail className="w-3 h-3 mr-1 inline" /> {client.email || 'No email provided'}</span>
                                {client.preferredTherapist && <><span className="hidden md:inline-flex text-text-tertiary">•</span><span className="hidden md:inline-flex items-center text-blue-600"><Heart className="w-3 h-3 mr-1" />{client.preferredTherapist.name}</span></>}
                             </p>
                           </div>
                        </div>

                        <div className="flex items-center gap-6 shrink-0 text-right">
                           <div className="hidden md:block">
                              <p className="text-[10px] uppercase font-bold text-text-tertiary tracking-wider mb-0.5">Sessions</p>
                              <p className="text-sm font-semibold text-text-secondary">{client._count.sessions}</p>
                           </div>
                           <div className="hidden sm:block">
                              <p className="text-[10px] uppercase font-bold text-text-tertiary tracking-wider mb-0.5">Packages</p>
                              <p className="text-sm font-semibold text-text-secondary">{client._count.packages}</p>
                           </div>
                           <button 
                             onClick={(e) => { e.stopPropagation(); viewClient(client.id); }}
                             className="p-1.5 rounded-md text-text-tertiary hover:text-text-secondary hover:bg-surface-secondary transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                           >
                             <MoreVertical className="w-4 h-4" />
                           </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Summary Stats */}
        <div className="lg:col-span-4 space-y-6">
          <div className="neumorphic-card p-5">
            <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2 border-b border-border-light pb-3">
               <Activity className="w-4 h-4 text-blue-500" />
               Quick Stats
            </h3>
            <div className="space-y-4">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                     <div className="bg-blue-50 text-blue-600 p-2 rounded-md"><Users className="w-4 h-4" /></div>
                     <span className="text-sm font-medium text-text-secondary">Total Patients</span>
                  </div>
                  <span className="text-lg font-bold text-text-primary">{total}</span>
               </div>
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                     <div className="bg-emerald-50 text-emerald-600 p-2 rounded-md"><CheckCircle className="w-4 h-4" /></div>
                     <span className="text-sm font-medium text-text-secondary">With Active Packages</span>
                  </div>
                  <span className="text-lg font-bold text-text-primary">{clients.filter(c => c._count.packages > 0).length}</span>
               </div>
            </div>
          </div>

          <div className="neumorphic-card p-4">
            <h3 className="text-sm font-bold text-text-primary mb-3 border-b border-border-light pb-3">Recently Added</h3>
            <div className="space-y-3 text-sm mt-3">
                {clients.slice(0, 4).map((c) => (
                  <div key={c.id} className="flex items-center gap-3 cursor-pointer hover:bg-surface-secondary rounded-lg p-2 -mx-2 transition-colors" onClick={() => router.push(`/dashboard/patients/${c.id}`)}>
                     <Avatar className="h-7 w-7 shrink-0 bg-surface-secondary text-text-secondary rounded-full font-semibold border-none flex items-center justify-center text-xs">
                       {c.firstName[0]}{c.lastName[0]}
                     </Avatar>
                     <div className="min-w-0">
                        <p className="text-text-primary font-medium leading-none truncate">{c.firstName} {c.lastName}</p>
                        <p className="text-xs text-text-tertiary mt-0.5">{c.clientCode}</p>
                     </div>
                  </div>
                ))}
                {clients.length === 0 && <p className="text-text-tertiary text-sm">No patients yet.</p>}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) setEditMode(false); }}>
        <DialogContent className="sm:max-w-2xl bg-surface border-border-light shadow-lg p-0 overflow-hidden text-text-primary">
          {detailLoading ? (
            <div className="py-24 flex flex-col items-center gap-3 text-blue-600">
               <RefreshCw className="w-8 h-8 animate-spin" />
               <p className="text-sm font-bold uppercase tracking-widest text-text-tertiary">Retrieving records...</p>
            </div>
          ) : selectedClient && (
            <div className="max-h-[85vh] overflow-y-auto">
              <div className="bg-surface-secondary border-b border-border-light px-6 py-6 pb-6">
                 <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                    <Avatar className="h-16 w-16 bg-blue-100 text-blue-700 text-2xl font-bold flex items-center justify-center rounded-xl border border-blue-200 shrink-0">
                        {selectedClient.firstName[0]}{selectedClient.lastName[0]}
                    </Avatar>
                    <div className="min-w-0">
                        <DialogTitle className="text-2xl font-bold text-text-primary tracking-tight truncate">
                           {selectedClient.firstName} {selectedClient.lastName}
                        </DialogTitle>
                        <div className="flex items-center gap-3 mt-1.5">
                           <Badge variant="outline" className="bg-surface px-2 py-0 border-border-light text-text-secondary text-xs font-semibold">Code: {selectedClient.clientCode}</Badge>
                           <span className="text-xs text-text-tertiary flex items-center gap-1"><CalendarDays className="w-3 h-3"/> Since {format(new Date(selectedClient.createdAt), "dd MMM yyyy")}</span>
                        </div>
                    </div>
                    </div>
                    <div className="shrink-0">
                      {!editMode ? (
                        <Button variant="outline" size="sm" onClick={enterEditMode} className="border-border-light text-text-secondary hover:bg-surface-secondary h-8 gap-1.5">
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                      ) : (
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => setEditMode(false)} className="border-border-light text-text-secondary hover:bg-surface-secondary h-8 gap-1.5">
                            <X className="h-3.5 w-3.5" /> Cancel
                          </Button>
                          <Button size="sm" onClick={handleSaveClient} disabled={savingEdit} className="bg-blue-600 hover:bg-blue-700 text-white h-8 gap-1.5">
                            {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                          </Button>
                        </div>
                      )}
                    </div>
                 </div>
              </div>
              
              <div className="p-6 space-y-8">
                {/* Edit mode form */}
                {editMode && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-blue-800 uppercase">First Name</Label>
                        <Input value={String(editData.firstName || "")} onChange={(e) => setEditData({ ...editData, firstName: e.target.value })} className="bg-surface border-blue-200 text-text-primary h-10" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-blue-800 uppercase">Last Name</Label>
                        <Input value={String(editData.lastName || "")} onChange={(e) => setEditData({ ...editData, lastName: e.target.value })} className="bg-surface border-blue-200 text-text-primary h-10" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-blue-800 uppercase">Phone</Label>
                        <Input value={String(editData.phone || "")} onChange={(e) => setEditData({ ...editData, phone: e.target.value })} className="bg-surface border-blue-200 text-text-primary h-10" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-blue-800 uppercase">Email</Label>
                        <Input value={String(editData.email || "")} onChange={(e) => setEditData({ ...editData, email: e.target.value })} className="bg-surface border-blue-200 text-text-primary h-10" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-blue-800 uppercase">Age</Label>
                        <Input type="number" value={String(editData.age || "")} onChange={(e) => setEditData({ ...editData, age: e.target.value })} className="bg-surface border-blue-200 text-text-primary h-10" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-blue-800 uppercase">Sex</Label>
                        <Select value={String(editData.sex || "")} onValueChange={(v) => setEditData({ ...editData, sex: v })}>
                          <SelectTrigger className="bg-surface border-blue-200 text-text-primary h-10"><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent className="bg-surface border-border-light">
                            <SelectItem value="Male">Male</SelectItem>
                            <SelectItem value="Female">Female</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-blue-800 uppercase">Referred By</Label>
                        <Input value={String(editData.referredBy || "")} onChange={(e) => setEditData({ ...editData, referredBy: e.target.value })} className="bg-surface border-blue-200 text-text-primary h-10" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Contact Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-surface-secondary rounded-xl border border-border-light p-4">
                  <div className="space-y-1">
                     <p className="text-[10px] text-text-tertiary font-bold uppercase tracking-widest">Phone</p>
                     <p className="text-sm font-medium text-text-primary truncate">{selectedClient.phone || "—"}</p>
                  </div>
                  <div className="space-y-1">
                     <p className="text-[10px] text-text-tertiary font-bold uppercase tracking-widest">Email</p>
                     <p className="text-sm font-medium text-text-primary truncate">{selectedClient.email || "—"}</p>
                  </div>
                  <div className="space-y-1">
                     <p className="text-[10px] text-text-tertiary font-bold uppercase tracking-widest">Age / Sex</p>
                     <p className="text-sm font-medium text-text-primary">{[selectedClient.age, selectedClient.sex].filter(Boolean).join(" / ") || "—"}</p>
                  </div>
                  <div className="space-y-1">
                     <p className="text-[10px] text-text-tertiary font-bold uppercase tracking-widest">City</p>
                     <p className="text-sm font-medium text-text-primary truncate">{parseJson(selectedClient.address)?.city || "—"}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Consultations */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-2 border-b border-border-light pb-2">
                       Consultations
                    </h3>
                    <div className="space-y-2">
                      {selectedClient.consultations.length > 0 ? selectedClient.consultations.slice(0, 3).map((c) => (
                        <div key={c.id} className="bg-surface rounded-lg p-3 border border-border-light shadow-sm flex justify-between items-center group cursor-pointer hover:border-blue-300 transition-colors">
                           <div>
                              <p className="text-sm font-semibold text-text-primary leading-tight">{c.service.name}</p>
                              <p className="text-xs text-text-tertiary mt-0.5">Dr. {c.consultant.name}</p>
                           </div>
                           <span className="text-xs font-medium text-text-secondary bg-surface-secondary px-2 py-1 rounded">{format(new Date(c.date), "dd MMM")}</span>
                        </div>
                      )) : (
                         <p className="text-sm text-text-tertiary italic py-2">No consultations recorded.</p>
                      )}
                    </div>
                  </div>

                  {/* Packages */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-2 border-b border-border-light pb-2">
                       Active Packages
                    </h3>
                    <div className="space-y-2">
                      {selectedClient.packages.length > 0 ? selectedClient.packages.map((p) => (
                        <div key={p.id} className="bg-surface rounded-lg p-3 border border-border-light shadow-sm">
                           <div className="flex justify-between items-center mb-2">
                              <Badge className={`${statusColor(p.status)} font-semibold px-2 py-0 text-[10px] tracking-wider uppercase`}>{p.status}</Badge>
                              <span className="text-[10px] font-medium text-text-tertiary">Til {format(new Date(p.validUntil), "dd MMM")}</span>
                           </div>
                           <div className="space-y-1.5 mt-2">
                             <div className="flex justify-between text-xs text-text-secondary font-medium">
                               <span>Progress</span>
                               <span>{p.completedSessions} / {p.totalSessions}</span>
                             </div>
                             <div className="w-full bg-surface-secondary rounded-full h-1.5 overflow-hidden">
                                <div className="bg-blue-600 h-full rounded-full transition-all" style={{ width: `${(p.completedSessions / p.totalSessions) * 100}%` }}></div>
                             </div>
                           </div>
                        </div>
                      )) : (
                         <p className="text-sm text-text-tertiary italic py-2">No active packages.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Share Dashboard */}
                <div className="border-t border-border-light pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-2">
                      <Share2 className="w-3.5 h-3.5 text-blue-600" /> Share Dashboard with Client
                    </h3>
                  </div>
                  {shareUrl ? (
                    <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Input value={shareUrl} readOnly className="bg-surface border-blue-200 text-text-primary text-xs font-mono h-9 flex-1" />
                        <Button variant="outline" size="sm" onClick={copyShareUrl} className="shrink-0 h-9 px-3 border-blue-200 bg-surface hover:bg-blue-100 text-blue-700">
                          {copied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => window.open(shareUrl, "_blank")} className="shrink-0 h-9 px-3 border-blue-200 bg-surface hover:bg-blue-100 text-blue-700">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-[10px] text-blue-600 font-semibold">Link expires in 30 days. Client can view progress, sessions, and billing info.</p>
                    </div>
                  ) : (
                    <Button
                      onClick={() => selectedClient && handleShareDashboard(selectedClient.id)}
                      disabled={sharing}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-4 h-9 shadow-sm w-full"
                    >
                      {sharing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</> : <><Share2 className="h-4 w-4 mr-2" /> Generate Share Link</>}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
