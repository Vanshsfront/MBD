"use client";

import { useState, useEffect } from "react";
import { useApiCache } from "@/hooks/use-api-cache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Flag, Trash2, AlertTriangle, Star, ShieldAlert, Clock, Search } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Textarea } from "@/components/ui/textarea";

interface FlagItem {
  id: string; type: string; label: string; color: string; notes: string | null; isActive: boolean; createdAt: string; createdBy: string | null;
  client: { id: string; firstName: string; lastName: string; clientCode: string };
}

interface Client { id: string; clientCode: string; firstName: string; lastName: string; }

const FLAG_TYPES = [
  { value: "VIP", label: "VIP", icon: Star, color: "purple" },
  { value: "CAUTION", label: "Caution", icon: ShieldAlert, color: "red" },
  { value: "OVERDUE", label: "Overdue", icon: AlertTriangle, color: "yellow" },
  { value: "FOLLOWUP", label: "Follow-up", icon: Clock, color: "blue" },
  { value: "CUSTOM", label: "Custom", icon: Flag, color: "green" },
];

const FLAG_COLORS = ["red", "yellow", "green", "blue", "purple"];

export default function FlagsPage() {
  const [flags, setFlags] = useState<FlagItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Form
  const [clientId, setClientId] = useState("");
  const [flagType, setFlagType] = useState("CAUTION");
  const [flagLabel, setFlagLabel] = useState("");
  const [flagColor, setFlagColor] = useState("yellow");
  const [flagNotes, setFlagNotes] = useState("");

  const { data: clientData } = useApiCache<{ clients: Client[] }>("/api/clients");

  useEffect(() => {
    fetch("/api/flags").then(r => r.json()).then(data => { setFlags(data || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { if (clientData) setClients(clientData.clients || []); }, [clientData]);

  const handleCreate = async () => {
    if (!clientId || !flagType || !flagLabel) {
      toast.error("Client, type, and label are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, type: flagType, label: flagLabel, color: flagColor, notes: flagNotes }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Flag created!");
      setDialogOpen(false);
      setClientId(""); setFlagLabel(""); setFlagNotes("");
      const refreshed = await fetch("/api/flags").then(r => r.json());
      setFlags(refreshed);
    } catch { toast.error("Failed to create flag"); }
    finally { setSubmitting(false); }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await fetch(`/api/flags?id=${id}`, { method: "DELETE" });
      toast.success("Flag deactivated");
      const refreshed = await fetch("/api/flags").then(r => r.json());
      setFlags(refreshed);
    } catch { toast.error("Failed to deactivate flag"); }
  };

  const colorBadge = (color: string) => {
    const map: Record<string, string> = {
      red: "bg-red-50 text-red-700 border-red-200",
      yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
      green: "bg-green-50 text-green-700 border-green-200",
      blue: "bg-blue-50 text-blue-700 border-blue-200",
      purple: "bg-purple-50 text-purple-700 border-purple-200",
    };
    return map[color] || "bg-surface-secondary text-text-secondary border-border-light";
  };

  const filtered = flags.filter(f => {
    if (!searchQuery) return f.isActive;
    return f.isActive && (
      f.client.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.client.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.type.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div className="space-y-6 pb-12 w-full max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight flex items-center gap-3">
            <Flag className="h-8 w-8 text-blue-600" /> Client Flags
          </h1>
          <p className="text-text-tertiary font-medium">Flag clients with VIP status, caution alerts, follow-up reminders, and more.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
            <Input placeholder="Search flags..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 bg-surface border-border-light h-10 shadow-sm" />
          </div>
          <Button onClick={() => setDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-4 h-10 shadow-sm">
            <Plus className="h-4 w-4 mr-2" /> Add Flag
          </Button>
        </div>
      </div>

      {/* Flag Cards Grid */}
      <div className="grid grid-cols-5 gap-3 mb-2">
        {FLAG_TYPES.map(ft => {
          const Icon = ft.icon;
          const count = flags.filter(f => f.type === ft.value && f.isActive).length;
          return (
            <div key={ft.value} className="bg-surface border border-border-light rounded-xl shadow-sm p-4 flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg ${{red:'bg-red-50',yellow:'bg-yellow-50',green:'bg-green-50',blue:'bg-blue-50',purple:'bg-purple-50'}[ft.color]} flex items-center justify-center`}>
                <Icon className={`h-5 w-5 ${{red:'text-red-600',yellow:'text-yellow-600',green:'text-green-600',blue:'text-blue-600',purple:'text-purple-600'}[ft.color]}`} />
              </div>
              <div>
                <p className="text-lg font-bold text-text-primary">{count}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">{ft.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-surface border border-border-light shadow-sm rounded-xl overflow-hidden">
        <Table>
          <TableHeader className="bg-surface-secondary border-b border-border-light">
            <TableRow>
              <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4 pl-6">Client</TableHead>
              <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4">Type</TableHead>
              <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4">Label</TableHead>
              <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4">Notes</TableHead>
              <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4">Created</TableHead>
              <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4 pr-6 w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border-light">
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-16"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-3" />Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-16 text-text-tertiary font-medium">No active flags found.</TableCell></TableRow>
            ) : filtered.map(flag => (
              <TableRow key={flag.id} className="hover:bg-surface-secondary transition-colors">
                <TableCell className="pl-6 py-4">
                  <p className="text-sm font-semibold text-text-primary">{flag.client.firstName} {flag.client.lastName}</p>
                  <p className="text-[10px] text-text-tertiary font-semibold">{flag.client.clientCode}</p>
                </TableCell>
                <TableCell className="py-4">
                  <Badge className={`${colorBadge(flag.color)} border px-2 py-0.5 text-xs font-semibold shadow-none uppercase tracking-wider`}>{flag.type}</Badge>
                </TableCell>
                <TableCell className="py-4 text-sm font-medium text-text-primary">{flag.label}</TableCell>
                <TableCell className="py-4 text-sm text-text-tertiary max-w-48 truncate">{flag.notes || "—"}</TableCell>
                <TableCell className="py-4 text-sm text-text-tertiary">{format(new Date(flag.createdAt), "dd MMM yyyy")}</TableCell>
                <TableCell className="pr-6 py-4">
                  <Button variant="ghost" size="icon" onClick={() => handleDeactivate(flag.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 w-8">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create Flag Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md bg-surface border-border-light shadow-xl p-0 overflow-hidden">
          <div className="p-5 border-b border-border-light bg-surface-secondary">
            <DialogTitle className="text-lg font-bold text-text-primary flex items-center gap-2">
              <Flag className="h-5 w-5 text-blue-600" /> Create Flag
            </DialogTitle>
            <p className="text-xs text-text-tertiary mt-1">Flag a client for attention, follow-up, or classification.</p>
          </div>
          <div className="p-6 space-y-5">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-text-secondary">Client <span className="text-red-500">*</span></Label>
              <Select value={clientId} onValueChange={(v) => v && setClientId(v)}>
                <SelectTrigger className="bg-surface border-border-light h-10"><SelectValue placeholder="Select client">{clientId ? (() => { const c = clients.find(c => c.id === clientId); return c ? `${c.firstName} ${c.lastName}` : "Select client"; })() : "Select client"}</SelectValue></SelectTrigger>
                <SelectContent className="bg-surface border-border-light max-h-48">{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-text-secondary">Flag Type <span className="text-red-500">*</span></Label>
                <Select value={flagType} onValueChange={(v) => { if (v) { setFlagType(v); const ft = FLAG_TYPES.find(f => f.value === v); if (ft) setFlagColor(ft.color); } }}>
                  <SelectTrigger className="bg-surface border-border-light h-10"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-surface border-border-light">
                    {FLAG_TYPES.map(ft => <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-text-secondary">Color</Label>
                <div className="flex gap-2 pt-1.5">
                  {FLAG_COLORS.map(c => (
                    <button key={c} onClick={() => setFlagColor(c)}
                      className={`h-8 w-8 rounded-md border-2 transition-all ${{red:'bg-red-400',yellow:'bg-yellow-400',green:'bg-green-400',blue:'bg-blue-400',purple:'bg-purple-400'}[c]} ${flagColor === c ? 'border-text-primary scale-110' : 'border-transparent opacity-60 hover:opacity-100'}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-text-secondary">Label <span className="text-red-500">*</span></Label>
              <Input value={flagLabel} onChange={(e) => setFlagLabel(e.target.value)} placeholder="e.g. VIP Client, Check Insurance" className="bg-surface border-border-light h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-text-secondary">Notes</Label>
              <Textarea value={flagNotes} onChange={(e) => setFlagNotes(e.target.value)} placeholder="Additional context..." className="bg-surface border-border-light resize-none min-h-[80px]" />
            </div>
          </div>
          <div className="p-4 border-t border-border-light bg-surface-secondary flex justify-end">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="mr-3 border-border-light text-text-secondary hover:bg-surface-secondary">Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm px-6 font-semibold">
              {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</> : "Create Flag"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
