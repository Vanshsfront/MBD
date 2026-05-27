"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useApiCache, invalidateCache } from "@/hooks/use-api-cache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, FileText, Trash2, Zap, Receipt, Search, Percent, IndianRupee, Tag, Pencil, Save, X, Download } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { exportToCSV } from "@/lib/csv-export";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface InvoiceItem {
  id: string; invoiceNumber: string; invoiceType: string;
  subtotal: number; totalGst: number; totalAmount: number; paidAmount: number;
  status: string; discountPercent: number; discountAmount: number; discountType: string;
  sacNumber: string | null; hslNumber: string | null;
  lineItems: string; inventoryItems: string | null; createdAt: string;
  client: { firstName: string; lastName: string; clientCode: string };
  payments: Array<{ id: string; amount: number; method: string; paymentDate: string }>;
}

interface Client { id: string; clientCode: string; firstName: string; lastName: string; }
interface Service { id: string; name: string; basePrice: number; gstRate: number; hsnSacCode: string | null; participantCount: number; department: { name: string }; }
interface InventoryItemOption { id: string; name: string; unitPrice: number; gstRate: number; hsnSacCode: string | null; stock: number; }

interface LineItem { service: string; consultant: string; hsnSac: string; sessions: number; discountPercent: number; perSessionAmount: number; gstRate: number; }

function InvoicesPageContent() {
  const searchParams = useSearchParams();
  const openInvoiceId = searchParams.get("open");
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemOption[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const [openServiceSearchIndex, setOpenServiceSearchIndex] = useState<number | null>(null);
  const [assignedTherapists, setAssignedTherapists] = useState<{ id: string; name: string; services: string[] }[]>([]);

  // Detail
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceItem | null>(null);

  // Edit mode for detail
  const [editInvoiceMode, setEditInvoiceMode] = useState(false);
  const [editInvoiceData, setEditInvoiceData] = useState<Record<string, string>>({});
  const [savingInvoice, setSavingInvoice] = useState(false);

  // Form
  const [clientId, setClientId] = useState("");
  const [invoiceType, setInvoiceType] = useState("INVOICE");
  const [lineItems, setLineItems] = useState<LineItem[]>([{ service: "", consultant: "", hsnSac: "", sessions: 1, discountPercent: 0, perSessionAmount: 0, gstRate: 0 }]);
  const [dueDate, setDueDate] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  
  // Discount controls
  const [discountType, setDiscountType] = useState<"PERCENT" | "FLAT">("PERCENT");
  const [overallDiscountPercent, setOverallDiscountPercent] = useState(0);
  const [overallDiscountAmount, setOverallDiscountAmount] = useState(0);

  // SAC / HSN
  const [sacNumber, setSacNumber] = useState("");
  const [hslNumber, setHslNumber] = useState("");

  // Inventory items for this invoice
  const [selectedInventory, setSelectedInventory] = useState<Array<{ itemId: string; name: string; qty: number; unitPrice: number; gstRate: number; hsnSac: string }>>([]);

  // Promo
  const [selectedPromoId, setSelectedPromoId] = useState<string>("");

  const { data: invoiceData, loading } = useApiCache<InvoiceItem[]>("/api/invoices");
  const { data: clientData } = useApiCache<{ clients: Client[] }>("/api/clients");
  const { data: serviceData } = useApiCache<Service[]>("/api/services");
  const { data: activePromos } = useApiCache<Array<{ id: string; name: string; code: string; description: string | null; discountType: "PERCENT" | "FLAT"; discountValue: number; maxDiscount: number | null }>>("/api/promotions?active=true");

  useEffect(() => { if (invoiceData) setInvoices(invoiceData); }, [invoiceData]);
  useEffect(() => { if (clientData) setClients(clientData.clients || []); }, [clientData]);
  useEffect(() => { if (serviceData) setServices(serviceData); }, [serviceData]);

  const groupedServices = useMemo(() => {
    const groups: Record<string, Service[]> = {};
    services.forEach(s => {
      const dept = s.department?.name || "Other";
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(s);
    });
    return groups;
  }, [services]);

  // Fetch inventory
  useEffect(() => {
    fetch("/api/inventory").then(r => r.json()).then(setInventoryItems).catch(console.error);
  }, []);

  // Auto-open invoice from query param (e.g. from patient profile)
  useEffect(() => {
    if (openInvoiceId && invoices.length > 0) {
      const inv = invoices.find(i => i.id === openInvoiceId);
      if (inv) {
        setSelectedInvoice(inv);
        setDetailOpen(true);
      }
    }
  }, [openInvoiceId, invoices]);

  // Fetch assigned therapists and services when client changes
  useEffect(() => {
    if (!clientId) {
      setAssignedTherapists([]);
      return;
    }
    fetch(`/api/clients/${clientId}`)
      .then(r => r.json())
      .then(data => {
        if (data?.doctorAssignments?.length > 0) {
          const grouped = new Map<string, { id: string, name: string, services: string[] }>();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data.doctorAssignments.forEach((a: any) => {
             const key = a.staff.id;
             if (!grouped.has(key)) {
               grouped.set(key, { id: a.staff.id, name: a.staff.name, services: [] });
             }
             if (a.serviceName && !grouped.get(key)!.services.includes(a.serviceName)) {
               grouped.get(key)!.services.push(a.serviceName);
             }
          });
          setAssignedTherapists(Array.from(grouped.values()));
        } else if (data?.preferredTherapist) {
          setAssignedTherapists([{ id: data.preferredTherapist.id, name: data.preferredTherapist.name, services: [] }]);
        } else {
          setAssignedTherapists([]);
        }
      })
      .catch(() => {
        setAssignedTherapists([]);
      });
  }, [clientId]);

  const addLineItem = () => setLineItems([...lineItems, { service: "", consultant: "", hsnSac: "", sessions: 1, discountPercent: 0, perSessionAmount: 0, gstRate: 0 }]);
  const removeLineItem = (i: number) => setLineItems(lineItems.filter((_, idx) => idx !== i));
  const updateLineItem = (i: number, field: keyof LineItem, value: string | number) => {
    const updated = [...lineItems];
    updated[i] = { ...updated[i], [field]: value as never };
    setLineItems(updated);
  };

  const selectService = (i: number, serviceId: string) => {
    const svc = services.find((s) => s.id === serviceId);
    if (svc) {
      const updated = [...lineItems];
      // Duo/trio services auto-set qty = participantCount (2 or 3) and are not editable
      const lockedQty = svc.participantCount && svc.participantCount > 1 ? svc.participantCount : updated[i].sessions;
      updated[i] = {
        ...updated[i],
        service: svc.name,
        hsnSac: svc.hsnSacCode || "",
        perSessionAmount: svc.basePrice,
        gstRate: svc.gstRate,
        sessions: lockedQty,
      };
      setLineItems(updated);
    }
  };

  const getParticipantCount = (lineItemService: string): number => {
    const svc = services.find(s => s.name === lineItemService);
    return svc?.participantCount ?? 1;
  };

  const addInventoryItem = (itemId: string) => {
    const item = inventoryItems.find(i => i.id === itemId);
    if (!item) return;
    if (selectedInventory.find(si => si.itemId === itemId)) {
      setSelectedInventory(prev => prev.map(si => si.itemId === itemId ? { ...si, qty: si.qty + 1 } : si));
    } else {
      setSelectedInventory(prev => [...prev, { itemId, name: item.name, qty: 1, unitPrice: item.unitPrice, gstRate: item.gstRate, hsnSac: item.hsnSacCode || "" }]);
    }
  };

  const removeInventoryItem = (itemId: string) => {
    setSelectedInventory(prev => prev.filter(si => si.itemId !== itemId));
  };

  const calculateServicesTotal = () => {
    return lineItems.reduce((sum, item) => {
      const gross = item.sessions * item.perSessionAmount;
      const disc = gross * (item.discountPercent / 100);
      const sub = gross - disc;
      const gst = sub * item.gstRate;
      return sum + sub + gst;
    }, 0);
  };

  const calculateInventoryTotal = () => {
    return selectedInventory.reduce((sum, si) => {
      const sub = si.qty * si.unitPrice;
      const gst = sub * si.gstRate;
      return sum + sub + gst;
    }, 0);
  };

  const calculateSubtotalBeforeDiscount = () => {
    return calculateServicesTotal() + calculateInventoryTotal();
  };

  const calculateFinalTotal = () => {
    const subtotal = calculateSubtotalBeforeDiscount();
    if (discountType === "FLAT" && overallDiscountAmount > 0) {
      return Math.max(0, subtotal - overallDiscountAmount);
    } else if (discountType === "PERCENT" && overallDiscountPercent > 0) {
      return subtotal * (1 - overallDiscountPercent / 100);
    }
    return subtotal;
  };

  const handleCreate = async () => {
    if (!clientId || lineItems.length === 0 || lineItems.some((li) => !li.service || !li.perSessionAmount)) {
      toast.error("Client and at least one valid service line item are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId, invoiceType, lineItems,
          dueDate: dueDate || undefined,
          discountType,
          discountPercent: discountType === "PERCENT" ? overallDiscountPercent : 0,
          discountAmount: discountType === "FLAT" ? overallDiscountAmount : 0,
          sacNumber: sacNumber || undefined,
          hslNumber: hslNumber || undefined,
          inventoryItems: selectedInventory.length > 0 ? selectedInventory : undefined,
          promotionId: selectedPromoId || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Invoice created!");
      setSelectedPromoId("");
      setDialogOpen(false);
      invalidateCache("/api/invoices");
      const refreshed = await fetch("/api/invoices").then((r) => r.json());
      setInvoices(refreshed);
    } catch { toast.error("Failed to create invoice"); }
    finally { setSubmitting(false); }
  };

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      DRAFT: "bg-surface-secondary text-text-secondary border-border-light",
      SENT: "bg-blue-50 text-blue-700 border-blue-200",
      PAID: "bg-green-50 text-green-700 border-green-200",
      PARTIAL: "bg-orange-50 text-orange-700 border-orange-200",
      OVERDUE: "bg-red-50 text-red-700 border-red-200",
    };
    return map[status] || "bg-surface-secondary text-text-secondary border-border-light";
  };

  const filtered = invoices.filter((i) => {
    const matchesStatus = filterStatus === "ALL" || i.status === filterStatus;
    const matchesSearch = i.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          i.client.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          i.client.lastName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const handleExportCSV = () => {
    exportToCSV(
      invoices,
      [
        { header: "Invoice #", accessor: (r) => r.invoiceNumber },
        { header: "Patient", accessor: (r) => `${r.client.firstName} ${r.client.lastName}` },
        { header: "Patient Code", accessor: (r) => r.client.clientCode },
        { header: "Subtotal", accessor: (r) => r.subtotal },
        { header: "GST", accessor: (r) => r.totalGst },
        { header: "Total", accessor: (r) => r.totalAmount },
        { header: "Paid", accessor: (r) => r.paidAmount },
        { header: "Balance", accessor: (r) => r.totalAmount - r.paidAmount },
        { header: "Status", accessor: (r) => r.status },
        { header: "Date", accessor: (r) => new Date(r.createdAt).toLocaleDateString("en-IN") },
      ],
      `invoices-${new Date().toISOString().split("T")[0]}`,
    );
  };

  const resetForm = () => {
    setClientId(""); setInvoiceType("INVOICE"); setDueDate(format(new Date(), "yyyy-MM-dd"));
    setLineItems([{ service: "", consultant: "", hsnSac: "", sessions: 1, discountPercent: 0, perSessionAmount: 0, gstRate: 0 }]);
    setDiscountType("PERCENT"); setOverallDiscountPercent(0); setOverallDiscountAmount(0);
    setSacNumber(""); setHslNumber(""); setSelectedInventory([]);
  };

  return (
    <div className="space-y-6 pb-12 w-full max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary flex items-center gap-3">
             <Receipt className="h-8 w-8 text-blue-600" /> Invoices
          </h1>
          <p className="text-text-tertiary font-medium">Manage billing, discounts, GST, and payment tracking.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
             <Input 
                placeholder="Search invoices..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-surface border-border-light focus:ring-blue-500 h-10"
             />
          </div>
          <button onClick={handleExportCSV} className="flex items-center justify-center gap-2 h-10 px-4 rounded-md border border-border-light bg-surface text-text-secondary hover:bg-surface-secondary transition-colors text-sm font-semibold whitespace-nowrap">
            <Download className="w-4 h-4" /> Export
          </button>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-md h-10 px-4 w-full sm:w-auto whitespace-nowrap">
            <Plus className="h-4 w-4 mr-2" /> Issue Invoice
          </Button>
        </div>
      </div>
      
      {/* Quick Filters */}
      <div className="flex flex-wrap items-center gap-2 bg-surface px-2 py-2 rounded-xl border border-border-light w-fit">
        {["ALL", "DRAFT", "SENT", "PAID", "PARTIAL", "OVERDUE"].map((s) => (
          <button key={s} 
            onClick={() => setFilterStatus(s)}
            className={`text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all ${filterStatus === s ? "bg-surface-secondary text-text-primary" : "text-text-tertiary hover:text-text-primary hover:bg-surface-secondary"}`}
          >
            {s === "ALL" ? "All Statuses" : s}
          </button>
        ))}
      </div>

      <div className="neumorphic-card overflow-hidden">
        <div className="p-0">
          <Table>
            <TableHeader className="bg-surface-secondary border-b border-border-light">
              <TableRow className="hover:bg-surface-secondary border-0">
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4 pl-6">Invoice Number</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4">Client</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4 text-right">Total Amount</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4 text-right">Paid Amount</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4 text-center">Discount</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4 text-center">Status</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4 pr-6 text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border-light">
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-text-tertiary py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-3" />Loading invoices...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-text-tertiary py-12">No invoices found matching criteria.</TableCell></TableRow>
              ) : filtered.map((inv) => (
                <TableRow key={inv.id} className="hover:bg-surface-secondary transition-colors cursor-pointer group"
                  onClick={() => { setSelectedInvoice(inv); setDetailOpen(true); }}>
                  <TableCell className="pl-6 py-4">
                     <span className="font-semibold text-text-primary">{inv.invoiceNumber}</span>
                     <div className="text-[10px] text-text-tertiary uppercase tracking-wider font-semibold mt-0.5">{inv.invoiceType}</div>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex items-center gap-3">
                       <Avatar className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 font-bold text-xs border border-blue-200 flex items-center justify-center">
                          <AvatarFallback className="bg-transparent">{inv.client.firstName[0]}{inv.client.lastName[0]}</AvatarFallback>
                       </Avatar>
                       <div>
                         <p className="text-sm font-semibold text-text-primary">{inv.client.firstName} {inv.client.lastName}</p>
                         <p className="text-[10px] uppercase text-text-tertiary font-semibold">{inv.client.clientCode}</p>
                       </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right py-4 font-semibold text-text-primary">₹{inv.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-right py-4 text-text-secondary font-medium">₹{inv.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="py-4 text-center">
                    {(inv.discountPercent > 0 || inv.discountAmount > 0) ? (
                      <Badge className="bg-purple-50 text-purple-700 border border-purple-200 text-xs px-2 py-0.5 shadow-none">
                        {inv.discountType === "FLAT" ? `₹${inv.discountAmount}` : `${inv.discountPercent}%`}
                      </Badge>
                    ) : <span className="text-text-tertiary">—</span>}
                  </TableCell>
                  <TableCell className="py-4 text-center">
                     <Badge className={`${statusColor(inv.status)} px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider border shadow-none`}>{inv.status}</Badge>
                  </TableCell>
                  <TableCell className="text-text-tertiary text-sm font-medium pr-6 py-4 text-right">{format(new Date(inv.createdAt), "dd MMM yyyy")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create Invoice Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-4xl bg-surface border-border-light text-text-primary p-0 overflow-hidden max-h-[90vh] flex flex-col">
          <div className="p-6 border-b border-border-light bg-surface-secondary flex justify-between items-center shrink-0">
             <DialogTitle className="text-lg font-bold text-text-primary flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                New Invoice
             </DialogTitle>
             <div className="text-right">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-text-tertiary">Estimated Total</span>
                <span className="text-xl font-bold text-text-primary">₹{calculateFinalTotal().toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
             </div>
          </div>

          <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-text-secondary">Client <span className="text-red-500">*</span></Label>
                <Popover open={clientSearchOpen} onOpenChange={setClientSearchOpen}>
                  <PopoverTrigger render={
                    <Button variant="outline" role="combobox" aria-expanded={clientSearchOpen} className="w-full justify-between bg-surface border-border-light text-text-primary h-10 hover:bg-surface focus:ring-2 focus:ring-blue-500 font-normal truncate">
                      {clientId ? (() => { const c = clients.find(c => c.id === clientId); return c ? `${c.firstName} ${c.lastName}` : "Select client"; })() : "Search client..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  } />
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search client by name or code..." />
                      <CommandList>
                        <CommandEmpty>No client found.</CommandEmpty>
                        <CommandGroup>
                          {clients.map((c) => (
                            <CommandItem
                              key={c.id}
                              value={`${c.firstName} ${c.lastName} ${c.clientCode}`}
                              onSelect={() => { setClientId(c.id); setClientSearchOpen(false); }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", clientId === c.id ? "opacity-100" : "opacity-0")} />
                              <div className="flex flex-col">
                                <span>{c.firstName} {c.lastName}</span>
                                <span className="text-[10px] text-text-tertiary">({c.clientCode})</span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-text-secondary">Document Type</Label>
                <Select value={invoiceType} onValueChange={(v) => v && setInvoiceType(v)}>
                  <SelectTrigger className="bg-surface border-border-light text-text-primary h-10 focus:ring-blue-500 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-surface border-border-light">
                    <SelectItem value="INVOICE">Tax Invoice</SelectItem>
                    <SelectItem value="PROFORMA">Proforma Invoice</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-text-secondary">Due Date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="bg-surface border-border-light text-text-primary h-10 focus:ring-blue-500" />
              </div>
            </div>

            {/* Assigned Therapists - Full Width Row */}
            {assignedTherapists.length > 0 && (
              <div className="bg-surface-secondary p-4 rounded-xl border border-border-light">
                <span className="text-[10px] text-text-tertiary font-bold uppercase tracking-wider mb-3 block">Assigned Therapists & Services</span>
                <ul className="space-y-2">
                  {assignedTherapists.map(t => (
                    <li key={t.id} className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3 bg-surface p-3 rounded-lg border border-border-light shadow-sm">
                      <span className="font-semibold text-sm text-text-primary md:w-1/4 truncate">{t.name}</span>
                      {t.services.length > 0 ? (
                        <>
                          <span className="hidden md:block text-border-light">|</span>
                          <span className="text-xs font-medium text-text-secondary flex-1 truncate">{t.services.join(", ")}</span>
                        </>
                      ) : (
                        <>
                          <span className="hidden md:block text-border-light">|</span>
                          <span className="text-xs italic text-text-tertiary flex-1 truncate">No specific services assigned</span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* SAC / HSL Numbers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-text-secondary">SAC Number</Label>
                <Input value={sacNumber} onChange={(e) => setSacNumber(e.target.value)} placeholder="e.g. 999312" className="bg-surface border-border-light text-text-primary h-10 focus:ring-blue-500 font-mono" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-text-secondary">HSN / HSL Number</Label>
                <Input value={hslNumber} onChange={(e) => setHslNumber(e.target.value)} placeholder="e.g. 3004" className="bg-surface border-border-light text-text-primary h-10 focus:ring-blue-500 font-mono" />
              </div>
            </div>

            {/* Line Items */}
            <div className="bg-surface-secondary p-5 rounded-xl border border-border-light">
              <div className="flex items-center justify-between mb-4 border-b border-border-light pb-3">
                <Label className="text-sm font-bold text-text-primary">Service Line Items</Label>
                <Button variant="outline" size="sm" onClick={addLineItem} className="text-xs font-semibold h-8 border-border-light bg-surface hover:bg-surface-secondary text-text-secondary">
                  <Plus className="h-3 w-3 mr-1" /> Add Service
                </Button>
              </div>
              <div className="space-y-3">
                {lineItems.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-3 items-end bg-surface rounded-lg p-3 border border-border-light">
                    <div className="col-span-12 md:col-span-5 space-y-1.5">
                       <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Service</Label>
                       <Popover open={openServiceSearchIndex === i} onOpenChange={(open) => setOpenServiceSearchIndex(open ? i : null)}>
                         <PopoverTrigger render={
                           <Button variant="outline" role="combobox" aria-expanded={openServiceSearchIndex === i} className="w-full justify-between bg-surface border-border-light text-text-primary h-10 hover:bg-surface focus:ring-2 focus:ring-blue-500 font-normal overflow-hidden flex items-center">
                             <span className="truncate text-left flex-1">
                               {item.service || "Select service"}
                             </span>
                             <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                           </Button>
                         } />
                         <PopoverContent className="w-[300px] p-0" align="start">
                           <Command>
                             <CommandInput placeholder="Search service..." />
                             <CommandList>
                               <CommandEmpty>No service found.</CommandEmpty>
                               {Object.entries(groupedServices).map(([dept, svcs]) => (
                                 <CommandGroup key={dept} heading={dept}>
                                   {svcs.map((s) => (
                                     <CommandItem
                                       key={s.id}
                                       value={s.name}
                                       onSelect={() => { selectService(i, s.id); setOpenServiceSearchIndex(null); }}
                                     >
                                       <Check className={cn("mr-2 h-4 w-4 shrink-0", item.service === s.name ? "opacity-100" : "opacity-0")} />
                                       <span className="truncate">{s.name}</span>
                                     </CommandItem>
                                   ))}
                                 </CommandGroup>
                               ))}
                             </CommandList>
                           </Command>
                         </PopoverContent>
                       </Popover>
                    </div>
                    <div className="col-span-6 md:col-span-2 space-y-1.5">
                      <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Rate (₹)</Label>
                      <Input type="number" value={item.perSessionAmount || ""} onChange={(e) => updateLineItem(i, "perSessionAmount", parseFloat(e.target.value) || 0)} className="bg-surface border-border-light text-text-primary text-sm h-9 focus:ring-blue-500" />
                    </div>
                    <div className="col-span-3 md:col-span-1 space-y-1.5">
                      <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Qty</Label>
                      {(() => {
                        const lockedCount = getParticipantCount(item.service);
                        const locked = lockedCount > 1;
                        return (
                          <Input
                            type="number"
                            min="1"
                            value={item.sessions}
                            disabled={locked}
                            onChange={(e) => updateLineItem(i, "sessions", parseInt(e.target.value) || 1)}
                            title={locked ? `Auto-set to ${lockedCount} for ${item.service}` : undefined}
                            className={`bg-surface border-border-light text-text-primary text-sm h-9 focus:ring-blue-500 text-center ${locked ? "opacity-70 cursor-not-allowed" : ""}`}
                          />
                        );
                      })()}
                    </div>
                    <div className="col-span-3 md:col-span-1 space-y-1.5">
                      <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Disc %</Label>
                      <Input type="number" min="0" max="100" value={item.discountPercent || ""} onChange={(e) => updateLineItem(i, "discountPercent", parseFloat(e.target.value) || 0)} className="bg-surface border-border-light text-text-primary text-sm h-9 focus:ring-blue-500 text-center" />
                    </div>
                    <div className="col-span-10 md:col-span-2 space-y-1 text-right pr-2 mt-2 md:mt-0">
                      <span className="text-[9px] font-semibold text-text-tertiary uppercase block">Total</span>
                      <div className="text-sm font-bold text-text-primary h-9 flex items-center justify-end">
                        ₹{((item.sessions * item.perSessionAmount * (1 - item.discountPercent / 100)) * (1 + item.gstRate)).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                      </div>
                    </div>
                    <div className="col-span-2 md:col-span-1 flex justify-center pb-0.5">
                      <Button variant="ghost" size="icon" onClick={() => removeLineItem(i)} className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 w-8">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Inventory Items */}
            {inventoryItems.length > 0 && (
              <div className="bg-surface-secondary p-5 rounded-xl border border-border-light">
                <div className="flex items-center justify-between mb-4 border-b border-border-light pb-3">
                  <Label className="text-sm font-bold text-text-primary flex items-center gap-2"><Tag className="h-4 w-4 text-text-tertiary" /> Inventory Items</Label>
                  <Select onValueChange={(v: string | null) => { if (v) addInventoryItem(v); }}>
                    <SelectTrigger className="w-48 bg-surface border-border-light text-text-primary text-xs h-8 focus:ring-blue-500"><SelectValue placeholder="Add inventory item" /></SelectTrigger>
                    <SelectContent className="bg-surface border-border-light max-h-48">
                      {inventoryItems.filter(i => i.stock > 0).map((item) => (
                        <SelectItem key={item.id} value={item.id}>{item.name} (₹{item.unitPrice} • {item.stock} in stock)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedInventory.length > 0 && (
                  <div className="space-y-2">
                    {selectedInventory.map((si) => (
                      <div key={si.itemId} className="flex items-center justify-between bg-surface rounded-lg p-3 border border-border-light">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-text-primary">{si.name}</span>
                          {si.hsnSac && <span className="text-[10px] text-text-tertiary font-mono">HSN: {si.hsnSac}</span>}
                        </div>
                        <div className="flex items-center gap-4">
                          <Input type="number" min="1" value={si.qty} onChange={(e) => {
                            const qty = parseInt(e.target.value) || 1;
                            setSelectedInventory(prev => prev.map(p => p.itemId === si.itemId ? { ...p, qty } : p));
                          }} className="w-16 h-8 text-center text-sm border-border-light" />
                          <span className="text-sm font-semibold text-text-secondary w-20 text-right">₹{(si.qty * si.unitPrice * (1 + si.gstRate)).toLocaleString()}</span>
                          <Button variant="ghost" size="icon" onClick={() => removeInventoryItem(si.itemId)} className="text-red-500 hover:text-red-600 hover:bg-red-50 h-7 w-7">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Discount and Promo Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Overall Discount */}
              <div className="bg-surface-secondary p-5 rounded-xl border border-border-light flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <Label className="text-sm font-bold text-text-primary flex items-center gap-2">
                      <Percent className="h-4 w-4 text-blue-600" /> Discount
                    </Label>
                    <div className="flex items-center bg-surface rounded-lg border border-border-light p-0.5 shadow-sm">
                      <button
                        onClick={() => { setDiscountType("PERCENT"); setOverallDiscountAmount(0); }}
                        className={`text-xs font-semibold px-2.5 py-1.5 rounded-md transition-all ${discountType === "PERCENT" ? "bg-blue-600 text-white shadow-sm" : "text-text-secondary hover:bg-surface-secondary"}`}
                      >
                        %
                      </button>
                      <button
                        onClick={() => { setDiscountType("FLAT"); setOverallDiscountPercent(0); }}
                        className={`text-xs font-semibold px-2.5 py-1.5 rounded-md transition-all ${discountType === "FLAT" ? "bg-blue-600 text-white shadow-sm" : "text-text-secondary hover:bg-surface-secondary"}`}
                      >
                        Flat ₹
                      </button>
                    </div>
                  </div>
                  
                  {discountType === "PERCENT" ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <Input type="number" min="0" max="100" value={overallDiscountPercent || ""} onChange={(e) => setOverallDiscountPercent(parseFloat(e.target.value) || 0)} className="bg-surface border-border-light text-text-primary h-10 focus:ring-blue-500 font-bold text-lg text-center w-full" />
                        <span className="text-lg font-bold text-blue-600 shrink-0">% off</span>
                      </div>
                      <div className="flex gap-2 flex-wrap justify-center mt-3">
                        {[5, 10, 15, 20, 25].map(v => (
                          <button key={v} onClick={() => setOverallDiscountPercent(v)} className={`text-xs font-semibold px-3 py-1 rounded-full border transition-all ${overallDiscountPercent === v ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-surface text-text-secondary border-border-light hover:bg-surface-secondary"}`}>{v}%</button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-blue-600 shrink-0">₹</span>
                      <Input type="number" min="0" value={overallDiscountAmount || ""} onChange={(e) => setOverallDiscountAmount(parseFloat(e.target.value) || 0)} className="bg-surface border-border-light text-text-primary h-10 focus:ring-blue-500 font-bold text-lg w-full" />
                    </div>
                  )}
                </div>

                {(overallDiscountPercent > 0 || overallDiscountAmount > 0) && (
                  <div className="mt-4 p-3 bg-surface rounded-lg border border-border-light flex justify-between items-center shadow-sm">
                    <span className="text-xs font-bold text-text-secondary">You save</span>
                    <span className="font-bold text-text-primary text-base">
                      ₹{(calculateSubtotalBeforeDiscount() - calculateFinalTotal()).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>

              {/* Promo — applied AFTER the manual discount above */}
              <div className="bg-surface-secondary p-5 rounded-xl border border-border-light flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <Label className="text-sm font-bold text-text-primary flex items-center gap-2">
                      <Tag className="h-4 w-4 text-blue-600" /> Promotions
                    </Label>
                  </div>
                  <Select value={selectedPromoId} onValueChange={(v: string | null) => setSelectedPromoId(v && v !== "__none__" ? v : "")}>
                    <SelectTrigger className="bg-surface border-border-light h-11 text-text-primary font-medium focus:ring-blue-500 shadow-sm w-full">
                      <SelectValue placeholder="Select a promo to apply">
                        {selectedPromoId ? (activePromos?.find(p => p.id === selectedPromoId)?.name || "Select a promo to apply") : "Select a promo to apply"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-surface border-border-light max-h-64">
                      <SelectItem value="__none__" className="text-text-secondary italic">None</SelectItem>
                      {(activePromos || []).map(p => (
                        <SelectItem key={p.id} value={p.id} className="font-medium">
                          {p.name} <span className="text-blue-600 font-bold ml-1">{p.discountType === "PERCENT" ? `${p.discountValue}% OFF` : `₹${p.discountValue} OFF`}</span>
                          {p.code && <span className="ml-2 text-[10px] text-text-tertiary bg-surface-secondary px-1.5 py-0.5 rounded border border-border-light font-mono">{p.code}</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {selectedPromoId && (() => {
                  const promo = activePromos?.find(p => p.id === selectedPromoId);
                  if (!promo) return null;
                  const afterDiscount = calculateSubtotalBeforeDiscount() - (overallDiscountAmount || (overallDiscountPercent ? (calculateSubtotalBeforeDiscount() * overallDiscountPercent / 100) : 0));
                  let promoAmt = promo.discountType === "PERCENT" ? (afterDiscount * promo.discountValue / 100) : promo.discountValue;
                  if (promo.discountType === "PERCENT" && promo.maxDiscount != null && promoAmt > promo.maxDiscount) promoAmt = promo.maxDiscount;
                  return (
                    <div className="mt-4 p-3 bg-surface rounded-lg border border-border-light flex justify-between items-center shadow-sm">
                      <span className="text-xs font-bold text-text-secondary">Promo value</span>
                      <span className="font-bold text-text-primary text-base">₹{promoAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
          
          <div className="p-4 border-t border-border-light bg-surface-secondary flex justify-end shrink-0">
             <Button variant="outline" onClick={() => setDialogOpen(false)} className="mr-3 bg-surface border-border-light text-text-secondary hover:bg-surface-secondary">Cancel</Button>
             <Button onClick={handleCreate} disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-white px-6 font-semibold">
               {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : "Create Invoice"}
             </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) setEditInvoiceMode(false); }}>
        <DialogContent className="sm:max-w-xl bg-surface border-border-light flex flex-col p-0 overflow-hidden max-h-[90vh]">
          {selectedInvoice && (
            <>
              <div className="p-6 border-b border-border-light bg-surface-secondary shrink-0">
                 <div className="flex justify-between items-start">
                    <div>
                       <Badge className={`${statusColor(selectedInvoice.status)} mb-3 px-2 py-0.5 text-[10px] tracking-wider uppercase font-bold border shadow-none`}>{selectedInvoice.status}</Badge>
                       <h3 className="text-2xl font-bold text-text-primary tracking-tight">{selectedInvoice.invoiceNumber}</h3>
                       <p className="text-xs text-text-tertiary mt-1 uppercase tracking-wider font-semibold">{selectedInvoice.invoiceType}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                       <div className="text-right">
                          <p className="text-[10px] uppercase tracking-wider text-text-tertiary font-bold mb-1">Billed To</p>
                          <p className="text-base font-bold text-text-primary leading-tight">{selectedInvoice.client.firstName} {selectedInvoice.client.lastName}</p>
                          <p className="text-xs font-semibold text-blue-600 mt-0.5">{selectedInvoice.client.clientCode}</p>
                       </div>
                       {!editInvoiceMode ? (
                         <Button variant="outline" size="sm" onClick={() => {
                           setEditInvoiceData({
                             status: selectedInvoice.status,
                             sacNumber: selectedInvoice.sacNumber || "",
                             hslNumber: selectedInvoice.hslNumber || "",
                           });
                           setEditInvoiceMode(true);
                         }} className="border-border-light text-text-secondary hover:bg-surface-secondary h-8 gap-1.5">
                           <Pencil className="h-3.5 w-3.5" /> Edit
                         </Button>
                       ) : (
                         <div className="flex gap-2">
                           <Button variant="outline" size="sm" onClick={() => setEditInvoiceMode(false)} className="border-border-light text-text-secondary hover:bg-surface-secondary h-8 gap-1.5">
                             <X className="h-3.5 w-3.5" /> Cancel
                           </Button>
                           <Button size="sm" onClick={async () => {
                             setSavingInvoice(true);
                             try {
                               const res = await fetch(`/api/invoices/${selectedInvoice.id}`, {
                                 method: "PUT",
                                 headers: { "Content-Type": "application/json" },
                                 body: JSON.stringify(editInvoiceData),
                               });
                               if (!res.ok) throw new Error("Failed");
                               const updated = await res.json();
                               setInvoices((prev) => prev.map((inv) => inv.id === updated.id ? { ...inv, ...updated } : inv));
                               setSelectedInvoice({ ...selectedInvoice, ...updated });
                               setEditInvoiceMode(false);
                               toast.success("Invoice updated successfully!");
                               invalidateCache("/api/invoices");
                             } catch { toast.error("Failed to update invoice"); }
                             finally { setSavingInvoice(false); }
                           }} disabled={savingInvoice} className="bg-blue-600 hover:bg-blue-700 text-white h-8 gap-1.5">
                             {savingInvoice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                           </Button>
                         </div>
                       )}
                    </div>
                 </div>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                 {/* Edit mode: Status + SAC/HSN */}
                 {editInvoiceMode && (
                   <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-4">
                     <div className="space-y-2">
                       <Label className="text-xs font-semibold text-blue-800 uppercase">Status</Label>
                       <Select value={editInvoiceData.status} onValueChange={(v) => v && setEditInvoiceData({ ...editInvoiceData, status: v })}>
                         <SelectTrigger className="bg-surface border-blue-200 text-text-primary h-10 w-full"><SelectValue /></SelectTrigger>
                         <SelectContent className="bg-surface border-border-light">
                           {["DRAFT", "SENT", "PAID", "PARTIAL", "OVERDUE"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                         </SelectContent>
                       </Select>
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-2">
                         <Label className="text-xs font-semibold text-blue-800 uppercase">SAC Number</Label>
                         <Input value={editInvoiceData.sacNumber || ""} onChange={(e) => setEditInvoiceData({ ...editInvoiceData, sacNumber: e.target.value })} className="bg-surface border-blue-200 text-text-primary h-10 font-mono" />
                       </div>
                       <div className="space-y-2">
                         <Label className="text-xs font-semibold text-blue-800 uppercase">HSN Number</Label>
                         <Input value={editInvoiceData.hslNumber || ""} onChange={(e) => setEditInvoiceData({ ...editInvoiceData, hslNumber: e.target.value })} className="bg-surface border-blue-200 text-text-primary h-10 font-mono" />
                       </div>
                     </div>
                   </div>
                 )}

                 {/* SAC / HSN display (view mode) */}
                 {!editInvoiceMode && (selectedInvoice.sacNumber || selectedInvoice.hslNumber) && (
                   <div className="flex gap-4 text-xs">
                     {selectedInvoice.sacNumber && (
                       <div className="bg-surface-secondary px-3 py-2 rounded-md border border-border-light">
                         <span className="text-text-tertiary font-semibold">SAC: </span>
                         <span className="text-text-primary font-mono font-bold">{selectedInvoice.sacNumber}</span>
                       </div>
                     )}
                     {selectedInvoice.hslNumber && (
                       <div className="bg-surface-secondary px-3 py-2 rounded-md border border-border-light">
                         <span className="text-text-tertiary font-semibold">HSN: </span>
                         <span className="text-text-primary font-mono font-bold">{selectedInvoice.hslNumber}</span>
                       </div>
                     )}
                   </div>
                 )}

                 {/* Financial Overview */}
                 <div className="bg-surface rounded-xl p-5 border border-border-light">
                   <div className="space-y-3">
                      <div className="flex justify-between items-center text-sm">
                         <span className="text-text-tertiary font-semibold text-xs">Subtotal</span>
                         <span className="text-text-primary font-medium">₹{selectedInvoice.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      {(selectedInvoice.discountPercent > 0 || selectedInvoice.discountAmount > 0) && (
                        <div className="flex justify-between items-center text-sm">
                           <span className="text-purple-600 font-semibold text-xs flex items-center gap-1">
                             <Percent className="h-3 w-3" />
                             Discount ({selectedInvoice.discountType === "FLAT" ? `₹${selectedInvoice.discountAmount}` : `${selectedInvoice.discountPercent}%`})
                           </span>
                           <span className="text-purple-600 font-medium">−₹{selectedInvoice.discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-sm">
                         <span className="text-text-tertiary font-semibold text-xs">Total Tax (GST)</span>
                         <span className="text-text-primary font-medium">₹{selectedInvoice.totalGst.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="h-px bg-surface-secondary w-full my-2"></div>
                      <div className="flex justify-between items-center">
                         <span className="text-text-primary font-bold text-sm">Total Amount</span>
                         <span className="text-lg font-bold text-text-primary">₹{selectedInvoice.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                   </div>
                   
                   <div className="mt-5 pt-4 border-t border-border-light flex justify-between items-center bg-green-50/50 -mx-5 -mb-5 p-5 rounded-b-xl border-x-0 border-b-0">
                      <span className="text-green-800 font-bold text-xs uppercase tracking-wider">Amount Paid</span>
                      <span className="text-lg font-bold text-green-700">₹{selectedInvoice.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                   </div>
                 </div>

                 {/* Balance Due indicator */}
                 {selectedInvoice.status === "PARTIAL" && (
                   <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex justify-between items-center">
                     <span className="text-orange-800 font-bold text-xs uppercase tracking-wider">Balance Due</span>
                     <span className="text-lg font-bold text-orange-700">₹{(selectedInvoice.totalAmount - selectedInvoice.paidAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                   </div>
                 )}

                 {/* Payments Section */}
                 {selectedInvoice.payments.length > 0 && (
                   <div className="space-y-3">
                     <h4 className="flex justify-between items-center text-xs font-bold text-text-secondary uppercase tracking-wider border-b border-border-light pb-2">
                        Payment History
                        <Badge className="bg-surface-secondary text-text-secondary hover:bg-surface-secondary border-none">{selectedInvoice.payments.length}</Badge>
                     </h4>
                     <div className="space-y-2">
                       {selectedInvoice.payments.map((p) => (
                         <div key={p.id} className="flex justify-between items-center bg-surface rounded-lg p-3 border border-border-light">
                           <div className="flex items-center gap-3">
                             <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center border border-blue-100">
                               <Zap className="h-4 w-4 text-blue-600" />
                             </div>
                             <div>
                               <span className="block text-sm font-semibold text-text-primary">₹{p.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                               <span className="block text-[10px] uppercase font-bold tracking-wider text-text-tertiary">Method: {p.method}</span>
                             </div>
                           </div>
                           <span className="text-xs text-text-tertiary font-medium">{format(new Date(p.paymentDate), "dd MMM yyyy")}</span>
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

export default function InvoicesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    }>
      <InvoicesPageContent />
    </Suspense>
  );
}
