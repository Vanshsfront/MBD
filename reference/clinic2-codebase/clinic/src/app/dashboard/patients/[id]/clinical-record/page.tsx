"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateClinicalPDF, type ClinicalRecordData } from "@/lib/clinical-pdf";
import { useApiCache } from "@/hooks/use-api-cache";
import { hasPermission } from "@/lib/permissions";
import {
  FileText, ArrowLeft, Download, Printer, Eye, Loader2,
  Stethoscope, Activity, Heart, Save, Lock, Clock, User,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface ClientData {
  id: string;
  clientCode: string;
  firstName: string;
  lastName: string;
  age?: number;
  sex?: string;
  dominance?: string;
  phone: string;
  address?: string;
  medicalHistories?: Array<{
    chiefComplaints?: string;
    knownAllergies?: string;
    currentMedications?: string;
    pastMedicalHistory?: string;
    vitals?: string;
  }>;
  consultations?: Array<{
    id: string;
    diagnosis?: string;
    treatmentProtocol?: string;
    chiefComplaints?: string;
    planOfCare?: string;
    assessmentNotes?: string;
    vitals?: string;
    comorbidities?: string;
    followUp?: string;
    isLocked: boolean;
    lockedAt?: string;
    date: string;
    consultant: { id: string; name: string };
    service: { id: string; name: string };
  }>;
  doctorAssignments?: Array<{
    id: string;
    staffId: string;
    isPrimary: boolean;
    endedAt?: string | null;
    staff: { id: string; name: string; designation?: string | null };
  }>;
}

interface ServiceItem {
  id: string;
  name: string;
}

export default function ClinicalRecordPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const clientId = params.id as string;
  const userRole = (session?.user as { role?: string })?.role ?? "THERAPIST";
  const userId = (session?.user as { id?: string })?.id;
  const isOwner = userRole === "OWNER";

  const [client, setClient] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Selected consultation (for viewing previous records)
  const [selectedConsultId, setSelectedConsultId] = useState<string | null>(null);
  const [isNewRecord, setIsNewRecord] = useState(true);

  // Services list
  const { data: services } = useApiCache<ServiceItem[]>("/api/services");

  // Pain history fields
  const [occupation, setOccupation] = useState("");
  const [sport, setSport] = useState("");
  const [painSite, setPainSite] = useState("");
  const [painSide, setPainSide] = useState("");
  const [painOnset, setPainOnset] = useState("");
  const [painDuration, setPainDuration] = useState("");
  const [painDurationDetail, setPainDurationDetail] = useState("");
  const [painFrequency, setPainFrequency] = useState("");
  const [painFrequencyDetail, setPainFrequencyDetail] = useState("");
  const [painAtRest, setPainAtRest] = useState("");
  const [painOnMovement, setPainOnMovement] = useState("");
  const [aggravatingFactors, setAggravatingFactors] = useState("");
  const [relievingFactors, setRelievingFactors] = useState("");
  const [hpi, setHpi] = useState("");
  const [differentialDiagnosis, setDifferentialDiagnosis] = useState("");
  const [exercises, setExercises] = useState("");
  const [modality, setModality] = useState("");
  const [adjunct, setAdjunct] = useState("");
  const [therapistNotes, setTherapistNotes] = useState("");
  const [attendingPt, setAttendingPt] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [chiefComplaints, setChiefComplaints] = useState("");

  // Comorbidities
  const [dm, setDm] = useState(false);
  const [htn, setHtn] = useState(false);
  const [cad, setCad] = useState(false);
  const [pcos, setPcos] = useState(false);
  const [thyroid, setThyroid] = useState("");
  const [comorOther, setComorOther] = useState("");

  // Lock state for selected record
  const [recordLocked, setRecordLocked] = useState(false);
  const [recordOwner, setRecordOwner] = useState<string | null>(null);

  const fetchClient = useCallback(() => {
    fetch(`/api/clients/${clientId}`)
      .then(r => r.json())
      .then(data => {
        setClient(data);
        // If no consultation selected, start new
        if (!selectedConsultId) {
          prefillFromMedicalHistory(data);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [clientId, selectedConsultId]);

  useEffect(() => { fetchClient(); }, [fetchClient]);

  const prefillFromMedicalHistory = (data: ClientData) => {
    if (data.medicalHistories?.length) {
      const mh = data.medicalHistories[0];
      if (mh.chiefComplaints) setChiefComplaints(mh.chiefComplaints);
    }
    setIsNewRecord(true);
    setSelectedConsultId(null);
    setRecordLocked(false);
    setRecordOwner(null);
  };

  const loadConsultation = (consult: NonNullable<ClientData["consultations"]>[0]) => {
    setSelectedConsultId(consult.id);
    setIsNewRecord(false);
    setRecordLocked(consult.isLocked);
    setRecordOwner(consult.consultant.id);

    // Load fields from consultation
    setDifferentialDiagnosis(consult.diagnosis || "");
    setExercises(consult.treatmentProtocol || "");
    setFollowUp(consult.followUp || "");
    setChiefComplaints(consult.chiefComplaints || "");
    setAttendingPt(consult.consultant.name);
    setServiceId(consult.service.id);

    // Parse assessment notes (stores pain history + treatment details)
    if (consult.assessmentNotes) {
      try {
        const notes = JSON.parse(consult.assessmentNotes);
        setOccupation(notes.occupation || "");
        setSport(notes.sport || "");
        setPainSite(notes.painSite || "");
        setPainSide(notes.painSide || "");
        setPainOnset(notes.painOnset || "");
        setPainDuration(notes.painDuration || "");
        setPainDurationDetail(notes.painDurationDetail || "");
        setPainFrequency(notes.painFrequency || "");
        setPainFrequencyDetail(notes.painFrequencyDetail || "");
        setPainAtRest(notes.painAtRest?.toString() || "");
        setPainOnMovement(notes.painOnMovement?.toString() || "");
        setAggravatingFactors(notes.aggravatingFactors || "");
        setRelievingFactors(notes.relievingFactors || "");
        setHpi(notes.hpi || "");
        setModality(notes.modality || "");
        setAdjunct(notes.adjunct || "");
        setTherapistNotes(notes.therapistNotes || "");
      } catch { /* ignore parse errors */ }
    }

    // Parse comorbidities
    if (consult.comorbidities) {
      try {
        const comor = JSON.parse(consult.comorbidities);
        setDm(comor.dm || false);
        setHtn(comor.htn || false);
        setCad(comor.cad || false);
        setPcos(comor.pcos || false);
        setThyroid(comor.thyroid || "");
        setComorOther(comor.other || "");
      } catch { /* ignore */ }
    }

    // Parse planOfCare into exercises if treatmentProtocol is empty
    if (!consult.treatmentProtocol && consult.planOfCare) {
      setExercises(consult.planOfCare);
    }
  };

  const resetForm = () => {
    setSelectedConsultId(null);
    setIsNewRecord(true);
    setRecordLocked(false);
    setRecordOwner(null);
    setOccupation(""); setSport(""); setPainSite(""); setPainSide("");
    setPainOnset(""); setPainDuration(""); setPainDurationDetail("");
    setPainFrequency(""); setPainFrequencyDetail("");
    setPainAtRest(""); setPainOnMovement("");
    setAggravatingFactors(""); setRelievingFactors("");
    setHpi(""); setDifferentialDiagnosis(""); setExercises("");
    setModality(""); setAdjunct(""); setTherapistNotes("");
    setAttendingPt(""); setFollowUp(""); setServiceId("");
    setChiefComplaints("");
    setDm(false); setHtn(false); setCad(false); setPcos(false);
    setThyroid(""); setComorOther("");
    setPdfUrl(null);
    if (client) prefillFromMedicalHistory(client);
  };

  // Active assignment = this user is currently assigned to the patient (no endedAt)
  const hasActiveAssignment = !!client?.doctorAssignments?.some(
    (a) => a.staffId === userId && !a.endedAt
  );

  // Edit gating:
  // - OWNER is view-only.
  // - Locked records are view-only for everyone.
  // - For NEW records: must hold an active assignment.
  // - For EXISTING records: must be the original author AND still hold an active assignment.
  const canEdit =
    !isOwner &&
    !recordLocked &&
    hasActiveAssignment &&
    (isNewRecord || recordOwner === userId);

  const parseAddress = (addr: string | undefined) => {
    if (!addr) return "";
    try {
      const parsed = JSON.parse(addr);
      return [parsed.line1, parsed.line2, parsed.city, parsed.pincode].filter(Boolean).join(", ");
    } catch { return addr; }
  };

  const getVitals = useCallback(() => {
    if (!client?.medicalHistories?.[0]?.vitals) return {};
    try { return JSON.parse(client.medicalHistories[0].vitals); } catch { return {}; }
  }, [client]);

  // ── Save to Database ──────────────────────────────────────────────────
  const handleSave = async () => {
    if (!client || !serviceId) {
      toast.error("Please select a service");
      return;
    }
    setSaving(true);
    try {
      const assessmentNotes = JSON.stringify({
        occupation, sport, painSite, painSide, painOnset, painDuration,
        painDurationDetail, painFrequency, painFrequencyDetail,
        painAtRest: painAtRest ? parseInt(painAtRest) : null,
        painOnMovement: painOnMovement ? parseInt(painOnMovement) : null,
        aggravatingFactors, relievingFactors, hpi, modality, adjunct, therapistNotes,
      });
      const comorbidities = JSON.stringify({ dm, htn, cad, pcos, thyroid, other: comorOther });

      const payload = {
        clientId: client.id,
        consultantId: userId,
        serviceId,
        chiefComplaints: chiefComplaints || null,
        diagnosis: differentialDiagnosis || null,
        planOfCare: exercises || null,
        treatmentProtocol: exercises || null,
        assessmentNotes,
        comorbidities,
        followUp: followUp || null,
        performedById: userId,
      };

      let res;
      if (isNewRecord) {
        res = await fetch("/api/consultations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/consultations/${selectedConsultId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }

      const saved = await res.json();
      toast.success(isNewRecord ? "Clinical record saved" : "Clinical record updated");

      // Refresh client data and select the saved consultation
      setSelectedConsultId(saved.id);
      setIsNewRecord(false);
      setRecordOwner(saved.consultantId);
      fetchClient();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // ── Lock Record ───────────────────────────────────────────────────────
  const handleLock = async () => {
    if (!selectedConsultId) return;
    if (!confirm("Once locked, this record cannot be edited by anyone. Continue?")) return;
    setLocking(true);
    try {
      const res = await fetch(`/api/consultations/${selectedConsultId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lock: true, performedById: userId }),
      });
      if (!res.ok) throw new Error("Failed to lock");
      setRecordLocked(true);
      toast.success("Record locked successfully");
      fetchClient();
    } catch {
      toast.error("Failed to lock record");
    } finally {
      setLocking(false);
    }
  };

  // ── Generate PDF ──────────────────────────────────────────────────────
  const handleGenerate = () => {
    if (!client) return;
    setGenerating(true);
    try {
      const vitals = getVitals();
      const mh = client.medicalHistories?.[0];
      const wt = vitals.weight;
      const ht = vitals.height;
      const bmi = wt && ht ? (wt / ((ht / 100) ** 2)).toFixed(1) : undefined;

      const data: ClinicalRecordData = {
        date: format(new Date(), "dd/MM/yyyy"),
        patientName: `${client.firstName} ${client.lastName}`,
        patientId: client.clientCode,
        age: client.age?.toString() || "",
        sex: client.sex || "",
        dominance: client.dominance || "",
        contactNo: client.phone,
        occupation, sport,
        address: parseAddress(client.address),
        attendingPhysiotherapist: attendingPt,
        bodyWeight: vitals.weight?.toString(), height: vitals.height?.toString(),
        bmi, spo2: vitals.spo2?.toString(), pulseRate: vitals.pulseRate?.toString(),
        bpSystolic: vitals.bpSystolic?.toString(), bpDiastolic: vitals.bpDiastolic?.toString(),
        comorbidities: { dm, htn, cad, pcos, thyroid: thyroid || undefined, other: comorOther || undefined },
        knownAllergies: mh?.knownAllergies || undefined,
        chiefComplaints: chiefComplaints || mh?.chiefComplaints || undefined,
        historyOfPresentingIllness: hpi || undefined,
        painSite, painSide, painOnset, painDuration, painDurationDetail,
        painFrequency, painFrequencyDetail,
        painAtRest: painAtRest ? parseInt(painAtRest) : undefined,
        painOnMovement: painOnMovement ? parseInt(painOnMovement) : undefined,
        aggravatingFactors, relievingFactors,
        differentialDiagnosis,
        treatmentDate: format(new Date(), "dd/MM/yyyy"),
        exercises, modality, adjunct, therapistNotes,
      };

      const doc = generateClinicalPDF(data);
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      toast.success("Clinical record generated!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate PDF");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!pdfUrl || !client) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = `Clinical_Record_${client.clientCode}_${format(new Date(), "yyyyMMdd")}.pdf`;
    a.click();
  };

  const handlePrint = () => {
    if (!pdfUrl) return;
    const printWindow = window.open(pdfUrl);
    if (printWindow) {
      printWindow.addEventListener("load", () => printWindow.print());
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-text-tertiary">
        <p>Patient not found</p>
      </div>
    );
  }

  const consultations = client.consultations || [];

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="text-text-tertiary">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
              <FileText className="h-6 w-6 text-blue-600" /> Clinical Record
            </h1>
            <p className="text-sm text-text-tertiary">
              {client.firstName} {client.lastName} · {client.clientCode}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {recordLocked && (
            <Badge className="bg-red-50 text-red-700 border-red-200 text-xs flex items-center gap-1">
              <Lock className="h-3 w-3" /> Locked
            </Badge>
          )}
          {isOwner && (
            <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs">View Only</Badge>
          )}
          {pdfUrl && (
            <>
              <Button variant="outline" size="sm" onClick={handlePrint} className="border-border-light h-9">
                <Printer className="h-3.5 w-3.5 mr-1" /> Print
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload} className="border-border-light h-9">
                <Download className="h-3.5 w-3.5 mr-1" /> Download
              </Button>
            </>
          )}
          <Button onClick={handleGenerate} disabled={generating} variant="outline" className="border-border-light h-9">
            {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Eye className="h-4 w-4 mr-1" />}
            {pdfUrl ? "Regenerate" : "Generate"} PDF
          </Button>
          {canEdit && !isNewRecord && !recordLocked && (
            <Button onClick={handleLock} disabled={locking} variant="outline" className="border-red-200 text-red-700 hover:bg-red-50 h-9">
              {locking ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Lock className="h-4 w-4 mr-1" />}
              Lock Record
            </Button>
          )}
          {canEdit && (
            <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white h-9">
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              {isNewRecord ? "Save" : "Update"}
            </Button>
          )}
        </div>
      </div>

      {isOwner && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-2">
          <Eye className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            View-only access — clinical records can only be edited by the treating therapist.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Sidebar: Previous Records */}
        <div className="lg:col-span-3 space-y-3">
          <div className="bg-surface rounded-xl border border-border-light p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Records</h3>
              {!isOwner && (
                <button onClick={resetForm} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                  + New
                </button>
              )}
            </div>

            {isNewRecord && (
              <div className="p-3 rounded-lg border-2 border-blue-300 bg-blue-50 mb-2">
                <p className="text-xs font-semibold text-blue-700">New Record</p>
                <p className="text-[10px] text-blue-500">In progress</p>
              </div>
            )}

            <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
              {consultations.map(c => (
                <button
                  key={c.id}
                  onClick={() => loadConsultation(c)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedConsultId === c.id
                      ? "border-blue-300 bg-blue-50"
                      : "border-border-light hover:border-border-light hover:bg-surface-secondary"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-text-primary truncate">{c.diagnosis || "No diagnosis"}</p>
                    {c.isLocked && <Lock className="h-3 w-3 text-red-500 shrink-0" />}
                  </div>
                  <p className="text-[10px] text-text-tertiary mt-0.5">
                    {format(new Date(c.date), "dd MMM yyyy")} · {c.consultant.name}
                  </p>
                  <p className="text-[10px] text-text-tertiary">{c.service.name}</p>
                </button>
              ))}
              {consultations.length === 0 && (
                <p className="text-xs text-text-tertiary text-center py-4">No previous records</p>
              )}
            </div>
          </div>
        </div>

        {/* Center: Form Fields */}
        <div className="lg:col-span-5 space-y-6">
          {/* Pre-filled info */}
          <div className="bg-blue-50 rounded-xl border border-blue-100 p-4">
            <p className="text-xs font-bold text-blue-700 mb-2">PATIENT DETAILS</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-blue-900">
              <span><strong>Name:</strong> {client.firstName} {client.lastName}</span>
              <span><strong>ID:</strong> {client.clientCode}</span>
              <span><strong>Age:</strong> {client.age || "—"}</span>
              <span><strong>Sex:</strong> {client.sex || "—"}</span>
              <span><strong>Phone:</strong> {client.phone}</span>
              <span><strong>Dominance:</strong> {client.dominance || "—"}</span>
            </div>
          </div>

          {/* Service Selection + Attending PT */}
          <div className="bg-surface rounded-xl border border-border-light p-5 space-y-4">
            <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-blue-600" /> Consultation Details
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">Service *</Label>
                <Select value={serviceId} onValueChange={v => v && setServiceId(v)} disabled={!canEdit}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select service">{serviceId ? services?.find(s => s.id === serviceId)?.name || "Select service" : "Select service"}</SelectValue></SelectTrigger>
                  <SelectContent className="bg-surface max-h-48">
                    {services?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">Attending Physiotherapist</Label>
                <Input value={attendingPt} onChange={e => setAttendingPt(e.target.value)} placeholder="Dr. ___ (PT)" className="h-9 text-sm" disabled={!canEdit} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">Occupation</Label>
                <Input value={occupation} onChange={e => setOccupation(e.target.value)} placeholder="e.g. IT Professional" className="h-9 text-sm" disabled={!canEdit} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">Sport / Physical Activity</Label>
                <Input value={sport} onChange={e => setSport(e.target.value)} placeholder="e.g. Running, Cricket" className="h-9 text-sm" disabled={!canEdit} />
              </div>
            </div>
          </div>

          {/* Chief Complaints */}
          <div className="bg-surface rounded-xl border border-border-light p-5 space-y-3">
            <h3 className="text-sm font-bold text-text-primary">Chief Complaints</h3>
            <Textarea value={chiefComplaints} onChange={e => setChiefComplaints(e.target.value)} placeholder="Patient's main concerns..." className="min-h-[60px] text-sm" disabled={!canEdit} />
          </div>

          {/* Comorbidities */}
          <div className="bg-surface rounded-xl border border-border-light p-5 space-y-4">
            <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <Heart className="h-4 w-4 text-red-500" /> Comorbidities
            </h3>
            <div className="flex flex-wrap gap-4">
              {[
                { label: "DM", state: dm, setter: setDm },
                { label: "HTN", state: htn, setter: setHtn },
                { label: "CAD", state: cad, setter: setCad },
                { label: "PCOS", state: pcos, setter: setPcos },
              ].map(c => (
                <label key={c.label} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={c.state} onCheckedChange={v => c.setter(v as boolean)} disabled={!canEdit} />
                  <span className="text-sm font-medium text-text-secondary">{c.label}</span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">Thyroid</Label>
                <Select value={thyroid} onValueChange={v => v && setThyroid(v)} disabled={!canEdit}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="None">
                      {({ none: "None", up: "Hyper (↑)", down: "Hypo (↓)" } as Record<string, string>)[thyroid] ?? null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-surface">
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="up">Hyper (↑)</SelectItem>
                    <SelectItem value="down">Hypo (↓)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">Other</Label>
                <Input value={comorOther} onChange={e => setComorOther(e.target.value)} placeholder="Other comorbidities" className="h-9 text-sm" disabled={!canEdit} />
              </div>
            </div>
          </div>

          {/* HPI */}
          <div className="bg-surface rounded-xl border border-border-light p-5 space-y-3">
            <h3 className="text-sm font-bold text-text-primary">History of Presenting Illness</h3>
            <Textarea value={hpi} onChange={e => setHpi(e.target.value)} placeholder="Detailed history..." className="min-h-[80px] text-sm" disabled={!canEdit} />
          </div>

          {/* Pain History */}
          <div className="bg-surface rounded-xl border border-border-light p-5 space-y-4">
            <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <Activity className="h-4 w-4 text-purple-600" /> Pain History
            </h3>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-text-secondary">Site</Label>
              <Input value={painSite} onChange={e => setPainSite(e.target.value)} placeholder="e.g. Lower back, Left knee" className="h-9 text-sm" disabled={!canEdit} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">Side</Label>
                <Select value={painSide} onValueChange={v => v && setPainSide(v)} disabled={!canEdit}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent className="bg-surface">
                    <SelectItem value="Right">Right</SelectItem>
                    <SelectItem value="Left">Left</SelectItem>
                    <SelectItem value="Bilateral">Bilateral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">Onset</Label>
                <Select value={painOnset} onValueChange={v => v && setPainOnset(v)} disabled={!canEdit}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent className="bg-surface">
                    <SelectItem value="Sudden">Sudden</SelectItem>
                    <SelectItem value="Gradual">Gradual</SelectItem>
                    <SelectItem value="Insidious">Insidious</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">Duration</Label>
                <Select value={painDuration} onValueChange={v => v && setPainDuration(v)} disabled={!canEdit}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent className="bg-surface">
                    <SelectItem value="Acute">Acute</SelectItem>
                    <SelectItem value="Chronic">Chronic</SelectItem>
                    <SelectItem value="Acute on Chronic">Acute on Chronic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">Duration Detail</Label>
                <Input value={painDurationDetail} onChange={e => setPainDurationDetail(e.target.value)} placeholder="e.g. 3 months" className="h-9 text-sm" disabled={!canEdit} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">Frequency</Label>
                <Select value={painFrequency} onValueChange={v => v && setPainFrequency(v)} disabled={!canEdit}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent className="bg-surface">
                    <SelectItem value="Constant">Constant</SelectItem>
                    <SelectItem value="Intermittent">Intermittent</SelectItem>
                    <SelectItem value="On activity">On activity</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {painFrequency === "On activity" && (
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">Activity Detail</Label>
                <Input value={painFrequencyDetail} onChange={e => setPainFrequencyDetail(e.target.value)} placeholder="Which activity?" className="h-9 text-sm" disabled={!canEdit} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">VAS at Rest (0-10)</Label>
                <Input type="number" min={0} max={10} value={painAtRest} onChange={e => setPainAtRest(e.target.value)} className="h-9 text-sm" disabled={!canEdit} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">VAS on Movement (0-10)</Label>
                <Input type="number" min={0} max={10} value={painOnMovement} onChange={e => setPainOnMovement(e.target.value)} className="h-9 text-sm" disabled={!canEdit} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-text-secondary">Aggravating Factors</Label>
              <Input value={aggravatingFactors} onChange={e => setAggravatingFactors(e.target.value)} className="h-9 text-sm" disabled={!canEdit} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-text-secondary">Relieving Factors</Label>
              <Input value={relievingFactors} onChange={e => setRelievingFactors(e.target.value)} className="h-9 text-sm" disabled={!canEdit} />
            </div>
          </div>

          {/* Treatment Plan */}
          <div className="bg-surface rounded-xl border border-border-light p-5 space-y-4">
            <h3 className="text-sm font-bold text-text-primary">Treatment</h3>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-text-secondary">Differential Diagnosis</Label>
              <Textarea value={differentialDiagnosis} onChange={e => setDifferentialDiagnosis(e.target.value)} placeholder="Provisional diagnosis..." className="min-h-[60px] text-sm" disabled={!canEdit} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-text-secondary">Exercises Prescribed</Label>
              <Textarea value={exercises} onChange={e => setExercises(e.target.value)} placeholder="Exercise protocol..." className="min-h-[60px] text-sm" disabled={!canEdit} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">Modality</Label>
                <Input value={modality} onChange={e => setModality(e.target.value)} placeholder="e.g. Ultrasound, IFT" className="h-9 text-sm" disabled={!canEdit} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-text-secondary">Adjunct</Label>
                <Input value={adjunct} onChange={e => setAdjunct(e.target.value)} placeholder="Taping, Dry needling..." className="h-9 text-sm" disabled={!canEdit} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-text-secondary">Therapist Notes</Label>
              <Textarea value={therapistNotes} onChange={e => setTherapistNotes(e.target.value)} placeholder="Additional observations..." className="min-h-[60px] text-sm" disabled={!canEdit} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-text-secondary">Follow-up Plan</Label>
              <Input value={followUp} onChange={e => setFollowUp(e.target.value)} placeholder="e.g. Review in 2 weeks" className="h-9 text-sm" disabled={!canEdit} />
            </div>
          </div>
        </div>

        {/* Right: PDF Preview */}
        <div className="lg:col-span-4 lg:sticky lg:top-6">
          <div className="bg-surface rounded-xl border border-border-light overflow-hidden">
            <div className="bg-surface-secondary px-4 py-3 border-b border-border-light flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-bold text-text-primary">PDF Preview</span>
              </div>
              {pdfUrl && <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px]">Ready</Badge>}
            </div>
            {pdfUrl ? (
              <iframe src={pdfUrl} className="w-full h-[700px] border-0" title="Clinical Record PDF" />
            ) : (
              <div className="flex flex-col items-center justify-center h-[700px] text-text-tertiary">
                <FileText className="h-16 w-16 mb-4" />
                <p className="text-sm font-medium text-text-tertiary">Fill in the form and click Generate</p>
                <p className="text-xs text-text-tertiary mt-1">PDF will appear here for preview</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
