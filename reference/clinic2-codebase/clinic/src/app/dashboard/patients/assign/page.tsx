"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserCheck, Loader2, Users, ArrowRight, Bell, Upload, Check, X, Printer, Pencil } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "next-auth/react";
import { generateIntakeFormPDF, type IntakeFormPdfData } from "@/lib/intake-form-pdf";
import { SignaturePadComponent } from "@/components/signature-pad";

interface ReferralSource {
  id: string;
  name: string;
}

interface Staff {
  id: string;
  name: string;
  role: string;
  designation: string | null;
  department: { name: string } | null;
}

interface ClientWithIntake {
  id: string;
  clientCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  dob?: string;
  age?: number;
  sex?: string;
  visitReasons: string | null;
  createdAt: string;
  consentFormPhotoUrl?: string | null;
  intakeForms: Array<{
    id: string;
    selectedServices: string;
    formData: string | null;
    assignedTo: string | null;
    assignedBy: string | null;
    frontOfficeExec: string | null;
    createdAt: string;
  }>;
}

export default function AssignPage() {
  const { data: session } = useSession();
  const currentUserId = (session?.user as { id?: string })?.id;
  const [clients, setClients] = useState<ClientWithIntake[]>([]);
  const [consultants, setConsultants] = useState<Staff[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  // Multi-therapist allocations staged per client: { clientId: [{staffId}] }. Service is assigned later by the therapist.
  const [allocations, setAllocations] = useState<Record<string, Array<{ staffId: string }>>>({});
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [newIntakeAlert, setNewIntakeAlert] = useState(false);
  const [uploadingConsent, setUploadingConsent] = useState<string | null>(null);
  const [consentUploaded, setConsentUploaded] = useState<Record<string, boolean>>({});
  const [consentDownloaded, setConsentDownloaded] = useState<Record<string, boolean>>({});
  const [digitalSignOpen, setDigitalSignOpen] = useState<ClientWithIntake | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [submittingSignature, setSubmittingSignature] = useState(false);
  // Confirmation dialog — collects customer type + referral source before persisting the assignment.
  const [confirmFor, setConfirmFor] = useState<ClientWithIntake | null>(null);
  const [customerType, setCustomerType] = useState<"WALK_IN" | "REFERRAL">("WALK_IN");
  const [referralSourceId, setReferralSourceId] = useState<string>("");
  const [referredByName, setReferredByName] = useState<string>("");
  const [referralSources, setReferralSources] = useState<ReferralSource[]>([]);
  // Per-client therapist names recorded at assign time (drives the new intake PDF).
  const [assignedNames, setAssignedNames] = useState<Record<string, string[]>>({});
  // FO's saved default signature, fetched once.
  const [foSignature, setFoSignature] = useState<string | null>(null);
  const lastClientCountRef = useRef(0);

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch("/api/clients?unassigned=true");
      const data = await res.json();
      const newClients = data.clients || [];

      if (lastClientCountRef.current > 0 && newClients.length > lastClientCountRef.current) {
        setNewIntakeAlert(true);
        const newCount = newClients.length - lastClientCountRef.current;
        toast.info(`${newCount} new intake${newCount > 1 ? "s" : ""} received!`, {
          icon: <Bell className="h-4 w-4 text-blue-600" />,
        });
      }
      lastClientCountRef.current = newClients.length;
      setClients(newClients);
    } catch (e) {
      console.error("Failed to fetch clients", e);
    }
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/clients?unassigned=true").then((r) => r.json()),
      fetch("/api/staff?role=CONSULTANT").then((r) => r.json()),
      fetch("/api/staff?role=THERAPIST").then((r) => r.json()),
      fetch("/api/referral-sources?active=true").then((r) => r.json()).catch(() => []),
    ]).then(([clientData, consultantData, therapistData, sourcesData]) => {
      setReferralSources(Array.isArray(sourcesData) ? sourcesData : []);
      const initialClients = clientData.clients || [];
      setClients(initialClients);
      lastClientCountRef.current = initialClients.length;
      setConsultants([...(consultantData || []), ...(therapistData || [])]);
      setLoading(false);

      // Auto-assign FO exec to unassigned intakes
      if (currentUserId) {
        initialClients.forEach(async (client: ClientWithIntake) => {
          const latestIntake = client.intakeForms?.[0];
          if (latestIntake && !latestIntake.frontOfficeExec) {
            try {
              await fetch(`/api/clients/${client.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assignFrontOffice: currentUserId, performedById: currentUserId }),
              });
            } catch {
              // Silent fail for auto-assign
            }
          }
        });
      }
    }).catch((e) => {
      console.error(e);
      setLoading(false);
    });
  }, [currentUserId]);

  // Poll for new intakes every 15 seconds
  useEffect(() => {
    const interval = setInterval(fetchClients, 15000);
    return () => clearInterval(interval);
  }, [fetchClients]);

  // Pull the FO's saved default signature once — it's auto-embedded into the intake PDF.
  useEffect(() => {
    fetch("/api/staff/me/signature")
      .then((r) => r.json())
      .then((d) => setFoSignature(d?.signatureDataUrl || null))
      .catch(() => {});
  }, []);

  const isAssigned = (client: ClientWithIntake) =>
    !!client.intakeForms?.[0]?.assignedTo || !!assignedNames[client.id];

  const parseVisitReasons = (raw: string | null): string[] => {
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  };

  const parseSelectedServices = (raw: string | null): string[] => {
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  };

  const getFormData = (client: ClientWithIntake) => {
    const latestIntake = client.intakeForms?.[0];
    if (!latestIntake?.formData) return null;
    try { return JSON.parse(latestIntake.formData); } catch { return null; }
  };

  // Build the data shape required by the new patient-intake PDF.
  const buildPdfData = (
    client: ClientWithIntake,
    patientSignature?: string | null
  ): IntakeFormPdfData => {
    const fd = getFormData(client);
    const address = fd
      ? [fd.addressLine1, fd.addressLine2, fd.city, fd.pincode].filter(Boolean).join(", ")
      : "";

    const intakeAssignedTo = client.intakeForms?.[0]?.assignedTo;
    const sessionAssignedNames = assignedNames[client.id];
    const therapistNames = sessionAssignedNames && sessionAssignedNames.length
      ? sessionAssignedNames
      : intakeAssignedTo
      ? [getStaffName(intakeAssignedTo, true)]
      : (allocations[client.id] || []).map((a) => getStaffName(a.staffId, true));

    const visitDate = client.createdAt
      ? new Date(client.createdAt).toLocaleDateString("en-IN")
      : new Date().toLocaleDateString("en-IN");
    const visitTime = client.createdAt
      ? new Date(client.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
      : "";

    return {
      firstName: client.firstName,
      lastName: client.lastName,
      dob: fd?.dob || (client.dob ? new Date(client.dob).toLocaleDateString("en-IN") : ""),
      age: fd?.age?.toString() || client.age?.toString() || "",
      sex: fd?.sex || client.sex || "",
      phone: client.phone,
      email: fd?.email || client.email || "",
      address,
      emergencyName: fd?.emergencyName || "",
      emergencyPhone: fd?.emergencyPhone || "",
      visitDate,
      visitTime,
      visitReasons: parseVisitReasons(client.visitReasons),
      otherSpecify: fd?.otherSpecify || "",
      assignedToNames: therapistNames,
      assignedByName: session?.user?.name || "Front Office",
      frontOfficeExecName: session?.user?.name || "Front Office",
      patientSignatureDataUrl: patientSignature || null,
      foSignatureDataUrl: foSignature,
    };
  };

  const handleDownloadIntakePDF = async (client: ClientWithIntake) => {
    try {
      const dataUrl = await generateIntakeFormPDF(buildPdfData(client));
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `Intake-${client.clientCode}-${client.firstName}-${client.lastName}.pdf`;
      link.click();
      setConsentDownloaded((prev) => ({ ...prev, [client.id]: true }));
      toast.success("Intake form PDF downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate PDF");
    }
  };

  const handleConsentUpload = async (clientId: string, file: File) => {
    setUploadingConsent(clientId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "consent-photo");
      formData.append("clientId", clientId);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      setConsentUploaded((prev) => ({ ...prev, [clientId]: true }));
      toast.success("Signed intake form uploaded — assignment completed");
      // Patient has reached the final state; drop them off the queue.
      setClients((prev) => prev.filter((c) => c.id !== clientId));
    } catch {
      toast.error("Failed to upload signed intake form");
    } finally {
      setUploadingConsent(null);
    }
  };

  // When a staff is selected, add them directly to allocations — service is assigned later by the therapist
  const onSelectStaff = (clientId: string, staffId: string) => {
    setAllocations(prev => {
      const list = prev[clientId] || [];
      if (list.some(a => a.staffId === staffId)) return prev; // already added
      return { ...prev, [clientId]: [...list, { staffId }] };
    });
    setAssignments(prev => ({ ...prev, [clientId]: "" }));
  };

  const removeAllocation = (clientId: string, staffId: string) => {
    setAllocations(prev => ({
      ...prev,
      [clientId]: (prev[clientId] || []).filter(a => a.staffId !== staffId),
    }));
  };

  // Open the confirmation dialog where the FO picks customer type + referral source.
  const openAssignConfirm = (client: ClientWithIntake) => {
    setCustomerType("WALK_IN");
    setReferralSourceId("");
    setReferredByName("");
    setConfirmFor(client);
  };

  const handleAssign = async (client: ClientWithIntake) => {
    const list = allocations[client.id] || [];
    if (list.length === 0) return;
    if (customerType === "REFERRAL" && !referralSourceId) {
      toast.error("Pick a referral source");
      return;
    }

    setAssigning(client.id);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignments: list.map((a, i) => ({ staffId: a.staffId, isPrimary: i === 0 })),
          assignedBy: currentUserId,
          performedById: currentUserId,
          customerType,
          referralSourceId: customerType === "REFERRAL" ? referralSourceId : null,
          referredBy: customerType === "REFERRAL" ? referredByName || null : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to assign");

      // Notify each assigned therapist
      for (const a of list) {
        const staff = consultants.find(c => c.id === a.staffId);
        await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "PATIENT_ASSIGNED",
            title: "New Patient Assigned",
            message: `Patient ${client.firstName} ${client.lastName} (${client.clientCode}) has been assigned to you. Please choose the appropriate service on their profile.`,
            targetUserId: a.staffId,
            clientId: client.id,
            priority: "HIGH",
            metadata: { clientId: client.id, clientCode: client.clientCode, actionUrl: `/dashboard/patients/${client.id}` },
          }),
        }).catch(() => {});
        void staff;
      }

      // Record assigned-therapist names locally so the intake PDF can render
      // them. Row STAYS on the queue until the signed PDF is uploaded.
      const names = list.map((a) => getStaffName(a.staffId, true));
      setAssignedNames((prev) => ({ ...prev, [client.id]: names }));
      // Mirror the intake form's assignedTo so isAssigned() flips immediately.
      setClients((prev) =>
        prev.map((c) =>
          c.id === client.id
            ? {
                ...c,
                intakeForms: c.intakeForms.map((f, idx) =>
                  idx === 0 ? { ...f, assignedTo: list[0].staffId } : f
                ),
              }
            : c
        )
      );
      toast.success(
        `${client.firstName} ${client.lastName} assigned. Now download or sign the intake form to complete.`
      );
      setConfirmFor(null);
    } catch {
      toast.error("Failed to assign");
    } finally {
      setAssigning(null);
    }
  };

  // Group consultants by category
  const groupedConsultants = useMemo(() => {
    const groups: Record<string, Staff[]> = {
      "Physiotherapists": [],
      "Massage Therapists": [],
      "Medical Consultants": [],
      "Yoga & Wellness": [],
      "Counsellors": [],
      "Nutritionists": [],
      "Strength & Conditioning": [],
      "Admin & Other": []
    };

    consultants.forEach(c => {
      const d = c.designation?.toLowerCase() || "";
      if (d.includes("physiotherapist")) groups["Physiotherapists"].push(c);
      else if (d.includes("massage therapist")) groups["Massage Therapists"].push(c);
      else if (d.includes("medical consultant")) groups["Medical Consultants"].push(c);
      else if (d.includes("yoga")) groups["Yoga & Wellness"].push(c);
      else if (d.includes("counsel")) groups["Counsellors"].push(c);
      else if (d.includes("nutrition")) groups["Nutritionists"].push(c);
      else if (d.includes("strength")) groups["Strength & Conditioning"].push(c);
      else groups["Admin & Other"].push(c);
    });

    // Remove empty groups
    Object.keys(groups).forEach(k => { if (groups[k].length === 0) delete groups[k]; });
    return groups;
  }, [consultants]);

  // Helper: lookup staff name by ID
  const getStaffName = (id: string, short = false) => {
    const c = consultants.find((s) => s.id === id);
    if (!c) return id;
    let label = c.name;
    const d = c.designation?.toLowerCase() || "";
    if (d.includes("physiotherapist")) {
      if (d.includes("head")) label += " (Head)";
      else if (d.includes("senior")) label += " (Senior)";
    } else if (!short && c.designation && !d.includes(label.toLowerCase())) {
         label += ` (${c.designation})`;
    }
    return label;
  };

  return (
    <div className="space-y-6 pb-12 w-full max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary flex items-center gap-3">
             <Users className="h-8 w-8 text-blue-600" /> Pending Allocations
          </h1>
          <p className="text-sm text-text-tertiary">Review new patient intakes, print consent forms, and assign clinical staff.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 px-4 py-2 bg-surface border border-border-light rounded-lg">
             <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Queue Status</span>
             <div className="w-px h-4 bg-border-light"></div>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 px-2.5 py-0.5 text-xs font-bold">
              {clients.length} WAITING
            </Badge>
          </div>
        </div>
      </div>

      {/* New Intake Alert */}
      {newIntakeAlert && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
              <Bell className="h-4 w-4 text-blue-600" />
            </div>
            <p className="text-sm font-semibold text-blue-900">New patient intakes have been received!</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => { setNewIntakeAlert(false); fetchClients(); }}
            className="border-blue-200 text-blue-700 hover:bg-blue-100 text-xs h-8">
            Dismiss
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="neumorphic-card overflow-hidden">
        <div className="p-0">
          <Table>
            <TableHeader className="bg-surface-secondary border-b border-border-light">
              <TableRow className="hover:bg-surface-secondary border-0">
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4 pl-6">Name</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4">Phone</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4">Visit Reasons</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4">Induction Date</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4">Service Chosen</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4">Consent</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4 w-72">Assign Doctor</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4 pr-6 text-right w-32">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border-light">
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-24"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-3" /><p className="text-sm font-medium text-text-tertiary">Scanning Pending Queue...</p></TableCell></TableRow>
              ) : clients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-32">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center border border-green-100">
                         <UserCheck className="h-6 w-6 text-green-600" />
                      </div>
                      <div className="space-y-1">
                         <p className="text-base font-semibold text-text-primary">Queue Cleared</p>
                         <p className="text-sm text-text-tertiary">All clinical assignments have been successfully allocated.</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : clients.map((client) => {
                const reasons = parseVisitReasons(client.visitReasons);
                const latestIntake = client.intakeForms?.[0];
                const selectedServices = parseSelectedServices(latestIntake?.selectedServices || null);
                const hasConsentUploaded = consentUploaded[client.id] || !!client.consentFormPhotoUrl;
                const hasConsentDownloaded = consentDownloaded[client.id];
                const assigned = isAssigned(client);

                return (
                  <TableRow key={client.id} className="hover:bg-surface-secondary transition-colors">
                    {/* Name */}
                    <TableCell className="pl-6 py-4">
                       <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs border border-blue-200 flex items-center justify-center">
                             <AvatarFallback className="bg-transparent">{client.firstName[0]}{client.lastName[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <span className="text-sm font-semibold text-text-primary block">{client.firstName} {client.lastName}</span>
                            <span className="font-mono text-[10px] text-text-tertiary">{client.clientCode}</span>
                          </div>
                       </div>
                    </TableCell>

                    {/* Phone */}
                    <TableCell className="py-4 text-text-secondary text-sm font-mono">+91 {client.phone}</TableCell>

                    {/* Visit Reasons */}
                    <TableCell className="py-4">
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {reasons.length > 0 ? reasons.map((reason) => (
                          <Badge key={reason} className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] px-1.5 py-0 shadow-none font-medium whitespace-nowrap">
                            {reason}
                          </Badge>
                        )) : (
                          <span className="text-xs text-text-tertiary">Not specified</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Induction Date */}
                    <TableCell className="py-4 text-text-tertiary text-sm">{format(new Date(client.createdAt), "dd MMM yyyy")}</TableCell>

                    {/* Service Chosen */}
                    <TableCell className="py-4">
                      {selectedServices.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {selectedServices.map((svc) => (
                            <Badge key={svc} className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] px-1.5 py-0 shadow-none font-medium">
                              {svc}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-text-tertiary">Not selected</span>
                      )}
                    </TableCell>

                    {/* Intake form: PDF + Upload + Digital Sign — gated until therapists are assigned */}
                    <TableCell className="py-4">
                      {!assigned ? (
                        <p className="text-[10px] text-text-tertiary leading-snug">
                          Assign therapists first to enable the intake PDF.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownloadIntakePDF(client)}
                              className={`h-8 text-xs px-2.5 ${hasConsentDownloaded ? "border-green-300 text-green-700 bg-green-50" : "border-border-light text-text-secondary"}`}
                            >
                              {hasConsentDownloaded ? <Check className="h-3 w-3 mr-1" /> : <Printer className="h-3 w-3 mr-1" />}
                              PDF
                            </Button>

                            <label className="cursor-pointer">
                              {uploadingConsent === client.id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                              ) : (
                                <div className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                                  hasConsentUploaded
                                    ? "border-green-300 text-green-700 bg-green-50"
                                    : "border-border-light text-blue-600 hover:text-blue-800 hover:border-blue-300"
                                }`}>
                                  {hasConsentUploaded ? <Check className="h-3 w-3" /> : <Upload className="h-3 w-3" />}
                                  <span>{hasConsentUploaded ? "Done" : "Upload"}</span>
                                </div>
                              )}
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                capture="environment"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleConsentUpload(client.id, file);
                                }}
                              />
                            </label>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDigitalSignOpen(client)}
                            className="h-7 text-[10px] px-2 border-purple-200 text-purple-700 hover:bg-purple-50"
                            title="Capture patient signature on-screen and finalise the assignment"
                          >
                            <Pencil className="h-3 w-3 mr-1" /> Digital Sign
                          </Button>
                        </div>
                      )}
                    </TableCell>

                    {/* Assign Doctor — multi-allocation (service chosen later by therapist) */}
                    <TableCell className="py-4">
                      <div className="space-y-2">
                        {/* Staged allocations chips */}
                        {assigned ? (
                          <div className="flex flex-wrap gap-1.5">
                            {(assignedNames[client.id] || (latestIntake?.assignedTo ? [getStaffName(latestIntake.assignedTo, true)] : [])).map((name) => (
                              <span key={name} className="inline-flex items-center gap-1 bg-green-50 text-green-800 border border-green-200 rounded-full px-2.5 py-0.5 text-[11px] font-medium">
                                <Check className="h-3 w-3" /> {name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <>
                            {(allocations[client.id] || []).length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {(allocations[client.id] || []).map((a) => (
                                  <span key={a.staffId} className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 border border-blue-200 rounded-full pl-2.5 pr-1 py-0.5 text-[11px] font-medium">
                                    {getStaffName(a.staffId, true)}
                                    <button onClick={() => removeAllocation(client.id, a.staffId)} className="ml-0.5 h-4 w-4 rounded-full hover:bg-blue-200 flex items-center justify-center">
                                      <X className="h-3 w-3" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                            <Select
                              value={assignments[client.id] || ""}
                              onValueChange={(v) => v && onSelectStaff(client.id, v)}
                            >
                              <SelectTrigger className="bg-surface border-border-light text-text-primary w-full rounded-lg h-9 text-xs shadow-sm font-medium hover:border-blue-300">
                                <SelectValue placeholder="Add a doctor / therapist...">
                                  Add a doctor / therapist...
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent className="bg-surface border-border-light shadow-xl relative z-50 max-h-[400px] overflow-y-auto">
                                {Object.entries(groupedConsultants).map(([category, staff]) => (
                                  <SelectGroup key={category} className="mb-2">
                                    <SelectLabel className="font-bold text-[10px] text-text-tertiary bg-surface-secondary/50 uppercase tracking-wider py-1 px-2.5 rounded-sm mx-1">
                                      {category}
                                    </SelectLabel>
                                    {staff
                                      .filter(s => !(allocations[client.id] || []).some(a => a.staffId === s.id))
                                      .map((c) => (
                                        <SelectItem key={c.id} value={c.id} className="text-sm cursor-pointer ml-1 py-1.5 min-h-0 pl-7">
                                          {getStaffName(c.id, true)}
                                        </SelectItem>
                                    ))}
                                  </SelectGroup>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-[10px] text-text-tertiary">Therapist will pick the service on the patient profile.</p>
                          </>
                        )}
                      </div>
                    </TableCell>

                    {/* Action */}
                    <TableCell className="pr-6 py-4 text-right">
                      {!assigned ? (
                        <Button
                          size="sm"
                          onClick={() => openAssignConfirm(client)}
                          disabled={
                            (allocations[client.id]?.length || 0) === 0 ||
                            assigning === client.id
                          }
                          title={
                            (allocations[client.id]?.length || 0) === 0
                              ? "Pick at least one therapist first"
                              : ""
                          }
                          className="bg-green-600 hover:bg-green-700 text-white font-semibold text-xs px-4 h-9 rounded-lg transition-all disabled:opacity-50"
                        >
                          {assigning === client.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                          ) : (
                            <span className="flex items-center">Assign <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></span>
                          )}
                        </Button>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          <Badge className="bg-green-50 text-green-700 border border-green-200 text-[10px] px-2 py-0.5 font-semibold">
                            Assigned
                          </Badge>
                          <p className="text-[10px] text-amber-600 font-medium">
                            Capture signed PDF to finalise
                          </p>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Assign confirmation: capture customer type + referral source */}
      <Dialog open={!!confirmFor} onOpenChange={v => { if (!v) setConfirmFor(null); }}>
        <DialogContent className="sm:max-w-md bg-surface border-border-light">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-green-600" /> Confirm Assignment
          </DialogTitle>
          {confirmFor && (
            <div className="space-y-4">
              <div className="bg-surface-secondary rounded-lg p-3 text-xs">
                <p className="font-semibold text-text-primary text-sm">
                  {confirmFor.firstName} {confirmFor.lastName} · <span className="font-mono text-text-tertiary">{confirmFor.clientCode}</span>
                </p>
                <p className="text-text-tertiary mt-1">
                  Assigning to {(allocations[confirmFor.id] || []).length} therapist{(allocations[confirmFor.id] || []).length === 1 ? "" : "s"}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">How did the patient reach the clinic?</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomerType("WALK_IN")}
                    className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                      customerType === "WALK_IN"
                        ? "border-green-300 bg-green-50 text-green-800"
                        : "border-border-light bg-surface text-text-secondary hover:border-border"
                    }`}
                  >
                    Walk-in
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerType("REFERRAL")}
                    className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                      customerType === "REFERRAL"
                        ? "border-blue-300 bg-blue-50 text-blue-800"
                        : "border-border-light bg-surface text-text-secondary hover:border-border"
                    }`}
                  >
                    Referral
                  </button>
                </div>
              </div>

              {customerType === "REFERRAL" && (
                <div className="space-y-3 bg-blue-50/40 border border-blue-100 rounded-lg p-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Referral source</Label>
                    <Select value={referralSourceId} onValueChange={(v) => setReferralSourceId(v || "")}>
                      <SelectTrigger className="bg-surface border-border-light h-9 text-sm">
                        <SelectValue placeholder="Select source..." />
                      </SelectTrigger>
                      <SelectContent>
                        {referralSources.length === 0 ? (
                          <div className="text-xs text-text-tertiary px-2 py-1.5">No sources configured</div>
                        ) : referralSources.map(s => (
                          <SelectItem key={s.id} value={s.id} className="text-sm">{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Referrer name (optional)</Label>
                    <Input
                      value={referredByName}
                      onChange={e => setReferredByName(e.target.value)}
                      placeholder="Doctor / friend name"
                      className="h-9 text-sm bg-surface border-border-light"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-border-light">
                <Button variant="outline" onClick={() => setConfirmFor(null)}>Cancel</Button>
                <Button
                  onClick={() => handleAssign(confirmFor)}
                  disabled={assigning === confirmFor.id || (customerType === "REFERRAL" && !referralSourceId)}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {assigning === confirmFor.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="flex items-center">Confirm Assign <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></span>}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Digital Sign dialog */}
      <Dialog open={!!digitalSignOpen} onOpenChange={v => { if (!v) { setDigitalSignOpen(null); setSignatureDataUrl(null); } }}>
        <DialogContent className="sm:max-w-2xl bg-surface border-border-light max-h-[90vh] overflow-y-auto">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Pencil className="h-4 w-4 text-purple-600" /> Digital Sign Consent
          </DialogTitle>
          {digitalSignOpen && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
                <p className="font-bold">Draft signature only.</p>
                <p>This captures a signature for internal record-keeping. It is not a legally binding e-signature in India without a DocuSign certificate. Keep using the printed + signed upload flow for legally binding records until DocuSign is configured.</p>
              </div>
              <div className="bg-surface rounded-lg border border-border-light p-4 text-xs space-y-1 max-h-48 overflow-y-auto">
                <p className="font-bold text-sm mb-2">Informed Consent Summary</p>
                <p>I confirm the information I&apos;ve shared is accurate and consent to Movement By Design using it for appointment scheduling, clinical assessment, and healthcare delivery. I understand outcomes vary and no specific result is guaranteed. I agree to the clinic cancellation policy (4 hours notice).</p>
                <p className="font-bold pt-2">Patient: {digitalSignOpen.firstName} {digitalSignOpen.lastName} · {digitalSignOpen.clientCode}</p>
              </div>
              <div>
                <p className="text-xs font-semibold mb-2">Patient Signature</p>
                <SignaturePadComponent onChange={setSignatureDataUrl} height={180} />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-border-light">
                <Button variant="outline" onClick={() => { setDigitalSignOpen(null); setSignatureDataUrl(null); }}>Cancel</Button>
                <Button
                  disabled={!signatureDataUrl || submittingSignature}
                  onClick={async () => {
                    if (!digitalSignOpen || !signatureDataUrl) return;
                    setSubmittingSignature(true);
                    try {
                      const client = digitalSignOpen;
                      const dataUrl = await generateIntakeFormPDF(buildPdfData(client, signatureDataUrl));
                      const blob = await (await fetch(dataUrl)).blob();
                      const form = new FormData();
                      form.append("file", blob, `intake-${client.clientCode}.pdf`);
                      form.append("type", "consent-photo");
                      form.append("clientId", client.id);
                      const res = await fetch("/api/upload", { method: "POST", body: form });
                      if (!res.ok) throw new Error("Upload failed");
                      setConsentUploaded((prev) => ({ ...prev, [client.id]: true }));
                      setConsentDownloaded((prev) => ({ ...prev, [client.id]: true }));
                      toast.success("Signed intake form captured & assignment completed");
                      setDigitalSignOpen(null);
                      setSignatureDataUrl(null);
                      // Now that consent is captured, the row leaves the queue.
                      setClients((prev) => prev.filter((c) => c.id !== client.id));
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Failed to save signature");
                    } finally {
                      setSubmittingSignature(false);
                    }
                  }}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {submittingSignature ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign & Save"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
