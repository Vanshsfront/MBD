"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, CreditCard, Banknote, Zap, Search, FileText, AlertCircle, Download } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { exportToCSV } from "@/lib/csv-export";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
const PAYMENT_METHODS = ["CASH", "CARD", "CHEQUE", "NEFT", "UPI", "RAZORPAY", "OTHER"];

interface PaymentItem {
  id: string; amount: number; method: string; paymentDate: string; reference: string | null;
  invoice: { id: string; invoiceNumber: string; totalAmount: number; status: string; client: { firstName: string; lastName: string; clientCode: string } };
}

interface InvoiceOption { id: string; invoiceNumber: string; totalAmount: number; paidAmount: number; status: string; client: { id: string; firstName: string; lastName: string }; lineItems: string; }

export default function PaymentsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Filters
  const [filterMethod, setFilterMethod] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Form
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("UPI");
  const [reference, setReference] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/payments").then((r) => r.json()),
      fetch("/api/invoices").then((r) => r.json()),
    ]).then(([paymentData, invoiceData]) => {
      setPayments(paymentData || []);
      setInvoices((invoiceData || []).filter((i: InvoiceOption) => i.status !== "PAID"));
      setLoading(false);
    }).catch((e) => { console.error(e); setLoading(false); });
  }, []);

  const selectedInvoice = invoices.find((i) => i.id === invoiceId);
  const balance = selectedInvoice ? selectedInvoice.totalAmount - selectedInvoice.paidAmount : 0;
  const partialInvoices = invoices.filter(i => i.status === "PARTIAL");

  const clientOptions = Array.from(new Map(invoices.map(i => [i.client.id, i.client])).values());
  const clientInvoices = invoices.filter(i => i.client.id === selectedClientId);

  const handleCreate = async () => {
    if (!invoiceId || !amount || !method) {
      toast.error("Invoice, amount, and method are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, amount, method, reference }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Payment recorded!");
      setDialogOpen(false);
      setInvoiceId(""); setAmount(""); setReference("");
      const refreshed = await fetch("/api/payments").then((r) => r.json());
      setPayments(refreshed);
      const inv = await fetch("/api/invoices").then((r) => r.json());
      setInvoices((inv || []).filter((i: InvoiceOption) => i.status !== "PAID"));
    } catch { toast.error("Failed to record payment"); }
    finally { setSubmitting(false); }
  };

  const methodColor = (m: string) => {
    const map: Record<string, string> = { 
      CASH: "bg-green-50 text-green-700 border-green-200", 
      CARD: "bg-blue-50 text-blue-700 border-blue-200", 
      UPI: "bg-purple-50 text-purple-700 border-purple-200", 
      NEFT: "bg-cyan-50 text-cyan-700 border-cyan-200", 
      CHEQUE: "bg-orange-50 text-orange-700 border-orange-200", 
      RAZORPAY: "bg-indigo-50 text-indigo-700 border-indigo-200",
      OTHER: "bg-surface-secondary text-text-secondary border-border-light"
    };
    return map[m] || "bg-surface-secondary text-text-secondary border-border-light";
  };

  const filteredPayments = payments.filter(p => {
     const matchesMethod = filterMethod === "ALL" || p.method === filterMethod;
     const matchesSearch = p.invoice.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           p.invoice.client.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           p.invoice.client.lastName.toLowerCase().includes(searchQuery.toLowerCase());
     return matchesMethod && matchesSearch;
  });

  const handleExportCSV = () => {
    exportToCSV(
      filteredPayments,
      [
        { header: "Date", accessor: (r) => new Date(r.paymentDate).toLocaleDateString("en-IN") },
        { header: "Invoice #", accessor: (r) => r.invoice.invoiceNumber },
        { header: "Patient", accessor: (r) => `${r.invoice.client.firstName} ${r.invoice.client.lastName}` },
        { header: "Amount", accessor: (r) => r.amount },
        { header: "Method", accessor: (r) => r.method },
        { header: "Reference", accessor: (r) => r.reference },
      ],
      `payments-${new Date().toISOString().split("T")[0]}`,
    );
  };

  return (
    <div className="space-y-6 pb-12 w-full max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight flex items-center gap-3">
             <CreditCard className="h-8 w-8 text-blue-600" /> Payments
          </h1>
          <p className="text-text-tertiary font-medium">Track and record payment receipts against invoices.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
             <Input 
                placeholder="Search payments..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-surface border-border-light focus:ring-blue-500 h-10 shadow-sm"
             />
          </div>
          <button onClick={handleExportCSV} className="flex items-center justify-center gap-2 h-10 px-4 rounded-md border border-border-light bg-surface text-text-secondary hover:bg-surface-secondary transition-colors text-sm font-semibold shadow-sm whitespace-nowrap">
            <Download className="w-4 h-4" /> Export
          </button>
          <Button onClick={() => setDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-md shadow-sm h-10 px-4 w-full sm:w-auto whitespace-nowrap">
            <Plus className="h-4 w-4 mr-2" /> Record Payment
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-surface px-2 py-2 rounded-xl border border-border-light shadow-sm w-fit">
        <Select value={filterMethod} onValueChange={(v) => v && setFilterMethod(v)}>
           <SelectTrigger className="h-8 border-0 bg-transparent text-text-secondary font-semibold text-xs focus:ring-0 shadow-none w-36">
              <SelectValue placeholder="FILTER METHOD" />
           </SelectTrigger>
           <SelectContent className="bg-surface border-border-light">
              <SelectItem value="ALL">ALL CHANNELS</SelectItem>
              {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
           </SelectContent>
        </Select>
      </div>

      {/* Part-Payment Reminders */}
      {partialInvoices.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-5 w-5 text-orange-600" />
            <h3 className="text-sm font-bold text-orange-900">Part-Payment Reminders ({partialInvoices.length})</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {partialInvoices.slice(0, 6).map(inv => (
              <div key={inv.id} className="bg-surface rounded-lg p-3 border border-orange-200 flex justify-between items-center shadow-sm">
                <div>
                  <p className="text-sm font-semibold text-text-primary">{inv.client.firstName} {inv.client.lastName}</p>
                  <p className="text-xs text-text-tertiary">{inv.invoiceNumber}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-orange-700">₹{(inv.totalAmount - inv.paidAmount).toLocaleString()}</p>
                  <p className="text-[10px] font-semibold text-orange-500 uppercase">Balance Due</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-surface border border-border-light shadow-sm rounded-xl overflow-hidden">
        <div className="p-0">
          <Table>
            <TableHeader className="bg-surface-secondary border-b border-border-light">
              <TableRow className="hover:bg-surface-secondary border-0">
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4 pl-6">Date</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4">Invoice</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4">Client</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4">Method</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4 text-right">Amount</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4 pr-6">Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border-light">
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-text-tertiary py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-3" />Loading payments...</TableCell></TableRow>
              ) : filteredPayments.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-text-tertiary py-12">No payments found.</TableCell></TableRow>
              ) : filteredPayments.map((p) => (
                <TableRow key={p.id} className="hover:bg-surface-secondary transition-colors">
                  <TableCell className="pl-6 py-4">
                     <span className="text-sm font-medium text-text-secondary block">{format(new Date(p.paymentDate), "dd MMM yyyy")}</span>
                     <span className="text-xs text-text-tertiary">{format(new Date(p.paymentDate), "hh:mm a")}</span>
                  </TableCell>
                  <TableCell className="py-4">
                     <span
                       className="font-semibold text-blue-600 hover:text-blue-700 hover:underline transition-colors cursor-pointer flex items-center gap-1.5 text-sm"
                       onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/billing/invoices?open=${p.invoice.id}`); }}
                     >
                        <FileText className="h-3.5 w-3.5" /> {p.invoice.invoiceNumber}
                     </span>
                  </TableCell>
                  <TableCell className="py-4">
                     <p className="text-text-primary font-semibold text-sm">{p.invoice.client.firstName} {p.invoice.client.lastName}</p>
                  </TableCell>
                  <TableCell className="py-4">
                     <Badge className={`${methodColor(p.method)} border px-2 py-0.5 text-xs font-semibold shadow-none`}>{p.method}</Badge>
                  </TableCell>
                  <TableCell className="text-right py-4 text-text-primary font-bold text-sm">₹{p.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-text-tertiary text-sm pr-6 py-4 truncate max-w-[150px]">{p.reference || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Record Payment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg bg-surface border-border-light shadow-xl text-text-primary p-0 overflow-hidden">
          <div className="p-5 border-b border-border-light bg-surface-secondary">
             <DialogTitle className="text-lg font-bold text-text-primary flex items-center gap-2">
                <Banknote className="h-5 w-5 text-green-600" />
                Record Payment
             </DialogTitle>
             <p className="text-xs text-text-tertiary mt-1">Log a payment received against an outstanding invoice.</p>
          </div>

          <div className="p-6 space-y-5">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-text-secondary">Select Client <span className="text-red-500">*</span></Label>
              <Popover open={clientSearchOpen} onOpenChange={setClientSearchOpen}>
                <PopoverTrigger className="flex w-full items-center justify-between rounded-md border border-border-light bg-surface px-3 h-10 text-sm hover:bg-surface-secondary focus:ring-2 focus:ring-blue-500 font-normal overflow-hidden">
                  <span className="truncate text-left flex-1">
                    {selectedClientId ? (() => { const c = clientOptions.find(c => c.id === selectedClientId); return c ? `${c.firstName} ${c.lastName}` : "Search client..."; })() : "Search client..."}
                  </span>
                  <Search className="ml-2 h-4 w-4 shrink-0 text-text-tertiary" />
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search client name..." />
                    <CommandList>
                      <CommandEmpty>No clients with pending invoices found.</CommandEmpty>
                      <CommandGroup heading="Clients with Pending Invoices">
                        {clientOptions.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={`${c.firstName} ${c.lastName}`}
                            onSelect={() => { setSelectedClientId(c.id); setInvoiceId(""); setClientSearchOpen(false); }}
                            className="py-2.5"
                          >
                            <div className="flex flex-col truncate w-full">
                              <span className="font-medium text-text-primary">{c.firstName} {c.lastName}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {selectedClientId && clientInvoices.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-text-secondary">Select Invoice <span className="text-red-500">*</span></Label>
                <Select value={invoiceId} onValueChange={(v) => v && setInvoiceId(v)}>
                  <SelectTrigger className="bg-surface border-border-light text-text-primary h-10 focus:ring-blue-500 w-full"><SelectValue placeholder="Choose an invoice" /></SelectTrigger>
                  <SelectContent className="bg-surface border-border-light max-h-56">
                    {clientInvoices.map((i) => (
                      <SelectItem key={i.id} value={i.id} className="py-2.5">
                         <span className="font-medium text-text-primary">{i.invoiceNumber}</span> <span className="text-text-tertiary mx-2">|</span> <span className="text-orange-600 font-semibold text-xs">₹{(i.totalAmount - i.paidAmount).toLocaleString()} DUE</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedInvoice && (
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100 flex flex-col gap-2 relative overflow-hidden">
                {(() => {
                  let parsedItems: Array<{ service: string }> = [];
                  try { parsedItems = JSON.parse(selectedInvoice.lineItems || "[]"); } catch {}
                  if (parsedItems.length > 0) {
                    return (
                      <div className="mb-2 pb-2 border-b border-blue-200">
                        <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider block mb-1">Services Billed</span>
                        {parsedItems.map((pi, idx: number) => (
                          <div key={idx} className="flex justify-between items-start text-sm">
                            <span className="text-blue-900 flex-1 font-medium whitespace-normal break-words leading-tight pr-2">• {pi.service}</span>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return null;
                })()}
                <div className="flex justify-between items-center text-sm">
                  <span className="font-semibold text-text-secondary">Total Invoice Amount</span>
                  <span className="text-text-primary font-medium">₹{selectedInvoice.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="font-semibold text-green-600">Amount Paid</span>
                  <span className="text-green-700 font-medium">₹{selectedInvoice.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center border-t border-blue-200 pt-2 mt-1">
                  <span className="text-sm font-bold text-text-primary">Remaining Balance</span>
                  <span className="text-lg font-bold text-orange-600">₹{balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-text-secondary">Amount Received <span className="text-red-500">*</span></Label>
                <div className="relative">
                   <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-text-tertiary font-medium">₹</div>
                   <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-surface border-border-light text-text-primary h-10 focus:ring-blue-500 pl-8 font-semibold" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-text-secondary">Payment Method <span className="text-red-500">*</span></Label>
                <Select value={method} onValueChange={(v) => v && setMethod(v)}>
                  <SelectTrigger className="bg-surface border-border-light text-text-primary h-10 focus:ring-blue-500 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-surface border-border-light">
                     {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-text-secondary">Reference / Txn ID</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. UTR Number, Check No." className="bg-surface border-border-light text-text-primary h-10 focus:ring-blue-500" />
            </div>
          </div>
          
          <div className="p-4 border-t border-border-light bg-surface-secondary flex justify-end shrink-0">
             <Button variant="outline" onClick={() => setDialogOpen(false)} className="mr-3 bg-surface border-border-light text-text-secondary hover:bg-surface-secondary">Cancel</Button>
             <Button onClick={handleCreate} disabled={submitting || (selectedInvoice && balance <= 0)} className="bg-green-600 hover:bg-green-700 text-white shadow-sm px-6 font-semibold">
               {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : "Record Payment"}
             </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
