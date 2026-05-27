"use client";

import { useState, useEffect, useMemo } from "react";
import { useApiCache, invalidateCache } from "@/hooks/use-api-cache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Stethoscope, Plus, Loader2, CalendarDays, CheckCircle2, Pencil, Save, X, Upload } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useSession } from "next-auth/react";

interface Client {
  id: string; clientCode: string; firstName: string; lastName: string;
  phone: string; email?: string; dob?: string; age?: number; sex?: string;
  dominance?: string; address?: string; emergencyContact?: string;
}
interface Staff { id: string; name: string; designation: string | null; department: { name: string } | null; }
interface Service { id: string; name: string; basePrice: number; department: { name: string }; }
interface ConsultationItem {
  id: string; date: string; diagnosis: string | null; chiefComplaints: string | null;
  treatmentProtocol: string | null; recommendedSessions: number | null;
  planOfCare: string | null; followUp: string | null;
  vitals: string | null; comorbidities: string | null;
  assessmentNotes?: string | null;
  client: { id: string; firstName: string; lastName: string; clientCode: string; phone: string; email?: string; dob?: string; age?: number; sex?: string; dominance?: string; address?: string };
  consultant: { name: string };
  service: { name: string };
  packages: Array<{ id: string; status: string }>;
}

const COMORBIDITY_OPTIONS = [
  { key: "dm", label: "DM (Diabetes Mellitus)" },
  { key: "htn", label: "HTN (Hypertension)" },
  { key: "cad", label: "CAD (Coronary Artery Disease)" },
  { key: "pcos", label: "PCOS" },
  { key: "thyroid", label: "Thyroid Issues" },
  { key: "other", label: "Other" },
];

// Default row factories for physio examination tables
const emptyGirthRow = () => ({ site: "", right: "", left: "" });
const emptyTightnessRow = () => ({ muscle: "", rightGrade: "", leftGrade: "" });
const emptyRomRow = () => ({ joint: "", movement: "", right: "", left: "", endFeel: "" });
const emptyMmtRow = () => ({ joint: "", muscleGroup: "", right: "", left: "" });
const emptyNeuroRow = () => ({ sensory: "", right: "", left: "", equality: "" });

export default function ConsultationPage() {
  const { data: session } = useSession();
  const [consultations, setConsultations] = useState<ConsultationItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [consultants, setConsultants] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Consultation type toggle
  const [consultationType, setConsultationType] = useState<"physician" | "physiotherapy">("physician");

  // Form state
  const [clientId, setClientId] = useState("");
  const [consultantId, setConsultantId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [chiefComplaints, setChiefComplaints] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [planOfCare, setPlanOfCare] = useState("");
  const [treatmentProtocol, setTreatmentProtocol] = useState("");
  const [recommendedSessions, setRecommendedSessions] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [createPackage, setCreatePackage] = useState(false);

  // Vitals
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [pulse, setPulse] = useState("");
  const [spo2, setSpo2] = useState("");
  const [spo2On, setSpo2On] = useState("");
  const [bpSystolic, setBpSystolic] = useState("");
  const [bpDiastolic, setBpDiastolic] = useState("");

  // Comorbidities
  const [comorbidities, setComorbidities] = useState<Record<string, boolean>>({});
  const [comorbidityOther, setComorbidityOther] = useState("");

  // History
  const [pastMedicalHistory, setPastMedicalHistory] = useState("");
  const [pastSurgicalHistory, setPastSurgicalHistory] = useState("");
  const [currentMedications, setCurrentMedications] = useState("");

  // Personal History
  const [sleep, setSleep] = useState("");
  const [dietAppetite, setDietAppetite] = useState("");
  const [bowelBladder, setBowelBladder] = useState("");
  const [personalOthers, setPersonalOthers] = useState("");

  // --- Physiotherapy-specific state ---
  const [occupationSport, setOccupationSport] = useState("");
  const [attendingPhysiotherapist, setAttendingPhysiotherapist] = useState("");
  const [knownAllergies, setKnownAllergies] = useState("");
  const [historyPresentingIllness, setHistoryPresentingIllness] = useState("");

  // Pain History
  const [painSite, setPainSite] = useState("");
  const [painSide, setPainSide] = useState("");
  const [painOnset, setPainOnset] = useState("");
  const [painDuration, setPainDuration] = useState("");
  const [painFrequency, setPainFrequency] = useState("");
  const [painIntensity, setPainIntensity] = useState("");
  const [painAtRest, setPainAtRest] = useState("");
  const [painOnMovement, setPainOnMovement] = useState("");
  const [aggravatingFactors, setAggravatingFactors] = useState("");
  const [relievingFactors, setRelievingFactors] = useState("");

  // Family History
  const [familyHistory, setFamilyHistory] = useState("");

  // Substance use
  const [smokingFreq, setSmokingFreq] = useState("");
  const [alcoholFreq, setAlcoholFreq] = useState("");
  const [tobaccoFreq, setTobaccoFreq] = useState("");
  const [otherSubstanceFreq, setOtherSubstanceFreq] = useState("");

  // Investigations & Provisional Diagnosis
  const [investigations, setInvestigations] = useState("");
  const [provisionalDiagnosis, setProvisionalDiagnosis] = useState("");

  // Examination - Posture
  const [postureAnterior, setPostureAnterior] = useState("");
  const [postureLateral, setPostureLateral] = useState("");
  const [posturePosterior, setPosturePosterior] = useState("");

  // Soft Tissue Examination
  const [steSite, setSteSite] = useState("");
  const [steSide, setSteSide] = useState("");
  const [steWarmth, setSteWarmth] = useState("");
  const [steTenderness, setSteTenderness] = useState("");
  const [steTendernessGrade, setSteTendernessGrade] = useState("");
  const [steEdema, setSteEdema] = useState("");
  const [steObservations, setSteObservations] = useState("");

  // Girth Measurement
  const [girthRows, setGirthRows] = useState([emptyGirthRow(), emptyGirthRow(), emptyGirthRow(), emptyGirthRow(), emptyGirthRow()]);

  // Tightness Evaluation
  const [tightnessRows, setTightnessRows] = useState([emptyTightnessRow(), emptyTightnessRow(), emptyTightnessRow(), emptyTightnessRow(), emptyTightnessRow()]);

  // Range of Motion
  const [romRows, setRomRows] = useState([emptyRomRow(), emptyRomRow(), emptyRomRow(), emptyRomRow(), emptyRomRow()]);

  // Manual Muscle Testing
  const [mmtRows, setMmtRows] = useState([emptyMmtRow(), emptyMmtRow(), emptyMmtRow(), emptyMmtRow(), emptyMmtRow()]);

  // Neurological Examination
  const [neuroRows, setNeuroRows] = useState([emptyNeuroRow(), emptyNeuroRow(), emptyNeuroRow(), emptyNeuroRow(), emptyNeuroRow()]);

  // Deep Tendon Reflexes
  const [deepTendonReflexes, setDeepTendonReflexes] = useState("");

  // Gait Analysis
  const [gaitInitialContact, setGaitInitialContact] = useState("");
  const [gaitLoadingResponse, setGaitLoadingResponse] = useState("");
  const [gaitMidStance, setGaitMidStance] = useState("");
  const [gaitTerminalStance, setGaitTerminalStance] = useState("");
  const [gaitPreSwing, setGaitPreSwing] = useState("");
  const [gaitInitialSwing, setGaitInitialSwing] = useState("");
  const [gaitMidSwing, setGaitMidSwing] = useState("");
  const [gaitTerminalSwing, setGaitTerminalSwing] = useState("");

  // Functional Assessment & Special Tests
  const [functionalAssessment, setFunctionalAssessment] = useState("");
  const [specialTests, setSpecialTests] = useState("");
  const [differentialDiagnosis, setDifferentialDiagnosis] = useState("");

  // Treatment section (physio)
  const [initialTreatment, setInitialTreatment] = useState("");
  const [exercises, setExercises] = useState("");
  const [modality, setModality] = useState("");
  const [adjunct, setAdjunct] = useState("");
  const [therapistNotes, setTherapistNotes] = useState("");

  // Detail view
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedConsultation, setSelectedConsultation] = useState<ConsultationItem | null>(null);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Record<string, string | number | null>>({});
  const [saving, setSaving] = useState(false);

  // Auto-pull patient data
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const { data: consultationData, loading: consultationsLoading } = useApiCache<ConsultationItem[]>("/api/consultations");
  const { data: clientData } = useApiCache<{ clients: Client[] }>("/api/clients");
  const { data: staffData } = useApiCache<(Staff & { role: string })[]>("/api/staff");
  const { data: serviceData } = useApiCache<Service[]>("/api/services");

  const loading = consultationsLoading;

  useEffect(() => {
    if (consultationData) setConsultations(consultationData);
  }, [consultationData]);

  useEffect(() => {
    if (clientData) setClients(clientData.clients || []);
  }, [clientData]);

  useEffect(() => {
    if (staffData) setConsultants(staffData.filter((s) => ["CONSULTANT", "THERAPIST"].includes(s.role)));
  }, [staffData]);

  useEffect(() => {
    if (serviceData) setServices(serviceData);
  }, [serviceData]);

  // Auto-pull client demographics when selected
  useEffect(() => {
    if (clientId) {
      const client = clients.find(c => c.id === clientId);
      setSelectedClient(client || null);
    } else {
      setSelectedClient(null);
    }
  }, [clientId, clients]);

  // BMI calculation
  const bmi = useMemo(() => {
    const w = parseFloat(weight);
    const h = parseFloat(height);
    if (w > 0 && h > 0) {
      return (w / ((h / 100) ** 2)).toFixed(1);
    }
    return "";
  }, [weight, height]);

  const resetPhysioFields = () => {
    setOccupationSport(""); setAttendingPhysiotherapist("");
    setKnownAllergies(""); setHistoryPresentingIllness("");
    setPainSite(""); setPainSide(""); setPainOnset(""); setPainDuration("");
    setPainFrequency(""); setPainIntensity(""); setPainAtRest(""); setPainOnMovement("");
    setAggravatingFactors(""); setRelievingFactors("");
    setFamilyHistory("");
    setSmokingFreq(""); setAlcoholFreq(""); setTobaccoFreq(""); setOtherSubstanceFreq("");
    setInvestigations(""); setProvisionalDiagnosis("");
    setPostureAnterior(""); setPostureLateral(""); setPosturePosterior("");
    setSteSite(""); setSteSide(""); setSteWarmth(""); setSteTenderness(""); setSteTendernessGrade(""); setSteEdema(""); setSteObservations("");
    setGirthRows([emptyGirthRow(), emptyGirthRow(), emptyGirthRow(), emptyGirthRow(), emptyGirthRow()]);
    setTightnessRows([emptyTightnessRow(), emptyTightnessRow(), emptyTightnessRow(), emptyTightnessRow(), emptyTightnessRow()]);
    setRomRows([emptyRomRow(), emptyRomRow(), emptyRomRow(), emptyRomRow(), emptyRomRow()]);
    setMmtRows([emptyMmtRow(), emptyMmtRow(), emptyMmtRow(), emptyMmtRow(), emptyMmtRow()]);
    setNeuroRows([emptyNeuroRow(), emptyNeuroRow(), emptyNeuroRow(), emptyNeuroRow(), emptyNeuroRow()]);
    setDeepTendonReflexes("");
    setGaitInitialContact(""); setGaitLoadingResponse(""); setGaitMidStance(""); setGaitTerminalStance("");
    setGaitPreSwing(""); setGaitInitialSwing(""); setGaitMidSwing(""); setGaitTerminalSwing("");
    setFunctionalAssessment(""); setSpecialTests(""); setDifferentialDiagnosis("");
    setInitialTreatment(""); setExercises(""); setModality(""); setAdjunct(""); setTherapistNotes("");
  };

  const resetForm = () => {
    setClientId(""); setConsultantId(""); setServiceId("");
    setChiefComplaints(""); setDiagnosis(""); setPlanOfCare("");
    setTreatmentProtocol(""); setRecommendedSessions(""); setFollowUp("");
    setWeight(""); setHeight(""); setPulse(""); setSpo2(""); setSpo2On("");
    setBpSystolic(""); setBpDiastolic(""); setCreatePackage(false);
    setComorbidities({}); setComorbidityOther("");
    setPastMedicalHistory(""); setPastSurgicalHistory("");
    setCurrentMedications("");
    setSleep(""); setDietAppetite(""); setBowelBladder(""); setPersonalOthers("");
    setSelectedClient(null);
    setConsultationType("physician");
    resetPhysioFields();
  };

  const handleSubmit = async () => {
    if (!clientId || !consultantId || !serviceId) {
      toast.error("Client, consultant, and service are required");
      return;
    }
    setSubmitting(true);
    try {
      const comorbiditiesData = {
        ...comorbidities,
        otherDetails: comorbidityOther || undefined,
      };
      const personalHistory = {
        sleep: sleep || undefined,
        dietAppetite: dietAppetite || undefined,
        bowelBladder: bowelBladder || undefined,
        others: personalOthers || undefined,
      };

      // Build assessmentNotes based on consultation type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const assessmentNotes: Record<string, any> = {
        consultationType,
        pastMedicalHistory: pastMedicalHistory || undefined,
        pastSurgicalHistory: pastSurgicalHistory || undefined,
        currentMedications: currentMedications || undefined,
        personalHistory,
      };

      if (consultationType === "physiotherapy") {
        assessmentNotes.occupationSport = occupationSport || undefined;
        assessmentNotes.attendingPhysiotherapist = attendingPhysiotherapist || undefined;
        assessmentNotes.knownAllergies = knownAllergies || undefined;
        assessmentNotes.historyPresentingIllness = historyPresentingIllness || undefined;
        assessmentNotes.painHistory = {
          site: painSite || undefined,
          side: painSide || undefined,
          onset: painOnset || undefined,
          duration: painDuration || undefined,
          frequency: painFrequency || undefined,
          intensity: painIntensity || undefined,
          painAtRest: painAtRest || undefined,
          painOnMovement: painOnMovement || undefined,
          aggravatingFactors: aggravatingFactors || undefined,
          relievingFactors: relievingFactors || undefined,
        };
        assessmentNotes.familyHistory = familyHistory || undefined;
        assessmentNotes.substanceUse = {
          smoking: smokingFreq || undefined,
          alcohol: alcoholFreq || undefined,
          tobacco: tobaccoFreq || undefined,
          other: otherSubstanceFreq || undefined,
        };
        assessmentNotes.investigations = investigations || undefined;
        assessmentNotes.provisionalDiagnosis = provisionalDiagnosis || undefined;
        assessmentNotes.examination = {
          posture: {
            anterior: postureAnterior || undefined,
            lateral: postureLateral || undefined,
            posterior: posturePosterior || undefined,
          },
          softTissue: {
            site: steSite || undefined,
            side: steSide || undefined,
            warmth: steWarmth || undefined,
            tenderness: steTenderness || undefined,
            tendernessGrade: steTendernessGrade || undefined,
            edema: steEdema || undefined,
            observations: steObservations || undefined,
          },
          girthMeasurement: girthRows.filter(r => r.site || r.right || r.left),
          tightnessEvaluation: tightnessRows.filter(r => r.muscle || r.rightGrade || r.leftGrade),
          rangeOfMotion: romRows.filter(r => r.joint || r.movement || r.right || r.left),
          manualMuscleTesting: mmtRows.filter(r => r.joint || r.muscleGroup || r.right || r.left),
          neurological: neuroRows.filter(r => r.sensory || r.right || r.left),
          deepTendonReflexes: deepTendonReflexes || undefined,
          gaitAnalysis: {
            initialContact: gaitInitialContact || undefined,
            loadingResponse: gaitLoadingResponse || undefined,
            midStance: gaitMidStance || undefined,
            terminalStance: gaitTerminalStance || undefined,
            preSwing: gaitPreSwing || undefined,
            initialSwing: gaitInitialSwing || undefined,
            midSwing: gaitMidSwing || undefined,
            terminalSwing: gaitTerminalSwing || undefined,
          },
          functionalAssessment: functionalAssessment || undefined,
          specialTests: specialTests || undefined,
          differentialDiagnosis: differentialDiagnosis || undefined,
        };
        assessmentNotes.physioTreatment = {
          initialTreatment: initialTreatment || undefined,
          exercises: exercises || undefined,
          modality: modality || undefined,
          adjunct: adjunct || undefined,
          therapistNotes: therapistNotes || undefined,
        };
      }

      const payload = {
        clientId, consultantId, serviceId,
        chiefComplaints,
        diagnosis: consultationType === "physiotherapy" ? (provisionalDiagnosis || diagnosis) : diagnosis,
        planOfCare,
        treatmentProtocol: consultationType === "physiotherapy" ? (initialTreatment || treatmentProtocol) : treatmentProtocol,
        followUp,
        recommendedSessions: recommendedSessions ? parseInt(recommendedSessions) : undefined,
        createPackage,
        vitals: (weight || height || pulse) ? {
          weight: weight ? parseFloat(weight) : undefined,
          height: height ? parseFloat(height) : undefined,
          bmi: bmi ? parseFloat(bmi) : undefined,
          pulseRate: pulse ? parseInt(pulse) : undefined,
          spo2: spo2 ? parseInt(spo2) : undefined,
          spo2On: spo2On || undefined,
          bpSystolic: bpSystolic ? parseInt(bpSystolic) : undefined,
          bpDiastolic: bpDiastolic ? parseInt(bpDiastolic) : undefined,
        } : undefined,
        comorbidities: Object.values(comorbiditiesData).some(Boolean) ? comorbiditiesData : undefined,
        assessmentNotes,
        performedById: (session?.user as { id?: string })?.id,
      };

      const res = await fetch("/api/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to create consultation");

      toast.success("Consultation created successfully!");
      resetForm();
      setDialogOpen(false);

      invalidateCache("/api/consultations");
      invalidateCache("/api/packages");
      const refreshed = await fetch("/api/consultations").then((r) => r.json());
      setConsultations(refreshed);
    } catch {
      toast.error("Failed to create consultation");
    } finally {
      setSubmitting(false);
    }
  };

  const enterEditMode = () => {
    if (!selectedConsultation) return;
    setEditData({
      chiefComplaints: selectedConsultation.chiefComplaints || "",
      diagnosis: selectedConsultation.diagnosis || "",
      planOfCare: selectedConsultation.planOfCare || "",
      treatmentProtocol: selectedConsultation.treatmentProtocol || "",
      recommendedSessions: selectedConsultation.recommendedSessions || "",
      followUp: selectedConsultation.followUp || "",
    });
    setEditMode(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedConsultation) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/consultations/${selectedConsultation.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editData,
          recommendedSessions: editData.recommendedSessions ? parseInt(String(editData.recommendedSessions)) : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to update");
      const updated = await res.json();

      setConsultations((prev) => prev.map((c) => c.id === updated.id ? updated : c));
      setSelectedConsultation(updated);
      setEditMode(false);
      toast.success("Consultation updated successfully!");
      invalidateCache("/api/consultations");
    } catch {
      toast.error("Failed to update consultation");
    } finally {
      setSaving(false);
    }
  };

  // Parse vitals and comorbidities from consultation for detail view
  const parseJson = (str: string | null) => {
    if (!str) return null;
    try { return JSON.parse(str); } catch { return null; }
  };

  // Helper: update a row in a dynamic table array
  const updateRow = <T extends Record<string, string>>(
    rows: T[], setRows: React.Dispatch<React.SetStateAction<T[]>>,
    index: number, field: keyof T, value: string
  ) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    setRows(updated);
  };

  return (
    <div className="space-y-6 pb-12 w-full max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary flex items-center gap-3">
             <Stethoscope className="h-8 w-8 text-blue-600" /> Consultations
          </h1>
          <p className="text-text-tertiary font-medium">All clinical consultations, diagnostics, and assessments</p>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-md shadow-sm h-10 px-4">
            <Plus className="h-4 w-4 mr-2" /> New Consultation
          </Button>
        </div>
      </div>

      <div className="neumorphic-card overflow-hidden">
        <div className="p-0">
          <Table>
            <TableHeader className="bg-surface-secondary border-b border-border-light">
              <TableRow className="hover:bg-surface-secondary border-0">
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4 pl-6">Date</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4">Client</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4">Service</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4">Consultant</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4">Diagnosis</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4 text-center">Sessions</TableHead>
                <TableHead className="text-text-tertiary font-semibold text-xs tracking-wider uppercase py-4 text-center pr-6">Package</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border-light">
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-text-tertiary py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-3" />Loading consultations...</TableCell></TableRow>
              ) : consultations.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-text-tertiary py-12">No consultations yet</TableCell></TableRow>
              ) : consultations.map((c) => (
                <TableRow key={c.id} className="cursor-pointer hover:bg-surface-secondary transition-colors" onClick={() => { setSelectedConsultation(c); setEditMode(false); setDetailOpen(true); }}>
                  <TableCell className="text-text-tertiary text-sm pl-6 py-4">{format(new Date(c.date), "dd MMM yyyy")}</TableCell>
                  <TableCell className="py-4">
                     <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs border border-blue-200 flex items-center justify-center">
                           <AvatarFallback className="bg-transparent">{c.client.firstName[0]}{c.client.lastName[0]}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-semibold text-text-primary">{c.client.firstName} {c.client.lastName}</span>
                     </div>
                  </TableCell>
                  <TableCell className="text-text-secondary text-sm max-w-48 truncate py-4 font-medium">{c.service.name}</TableCell>
                  <TableCell className="text-text-secondary text-sm py-4">{c.consultant.name}</TableCell>
                  <TableCell className="text-text-tertiary text-sm max-w-32 truncate py-4">{c.diagnosis || "\u2014"}</TableCell>
                  <TableCell className="text-center text-text-secondary font-medium py-4">{c.recommendedSessions || "\u2014"}</TableCell>
                  <TableCell className="text-center pr-6 py-4">
                    {(c.packages?.length ?? 0) > 0 ? <Badge className="bg-green-50 text-green-700 border border-green-200 text-xs px-2 py-0.5">Yes</Badge> : <span className="text-text-tertiary">{"\u2014"}</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* New Consultation Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-4xl bg-surface border-border-light shadow-lg max-h-[90vh] overflow-y-auto w-full p-0">
          <div className="bg-surface-secondary border-b border-border-light p-6 flex flex-col gap-1">
             <DialogTitle className="text-text-primary text-lg font-bold flex items-center gap-2">
               <Stethoscope className="h-5 w-5 text-blue-600" /> New Consultation
             </DialogTitle>
             <p className="text-xs text-text-tertiary">Complete consultation form with vitals, history, and plan of care.</p>
          </div>

          {/* Consultation Type Tabs */}
          <div className="px-6 pt-4">
            <div className="flex rounded-lg border border-border-light overflow-hidden w-fit">
              <button
                type="button"
                onClick={() => setConsultationType("physician")}
                className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                  consultationType === "physician"
                    ? "bg-blue-600 text-white"
                    : "bg-surface text-text-secondary hover:bg-surface-secondary"
                }`}
              >
                Physician Consultation
              </button>
              <button
                type="button"
                onClick={() => setConsultationType("physiotherapy")}
                className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors border-l border-border-light ${
                  consultationType === "physiotherapy"
                    ? "bg-blue-600 text-white"
                    : "bg-surface text-text-secondary hover:bg-surface-secondary"
                }`}
              >
                Physiotherapy Consultation
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Patient, Consultant, Service Selection */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label className="text-text-secondary text-xs font-semibold">Client <span className="text-red-500">*</span></Label>
                <Select value={clientId} onValueChange={(v) => v && setClientId(v)}>
                  <SelectTrigger className="bg-surface border-border-light text-text-primary focus:ring-blue-500"><SelectValue placeholder="Select client">{clientId ? (() => { const c = clients.find(c => c.id === clientId); return c ? `${c.firstName} ${c.lastName}` : "Select client"; })() : "Select client"}</SelectValue></SelectTrigger>
                  <SelectContent className="bg-surface border-border-light max-h-48">
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-text-secondary text-xs font-semibold">{consultationType === "physiotherapy" ? "Attending Physiotherapist" : "Consultant"} <span className="text-red-500">*</span></Label>
                <Select value={consultantId} onValueChange={(v) => v && setConsultantId(v)}>
                  <SelectTrigger className="bg-surface border-border-light text-text-primary focus:ring-blue-500"><SelectValue placeholder="Select">{consultantId ? consultants.find(c => c.id === consultantId)?.name || "Select" : "Select"}</SelectValue></SelectTrigger>
                  <SelectContent className="bg-surface border-border-light">
                    {consultants.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-text-secondary text-xs font-semibold">Service <span className="text-red-500">*</span></Label>
                <Select value={serviceId} onValueChange={(v) => v && setServiceId(v)}>
                  <SelectTrigger className="bg-surface border-border-light text-text-primary focus:ring-blue-500"><SelectValue placeholder="Select">{serviceId ? services.find(s => s.id === serviceId)?.name || "Select" : "Select"}</SelectValue></SelectTrigger>
                  <SelectContent className="bg-surface border-border-light max-h-48">
                    {services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Auto-pulled Patient Demographics */}
            {selectedClient && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider mb-3">Patient Demographics (Auto-filled)</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="font-semibold text-blue-600 block">Date</span>
                    <span className="text-text-primary">{format(new Date(), "dd MMM yyyy")}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-blue-600 block">Patient Name</span>
                    <span className="text-text-primary">{selectedClient.firstName} {selectedClient.lastName}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-blue-600 block">Age</span>
                    <span className="text-text-primary">{selectedClient.age || "\u2014"}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-blue-600 block">Sex</span>
                    <span className="text-text-primary">{selectedClient.sex || "\u2014"}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-blue-600 block">Dominance</span>
                    <span className="text-text-primary">{selectedClient.dominance || "\u2014"}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-blue-600 block">Patient ID</span>
                    <span className="text-text-primary font-mono">{selectedClient.clientCode}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-blue-600 block">Contact No</span>
                    <span className="text-text-primary">{selectedClient.phone}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-blue-600 block">Address</span>
                    <span className="text-text-primary">{selectedClient.address ? ((() => { try { const a = JSON.parse(selectedClient.address); return [a.line1, a.line2, a.city, a.pincode].filter(Boolean).join(", "); } catch { return selectedClient.address; }})()) : "\u2014"}</span>
                  </div>
                  {consultationType === "physiotherapy" && (
                    <div className="col-span-2">
                      <span className="font-semibold text-blue-600 block mb-1">Occupation / Sport</span>
                      <Input value={occupationSport} onChange={(e) => setOccupationSport(e.target.value)} placeholder="e.g., Software engineer, Cricket" className="bg-surface border-blue-200 text-text-primary focus:ring-blue-500 h-8 text-xs" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Vitals */}
            <div className="bg-surface-secondary p-5 rounded-xl border border-border-light">
              <p className="text-xs font-bold text-text-primary mb-3 border-b border-border-light pb-2">Vitals</p>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                 <div className="space-y-1.5">
                   <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Body Wt (kg)</Label>
                   <Input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="kg" type="number" className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                 </div>
                 <div className="space-y-1.5">
                   <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Height (cm)</Label>
                   <Input value={height} onChange={(e) => setHeight(e.target.value)} placeholder="cm" type="number" className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                 </div>
                 <div className="space-y-1.5">
                   <Label className="text-[10px] font-semibold text-text-tertiary uppercase">BMI</Label>
                   <Input value={bmi} readOnly placeholder="Auto" className="bg-surface-secondary border-border-light text-text-secondary font-semibold" />
                 </div>
                 <div className="space-y-1.5">
                   <Label className="text-[10px] font-semibold text-text-tertiary uppercase">PR (bpm)</Label>
                   <Input value={pulse} onChange={(e) => setPulse(e.target.value)} placeholder="bpm" type="number" className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                 </div>
                 <div className="space-y-1.5">
                   <Label className="text-[10px] font-semibold text-text-tertiary uppercase">SpO2 %</Label>
                   <Input value={spo2} onChange={(e) => setSpo2(e.target.value)} placeholder="%" type="number" className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                 </div>
                 <div className="space-y-1.5">
                   <Label className="text-[10px] font-semibold text-text-tertiary uppercase">SpO2 On</Label>
                   <Input value={spo2On} onChange={(e) => setSpo2On(e.target.value)} placeholder="RA/O2" className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                 </div>
                 <div className="space-y-1.5">
                   <Label className="text-[10px] font-semibold text-text-tertiary uppercase">BP (mmHg)</Label>
                   <div className="flex gap-1">
                     <Input value={bpSystolic} onChange={(e) => setBpSystolic(e.target.value)} placeholder="Sys" type="number" className="bg-surface border-border-light text-text-primary focus:ring-blue-500 w-1/2" />
                     <Input value={bpDiastolic} onChange={(e) => setBpDiastolic(e.target.value)} placeholder="Dia" type="number" className="bg-surface border-border-light text-text-primary focus:ring-blue-500 w-1/2" />
                   </div>
                 </div>
              </div>
            </div>

            {/* Comorbidities */}
            <div className="bg-surface-secondary p-5 rounded-xl border border-border-light">
              <p className="text-xs font-bold text-text-primary mb-3 border-b border-border-light pb-2">Comorbidities</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {COMORBIDITY_OPTIONS.map(opt => (
                  <label key={opt.key} className="flex items-center gap-2.5 cursor-pointer">
                    <Checkbox
                      checked={comorbidities[opt.key] || false}
                      onCheckedChange={(v) => setComorbidities(prev => ({ ...prev, [opt.key]: v as boolean }))}
                      className="border-border-light data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                    />
                    <span className="text-sm text-text-secondary">{opt.label}</span>
                  </label>
                ))}
              </div>
              {comorbidities.other && (
                <div className="mt-3">
                  <Input value={comorbidityOther} onChange={(e) => setComorbidityOther(e.target.value)} placeholder="Specify other comorbidities..." className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                </div>
              )}
            </div>

            {/* Chief Complaints */}
            <div className="space-y-2">
              <Label className="text-text-secondary text-xs font-semibold">Chief Complaints</Label>
              <Textarea value={chiefComplaints} onChange={(e) => setChiefComplaints(e.target.value)} className="bg-surface border-border-light text-text-primary focus:ring-blue-500 resize-none min-h-[80px]" />
            </div>

            {/* Known Allergies (physio) */}
            {consultationType === "physiotherapy" && (
              <div className="space-y-2">
                <Label className="text-text-secondary text-xs font-semibold">Known Allergies</Label>
                <Input value={knownAllergies} onChange={(e) => setKnownAllergies(e.target.value)} placeholder="e.g., NSAIDS, Latex, None known" className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
              </div>
            )}

            {/* History of Presenting Illness (physio) */}
            {consultationType === "physiotherapy" && (
              <div className="space-y-2">
                <Label className="text-text-secondary text-xs font-semibold">History of Presenting Illness</Label>
                <Textarea value={historyPresentingIllness} onChange={(e) => setHistoryPresentingIllness(e.target.value)} placeholder="Detailed history of the presenting complaint..." className="bg-surface border-border-light text-text-primary focus:ring-blue-500 resize-none min-h-[80px]" />
              </div>
            )}

            {/* Pain History (physio) */}
            {consultationType === "physiotherapy" && (
              <div className="bg-surface-secondary p-5 rounded-xl border border-border-light">
                <p className="text-xs font-bold text-text-primary mb-3 border-b border-border-light pb-2">Pain History</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Site</Label>
                    <Input value={painSite} onChange={(e) => setPainSite(e.target.value)} placeholder="e.g., Lumbar spine" className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Side</Label>
                    <Select value={painSide} onValueChange={(v) => v && setPainSide(v)}>
                      <SelectTrigger className="bg-surface border-border-light text-text-primary focus:ring-blue-500"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent className="bg-surface border-border-light">
                        <SelectItem value="Right">Right</SelectItem>
                        <SelectItem value="Left">Left</SelectItem>
                        <SelectItem value="Bilateral">Bilateral</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Onset</Label>
                    <Select value={painOnset} onValueChange={(v) => v && setPainOnset(v)}>
                      <SelectTrigger className="bg-surface border-border-light text-text-primary focus:ring-blue-500"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent className="bg-surface border-border-light">
                        <SelectItem value="Sudden">Sudden</SelectItem>
                        <SelectItem value="Gradual">Gradual</SelectItem>
                        <SelectItem value="Insidious">Insidious</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Duration</Label>
                    <Select value={painDuration} onValueChange={(v) => v && setPainDuration(v)}>
                      <SelectTrigger className="bg-surface border-border-light text-text-primary focus:ring-blue-500"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent className="bg-surface border-border-light">
                        <SelectItem value="Acute">Acute</SelectItem>
                        <SelectItem value="Chronic">Chronic</SelectItem>
                        <SelectItem value="Acute on Chronic">Acute on Chronic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Frequency</Label>
                    <Select value={painFrequency} onValueChange={(v) => v && setPainFrequency(v)}>
                      <SelectTrigger className="bg-surface border-border-light text-text-primary focus:ring-blue-500"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent className="bg-surface border-border-light">
                        <SelectItem value="Constant">Constant</SelectItem>
                        <SelectItem value="Intermittent">Intermittent</SelectItem>
                        <SelectItem value="On activity">On activity</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Intensity</Label>
                    <Input value={painIntensity} onChange={(e) => setPainIntensity(e.target.value)} placeholder="e.g., Moderate" className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Pain at Rest (NRS 0-10)</Label>
                    <Input value={painAtRest} onChange={(e) => setPainAtRest(e.target.value)} placeholder="0-10" type="number" min="0" max="10" className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Pain on Movement (NRS 0-10)</Label>
                    <Input value={painOnMovement} onChange={(e) => setPainOnMovement(e.target.value)} placeholder="0-10" type="number" min="0" max="10" className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Aggravating Factors</Label>
                    <Input value={aggravatingFactors} onChange={(e) => setAggravatingFactors(e.target.value)} placeholder="e.g., Prolonged sitting, bending" className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Relieving Factors</Label>
                    <Input value={relievingFactors} onChange={(e) => setRelievingFactors(e.target.value)} placeholder="e.g., Rest, medication" className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                  </div>
                </div>
              </div>
            )}

            {/* Medical History */}
            <div className="bg-surface-secondary p-5 rounded-xl border border-border-light">
              <p className="text-xs font-bold text-text-primary mb-3 border-b border-border-light pb-2">Medical History</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-text-secondary text-xs font-semibold">Past Medical History</Label>
                  <Textarea value={pastMedicalHistory} onChange={(e) => setPastMedicalHistory(e.target.value)} className="bg-surface border-border-light text-text-primary focus:ring-blue-500 resize-none min-h-[70px]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-text-secondary text-xs font-semibold">Past Surgical History</Label>
                  <Textarea value={pastSurgicalHistory} onChange={(e) => setPastSurgicalHistory(e.target.value)} className="bg-surface border-border-light text-text-primary focus:ring-blue-500 resize-none min-h-[70px]" />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Label className="text-text-secondary text-xs font-semibold">Current Medications</Label>
                <Textarea value={currentMedications} onChange={(e) => setCurrentMedications(e.target.value)} className="bg-surface border-border-light text-text-primary focus:ring-blue-500 resize-none min-h-[60px]" />
              </div>
            </div>

            {/* Family History (physio) */}
            {consultationType === "physiotherapy" && (
              <div className="space-y-2">
                <Label className="text-text-secondary text-xs font-semibold">Family History</Label>
                <Textarea value={familyHistory} onChange={(e) => setFamilyHistory(e.target.value)} placeholder="Relevant family medical history..." className="bg-surface border-border-light text-text-primary focus:ring-blue-500 resize-none min-h-[70px]" />
              </div>
            )}

            {/* Personal History */}
            <div className="bg-surface-secondary p-5 rounded-xl border border-border-light">
              <p className="text-xs font-bold text-text-primary mb-3 border-b border-border-light pb-2">Personal History</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-text-secondary text-xs font-semibold">Sleep</Label>
                  <Input value={sleep} onChange={(e) => setSleep(e.target.value)} placeholder="e.g., 7-8 hrs, disturbed, insomnia" className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                </div>
                <div className="space-y-2">
                  <Label className="text-text-secondary text-xs font-semibold">Diet & Appetite</Label>
                  <Input value={dietAppetite} onChange={(e) => setDietAppetite(e.target.value)} placeholder="e.g., Vegetarian, normal appetite" className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                </div>
                <div className="space-y-2">
                  <Label className="text-text-secondary text-xs font-semibold">Bowel / Bladder</Label>
                  <Input value={bowelBladder} onChange={(e) => setBowelBladder(e.target.value)} placeholder="e.g., Regular, no issues" className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                </div>
                <div className="space-y-2">
                  <Label className="text-text-secondary text-xs font-semibold">Others</Label>
                  <Input value={personalOthers} onChange={(e) => setPersonalOthers(e.target.value)} placeholder="e.g., Smoking, alcohol use" className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                </div>
              </div>
            </div>

            {/* Substance Use (physio) */}
            {consultationType === "physiotherapy" && (
              <div className="bg-surface-secondary p-5 rounded-xl border border-border-light">
                <p className="text-xs font-bold text-text-primary mb-3 border-b border-border-light pb-2">Substance Use</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Smoking</Label>
                    <Input value={smokingFreq} onChange={(e) => setSmokingFreq(e.target.value)} placeholder="Frequency / None" className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Alcohol</Label>
                    <Input value={alcoholFreq} onChange={(e) => setAlcoholFreq(e.target.value)} placeholder="Frequency / None" className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Tobacco</Label>
                    <Input value={tobaccoFreq} onChange={(e) => setTobaccoFreq(e.target.value)} placeholder="Frequency / None" className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Other</Label>
                    <Input value={otherSubstanceFreq} onChange={(e) => setOtherSubstanceFreq(e.target.value)} placeholder="Specify" className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                  </div>
                </div>
              </div>
            )}

            {/* Investigations (physio) */}
            {consultationType === "physiotherapy" && (
              <div className="space-y-2">
                <Label className="text-text-secondary text-xs font-semibold">Investigations</Label>
                <Textarea value={investigations} onChange={(e) => setInvestigations(e.target.value)} placeholder="X-ray, MRI, blood reports etc." className="bg-surface border-border-light text-text-primary focus:ring-blue-500 resize-none min-h-[70px]" />
              </div>
            )}

            {/* Provisional Diagnosis (physio) OR Diagnosis (physician) */}
            {consultationType === "physiotherapy" ? (
              <div className="space-y-2">
                <Label className="text-text-secondary text-xs font-semibold">Provisional Diagnosis</Label>
                <Textarea value={provisionalDiagnosis} onChange={(e) => setProvisionalDiagnosis(e.target.value)} className="bg-surface border-border-light text-text-primary focus:ring-blue-500 resize-none min-h-[80px]" />
              </div>
            ) : null}

            {/* =========== PHYSIOTHERAPY EXAMINATION SECTION =========== */}
            {consultationType === "physiotherapy" && (
              <div className="space-y-6">
                <div className="border-t-2 border-blue-200 pt-4">
                  <p className="text-sm font-black text-text-primary uppercase tracking-wider mb-4">Examination</p>
                </div>

                {/* Posture Assessment */}
                <div className="bg-surface-secondary p-5 rounded-xl border border-border-light">
                  <p className="text-xs font-bold text-text-primary mb-3 border-b border-border-light pb-2">Posture Assessment</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Anterior View</Label>
                      <Input value={postureAnterior} onChange={(e) => setPostureAnterior(e.target.value)} placeholder="Observations" className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Lateral View</Label>
                      <Input value={postureLateral} onChange={(e) => setPostureLateral(e.target.value)} placeholder="Observations" className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Posterior View</Label>
                      <Input value={posturePosterior} onChange={(e) => setPosturePosterior(e.target.value)} placeholder="Observations" className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                    </div>
                  </div>
                </div>

                {/* Soft Tissue Examination */}
                <div className="bg-surface-secondary p-5 rounded-xl border border-border-light">
                  <p className="text-xs font-bold text-text-primary mb-3 border-b border-border-light pb-2">Soft Tissue Examination</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Site</Label>
                      <Input value={steSite} onChange={(e) => setSteSite(e.target.value)} className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Side</Label>
                      <Select value={steSide} onValueChange={(v) => v && setSteSide(v)}>
                        <SelectTrigger className="bg-surface border-border-light text-text-primary focus:ring-blue-500"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent className="bg-surface border-border-light">
                          <SelectItem value="Right">Right</SelectItem>
                          <SelectItem value="Left">Left</SelectItem>
                          <SelectItem value="Bilateral">Bilateral</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Warmth</Label>
                      <Select value={steWarmth} onValueChange={(v) => v && setSteWarmth(v)}>
                        <SelectTrigger className="bg-surface border-border-light text-text-primary focus:ring-blue-500"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent className="bg-surface border-border-light">
                          <SelectItem value="Present">Present</SelectItem>
                          <SelectItem value="Absent">Absent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Tenderness</Label>
                      <Select value={steTenderness} onValueChange={(v) => v && setSteTenderness(v)}>
                        <SelectTrigger className="bg-surface border-border-light text-text-primary focus:ring-blue-500"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent className="bg-surface border-border-light">
                          <SelectItem value="Present">Present</SelectItem>
                          <SelectItem value="N/A">N/A</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {steTenderness === "Present" && (
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Tenderness Grade</Label>
                        <Select value={steTendernessGrade} onValueChange={(v) => v && setSteTendernessGrade(v)}>
                          <SelectTrigger className="bg-surface border-border-light text-text-primary focus:ring-blue-500"><SelectValue placeholder="Grade" /></SelectTrigger>
                          <SelectContent className="bg-surface border-border-light">
                            <SelectItem value="Grade I">Grade I</SelectItem>
                            <SelectItem value="Grade II">Grade II</SelectItem>
                            <SelectItem value="Grade III">Grade III</SelectItem>
                            <SelectItem value="Grade IV">Grade IV</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Edema</Label>
                      <Select value={steEdema} onValueChange={(v) => v && setSteEdema(v)}>
                        <SelectTrigger className="bg-surface border-border-light text-text-primary focus:ring-blue-500"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent className="bg-surface border-border-light">
                          <SelectItem value="Pitting">Pitting</SelectItem>
                          <SelectItem value="Non-pitting">Non-pitting</SelectItem>
                          <SelectItem value="N/A">N/A</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="mt-4 space-y-1.5">
                    <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Observations</Label>
                    <Textarea value={steObservations} onChange={(e) => setSteObservations(e.target.value)} placeholder="Additional observations..." className="bg-surface border-border-light text-text-primary focus:ring-blue-500 resize-none min-h-[60px]" />
                  </div>
                </div>

                {/* Girth Measurement */}
                <div className="bg-surface-secondary p-5 rounded-xl border border-border-light">
                  <p className="text-xs font-bold text-text-primary mb-3 border-b border-border-light pb-2">Girth Measurement</p>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border-light">
                        <TableHead className="text-[10px] font-semibold text-text-tertiary uppercase">Site</TableHead>
                        <TableHead className="text-[10px] font-semibold text-text-tertiary uppercase">Right (cm)</TableHead>
                        <TableHead className="text-[10px] font-semibold text-text-tertiary uppercase">Left (cm)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {girthRows.map((row, i) => (
                        <TableRow key={i} className="border-border-light">
                          <TableCell className="py-1.5"><Input value={row.site} onChange={(e) => updateRow(girthRows, setGirthRows, i, "site", e.target.value)} className="bg-surface border-border-light text-text-primary h-8 text-xs" /></TableCell>
                          <TableCell className="py-1.5"><Input value={row.right} onChange={(e) => updateRow(girthRows, setGirthRows, i, "right", e.target.value)} className="bg-surface border-border-light text-text-primary h-8 text-xs" /></TableCell>
                          <TableCell className="py-1.5"><Input value={row.left} onChange={(e) => updateRow(girthRows, setGirthRows, i, "left", e.target.value)} className="bg-surface border-border-light text-text-primary h-8 text-xs" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Button type="button" variant="outline" size="sm" onClick={() => setGirthRows([...girthRows, emptyGirthRow()])} className="mt-2 text-xs h-7 border-border-light text-text-secondary">
                    <Plus className="h-3 w-3 mr-1" /> Add Row
                  </Button>
                </div>

                {/* Tightness Evaluation */}
                <div className="bg-surface-secondary p-5 rounded-xl border border-border-light">
                  <p className="text-xs font-bold text-text-primary mb-3 border-b border-border-light pb-2">Tightness Evaluation</p>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border-light">
                        <TableHead className="text-[10px] font-semibold text-text-tertiary uppercase">Muscle Group</TableHead>
                        <TableHead className="text-[10px] font-semibold text-text-tertiary uppercase">Right</TableHead>
                        <TableHead className="text-[10px] font-semibold text-text-tertiary uppercase">Left</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tightnessRows.map((row, i) => (
                        <TableRow key={i} className="border-border-light">
                          <TableCell className="py-1.5"><Input value={row.muscle} onChange={(e) => updateRow(tightnessRows, setTightnessRows, i, "muscle", e.target.value)} className="bg-surface border-border-light text-text-primary h-8 text-xs" /></TableCell>
                          <TableCell className="py-1.5">
                            <Select value={row.rightGrade} onValueChange={(v) => v && updateRow(tightnessRows, setTightnessRows, i, "rightGrade", v)}>
                              <SelectTrigger className="bg-surface border-border-light text-text-primary h-8 text-xs"><SelectValue placeholder="Grade" /></SelectTrigger>
                              <SelectContent className="bg-surface border-border-light">
                                <SelectItem value="Mild">Mild</SelectItem>
                                <SelectItem value="Moderate">Moderate</SelectItem>
                                <SelectItem value="Severe">Severe</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="py-1.5">
                            <Select value={row.leftGrade} onValueChange={(v) => v && updateRow(tightnessRows, setTightnessRows, i, "leftGrade", v)}>
                              <SelectTrigger className="bg-surface border-border-light text-text-primary h-8 text-xs"><SelectValue placeholder="Grade" /></SelectTrigger>
                              <SelectContent className="bg-surface border-border-light">
                                <SelectItem value="Mild">Mild</SelectItem>
                                <SelectItem value="Moderate">Moderate</SelectItem>
                                <SelectItem value="Severe">Severe</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Button type="button" variant="outline" size="sm" onClick={() => setTightnessRows([...tightnessRows, emptyTightnessRow()])} className="mt-2 text-xs h-7 border-border-light text-text-secondary">
                    <Plus className="h-3 w-3 mr-1" /> Add Row
                  </Button>
                </div>

                {/* Range of Motion */}
                <div className="bg-surface-secondary p-5 rounded-xl border border-border-light">
                  <p className="text-xs font-bold text-text-primary mb-3 border-b border-border-light pb-2">Range of Motion (ROM)</p>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border-light">
                        <TableHead className="text-[10px] font-semibold text-text-tertiary uppercase">Joint</TableHead>
                        <TableHead className="text-[10px] font-semibold text-text-tertiary uppercase">Movement</TableHead>
                        <TableHead className="text-[10px] font-semibold text-text-tertiary uppercase">Right</TableHead>
                        <TableHead className="text-[10px] font-semibold text-text-tertiary uppercase">Left</TableHead>
                        <TableHead className="text-[10px] font-semibold text-text-tertiary uppercase">End Feel</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {romRows.map((row, i) => (
                        <TableRow key={i} className="border-border-light">
                          <TableCell className="py-1.5"><Input value={row.joint} onChange={(e) => updateRow(romRows, setRomRows, i, "joint", e.target.value)} className="bg-surface border-border-light text-text-primary h-8 text-xs" /></TableCell>
                          <TableCell className="py-1.5"><Input value={row.movement} onChange={(e) => updateRow(romRows, setRomRows, i, "movement", e.target.value)} className="bg-surface border-border-light text-text-primary h-8 text-xs" /></TableCell>
                          <TableCell className="py-1.5"><Input value={row.right} onChange={(e) => updateRow(romRows, setRomRows, i, "right", e.target.value)} className="bg-surface border-border-light text-text-primary h-8 text-xs" /></TableCell>
                          <TableCell className="py-1.5"><Input value={row.left} onChange={(e) => updateRow(romRows, setRomRows, i, "left", e.target.value)} className="bg-surface border-border-light text-text-primary h-8 text-xs" /></TableCell>
                          <TableCell className="py-1.5"><Input value={row.endFeel} onChange={(e) => updateRow(romRows, setRomRows, i, "endFeel", e.target.value)} className="bg-surface border-border-light text-text-primary h-8 text-xs" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Button type="button" variant="outline" size="sm" onClick={() => setRomRows([...romRows, emptyRomRow()])} className="mt-2 text-xs h-7 border-border-light text-text-secondary">
                    <Plus className="h-3 w-3 mr-1" /> Add Row
                  </Button>
                </div>

                {/* Manual Muscle Testing */}
                <div className="bg-surface-secondary p-5 rounded-xl border border-border-light">
                  <p className="text-xs font-bold text-text-primary mb-3 border-b border-border-light pb-2">Manual Muscle Testing (MMT)</p>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border-light">
                        <TableHead className="text-[10px] font-semibold text-text-tertiary uppercase">Joint</TableHead>
                        <TableHead className="text-[10px] font-semibold text-text-tertiary uppercase">Muscle Group</TableHead>
                        <TableHead className="text-[10px] font-semibold text-text-tertiary uppercase">Right</TableHead>
                        <TableHead className="text-[10px] font-semibold text-text-tertiary uppercase">Left</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mmtRows.map((row, i) => (
                        <TableRow key={i} className="border-border-light">
                          <TableCell className="py-1.5"><Input value={row.joint} onChange={(e) => updateRow(mmtRows, setMmtRows, i, "joint", e.target.value)} className="bg-surface border-border-light text-text-primary h-8 text-xs" /></TableCell>
                          <TableCell className="py-1.5"><Input value={row.muscleGroup} onChange={(e) => updateRow(mmtRows, setMmtRows, i, "muscleGroup", e.target.value)} className="bg-surface border-border-light text-text-primary h-8 text-xs" /></TableCell>
                          <TableCell className="py-1.5"><Input value={row.right} onChange={(e) => updateRow(mmtRows, setMmtRows, i, "right", e.target.value)} className="bg-surface border-border-light text-text-primary h-8 text-xs" /></TableCell>
                          <TableCell className="py-1.5"><Input value={row.left} onChange={(e) => updateRow(mmtRows, setMmtRows, i, "left", e.target.value)} className="bg-surface border-border-light text-text-primary h-8 text-xs" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Button type="button" variant="outline" size="sm" onClick={() => setMmtRows([...mmtRows, emptyMmtRow()])} className="mt-2 text-xs h-7 border-border-light text-text-secondary">
                    <Plus className="h-3 w-3 mr-1" /> Add Row
                  </Button>
                </div>

                {/* Neurological Examination */}
                <div className="bg-surface-secondary p-5 rounded-xl border border-border-light">
                  <p className="text-xs font-bold text-text-primary mb-3 border-b border-border-light pb-2">Neurological Examination</p>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border-light">
                        <TableHead className="text-[10px] font-semibold text-text-tertiary uppercase">Sensory Component</TableHead>
                        <TableHead className="text-[10px] font-semibold text-text-tertiary uppercase">Right</TableHead>
                        <TableHead className="text-[10px] font-semibold text-text-tertiary uppercase">Left</TableHead>
                        <TableHead className="text-[10px] font-semibold text-text-tertiary uppercase">Equality</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {neuroRows.map((row, i) => (
                        <TableRow key={i} className="border-border-light">
                          <TableCell className="py-1.5"><Input value={row.sensory} onChange={(e) => updateRow(neuroRows, setNeuroRows, i, "sensory", e.target.value)} className="bg-surface border-border-light text-text-primary h-8 text-xs" /></TableCell>
                          <TableCell className="py-1.5"><Input value={row.right} onChange={(e) => updateRow(neuroRows, setNeuroRows, i, "right", e.target.value)} className="bg-surface border-border-light text-text-primary h-8 text-xs" /></TableCell>
                          <TableCell className="py-1.5"><Input value={row.left} onChange={(e) => updateRow(neuroRows, setNeuroRows, i, "left", e.target.value)} className="bg-surface border-border-light text-text-primary h-8 text-xs" /></TableCell>
                          <TableCell className="py-1.5"><Input value={row.equality} onChange={(e) => updateRow(neuroRows, setNeuroRows, i, "equality", e.target.value)} className="bg-surface border-border-light text-text-primary h-8 text-xs" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Button type="button" variant="outline" size="sm" onClick={() => setNeuroRows([...neuroRows, emptyNeuroRow()])} className="mt-2 text-xs h-7 border-border-light text-text-secondary">
                    <Plus className="h-3 w-3 mr-1" /> Add Row
                  </Button>
                </div>

                {/* Deep Tendon Reflexes */}
                <div className="space-y-2">
                  <Label className="text-text-secondary text-xs font-semibold">Deep Tendon Reflexes</Label>
                  <Textarea value={deepTendonReflexes} onChange={(e) => setDeepTendonReflexes(e.target.value)} placeholder="Biceps, Triceps, Knee, Ankle..." className="bg-surface border-border-light text-text-primary focus:ring-blue-500 resize-none min-h-[70px]" />
                </div>

                {/* Observational Gait Analysis */}
                <div className="bg-surface-secondary p-5 rounded-xl border border-border-light">
                  <p className="text-xs font-bold text-text-primary mb-3 border-b border-border-light pb-2">Observational Gait Analysis</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Initial Contact</Label>
                      <Input value={gaitInitialContact} onChange={(e) => setGaitInitialContact(e.target.value)} className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Loading Response</Label>
                      <Input value={gaitLoadingResponse} onChange={(e) => setGaitLoadingResponse(e.target.value)} className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Mid-stance</Label>
                      <Input value={gaitMidStance} onChange={(e) => setGaitMidStance(e.target.value)} className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Terminal Stance</Label>
                      <Input value={gaitTerminalStance} onChange={(e) => setGaitTerminalStance(e.target.value)} className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Pre-swing</Label>
                      <Input value={gaitPreSwing} onChange={(e) => setGaitPreSwing(e.target.value)} className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Initial Swing</Label>
                      <Input value={gaitInitialSwing} onChange={(e) => setGaitInitialSwing(e.target.value)} className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Mid-swing</Label>
                      <Input value={gaitMidSwing} onChange={(e) => setGaitMidSwing(e.target.value)} className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold text-text-tertiary uppercase">Terminal Swing</Label>
                      <Input value={gaitTerminalSwing} onChange={(e) => setGaitTerminalSwing(e.target.value)} className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                    </div>
                  </div>
                </div>

                {/* Functional Assessment, Special Tests, Differential Diagnosis */}
                <div className="space-y-2">
                  <Label className="text-text-secondary text-xs font-semibold">Functional Assessment</Label>
                  <Textarea value={functionalAssessment} onChange={(e) => setFunctionalAssessment(e.target.value)} placeholder="Functional limitations and abilities..." className="bg-surface border-border-light text-text-primary focus:ring-blue-500 resize-none min-h-[70px]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-text-secondary text-xs font-semibold">Special Tests</Label>
                  <Textarea value={specialTests} onChange={(e) => setSpecialTests(e.target.value)} placeholder="Name of test - Result (Positive/Negative)..." className="bg-surface border-border-light text-text-primary focus:ring-blue-500 resize-none min-h-[70px]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-text-secondary text-xs font-semibold">Differential Diagnosis</Label>
                  <Textarea value={differentialDiagnosis} onChange={(e) => setDifferentialDiagnosis(e.target.value)} className="bg-surface border-border-light text-text-primary focus:ring-blue-500 resize-none min-h-[70px]" />
                </div>

                {/* Treatment Section (physio) */}
                <div className="bg-surface-secondary p-5 rounded-xl border border-border-light">
                  <p className="text-xs font-bold text-text-primary mb-3 border-b border-border-light pb-2">Treatment</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-text-secondary text-xs font-semibold">Initial Treatment</Label>
                      <Textarea value={initialTreatment} onChange={(e) => setInitialTreatment(e.target.value)} placeholder="Treatment provided in first session..." className="bg-surface border-border-light text-text-primary focus:ring-blue-500 resize-none min-h-[70px]" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-text-secondary text-xs font-semibold">Exercises</Label>
                      <Textarea value={exercises} onChange={(e) => setExercises(e.target.value)} placeholder="Prescribed exercises..." className="bg-surface border-border-light text-text-primary focus:ring-blue-500 resize-none min-h-[70px]" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-text-secondary text-xs font-semibold">Modality</Label>
                      <Input value={modality} onChange={(e) => setModality(e.target.value)} placeholder="e.g., TENS, Ultrasound, IFT" className="bg-surface border-border-light text-text-primary focus:ring-blue-500" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-text-secondary text-xs font-semibold">Adjunct</Label>
                      <Select value={adjunct} onValueChange={(v) => v && setAdjunct(v)}>
                        <SelectTrigger className="bg-surface border-border-light text-text-primary focus:ring-blue-500"><SelectValue placeholder="Select adjunct" /></SelectTrigger>
                        <SelectContent className="bg-surface border-border-light">
                          <SelectItem value="Taping">Taping</SelectItem>
                          <SelectItem value="Dry needling">Dry needling</SelectItem>
                          <SelectItem value="Cupping">Cupping</SelectItem>
                          <SelectItem value="None">None</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <Label className="text-text-secondary text-xs font-semibold">Therapist Notes</Label>
                    <Textarea value={therapistNotes} onChange={(e) => setTherapistNotes(e.target.value)} placeholder="Additional notes for the therapist..." className="bg-surface border-border-light text-text-primary focus:ring-blue-500 resize-none min-h-[70px]" />
                  </div>
                </div>
              </div>
            )}

            {/* Physician-only: Diagnosis & Plan */}
            {consultationType === "physician" && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-text-secondary text-xs font-semibold">Diagnosis</Label>
                    <Textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className="bg-surface border-border-light text-text-primary focus:ring-blue-500 resize-none min-h-[80px]" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-text-secondary text-xs font-semibold">Plan of Care & Advice</Label>
                    <Textarea value={planOfCare} onChange={(e) => setPlanOfCare(e.target.value)} className="bg-surface border-border-light text-text-primary focus:ring-blue-500 resize-none min-h-[80px]" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-text-secondary text-xs font-semibold">Treatment Protocol</Label>
                    <Input value={treatmentProtocol} onChange={(e) => setTreatmentProtocol(e.target.value)} className="bg-surface border-border-light text-text-primary focus:ring-blue-500 h-10" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-text-secondary text-xs font-semibold">Follow-up</Label>
                    <Input value={followUp} onChange={(e) => setFollowUp(e.target.value)} placeholder="e.g., 2 weeks" className="bg-surface border-border-light text-text-primary focus:ring-blue-500 h-10" />
                  </div>
                </div>
              </>
            )}

            {/* Physio: Plan of care & follow-up */}
            {consultationType === "physiotherapy" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-text-secondary text-xs font-semibold">Plan of Care & Advice</Label>
                  <Textarea value={planOfCare} onChange={(e) => setPlanOfCare(e.target.value)} className="bg-surface border-border-light text-text-primary focus:ring-blue-500 resize-none min-h-[80px]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-text-secondary text-xs font-semibold">Follow-up</Label>
                  <Input value={followUp} onChange={(e) => setFollowUp(e.target.value)} placeholder="e.g., 2 weeks" className="bg-surface border-border-light text-text-primary focus:ring-blue-500 h-10" />
                </div>
              </div>
            )}

            <div className="bg-blue-50 p-5 rounded-xl border border-blue-100 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-blue-900 text-xs font-bold uppercase tracking-wider">Recommended Sessions</Label>
                <Input value={recommendedSessions} onChange={(e) => setRecommendedSessions(e.target.value)} type="number" min="1" className="bg-surface border-blue-200 text-text-primary focus:ring-blue-500 h-10" placeholder="Number of sessions" />
              </div>
              {recommendedSessions && (
                <div className="flex items-center gap-3 pt-7">
                  <Checkbox checked={createPackage} onCheckedChange={(v) => setCreatePackage(v as boolean)} className="border-blue-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 h-5 w-5" />
                  <Label className="text-blue-800 text-sm font-semibold cursor-pointer" onClick={() => setCreatePackage(!createPackage)}>Automatically create treatment package</Label>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-border-light">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="mr-3 border-border-light text-text-secondary hover:bg-surface-secondary">Cancel</Button>
              <Button onClick={handleSubmit} disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm px-6">
                {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Committing...</> : "Commit Consultation"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog with Edit Mode */}
      <Dialog open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) setEditMode(false); }}>
        <DialogContent className="sm:max-w-3xl bg-surface border-border-light shadow-lg p-0 overflow-hidden w-full">
          {selectedConsultation && (() => {
            const vitals = parseJson(selectedConsultation.vitals);
            const comorbs = parseJson(selectedConsultation.comorbidities);
            const notes = parseJson(selectedConsultation.assessmentNotes ?? null);
            const isPhysio = notes?.consultationType === "physiotherapy";
            const exam = notes?.examination;
            return (
            <>
              <div className="bg-surface-secondary border-b border-border-light p-6">
                 <div className="flex items-center justify-between">
                   <div className="flex items-center gap-4">
                      <Avatar className="h-12 w-12 bg-blue-100 text-blue-700 font-bold text-lg flex items-center justify-center border border-blue-200">
                          {selectedConsultation.client.firstName[0]}{selectedConsultation.client.lastName[0]}
                      </Avatar>
                      <div>
                         <DialogTitle className="text-xl font-bold text-text-primary leading-tight">
                            {selectedConsultation.client.firstName} {selectedConsultation.client.lastName}
                         </DialogTitle>
                         <div className="flex items-center gap-3 mt-1.5 text-xs text-text-tertiary font-medium">
                            <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> {format(new Date(selectedConsultation.date), "dd MMM yyyy")}</span>
                            <span>&bull;</span>
                            <span className="flex items-center gap-1"><Stethoscope className="w-3.5 h-3.5" /> {isPhysio ? "PT." : "Dr."} {selectedConsultation.consultant.name}</span>
                            {isPhysio && <Badge className="bg-teal-50 text-teal-700 border border-teal-200 text-[10px] px-2 py-0 shadow-none">Physiotherapy</Badge>}
                         </div>
                      </div>
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

              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                 {/* Patient demographics */}
                 <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div><span className="font-semibold text-blue-600 block">Patient ID</span><span className="text-text-primary font-mono">{selectedConsultation.client.clientCode}</span></div>
                    <div><span className="font-semibold text-blue-600 block">Age</span><span className="text-text-primary">{selectedConsultation.client.age || "\u2014"}</span></div>
                    <div><span className="font-semibold text-blue-600 block">Sex</span><span className="text-text-primary">{selectedConsultation.client.sex || "\u2014"}</span></div>
                    <div><span className="font-semibold text-blue-600 block">Contact</span><span className="text-text-primary">{selectedConsultation.client.phone}</span></div>
                    {isPhysio && notes?.occupationSport && (
                      <div className="col-span-2"><span className="font-semibold text-blue-600 block">Occupation / Sport</span><span className="text-text-primary">{notes.occupationSport}</span></div>
                    )}
                    {isPhysio && notes?.attendingPhysiotherapist && (
                      <div className="col-span-2"><span className="font-semibold text-blue-600 block">Attending Physiotherapist</span><span className="text-text-primary">{notes.attendingPhysiotherapist}</span></div>
                    )}
                 </div>

                 <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-1">Service Performed</p>
                    <p className="text-sm font-semibold text-blue-900">{selectedConsultation.service.name}</p>
                 </div>

                 {/* Vitals Display */}
                 {vitals && (
                   <div className="bg-surface-secondary rounded-lg p-4 border border-border-light">
                     <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-2">Vitals</p>
                     <div className="grid grid-cols-3 md:grid-cols-7 gap-3 text-xs">
                       {vitals.weight && <div><span className="font-semibold text-text-tertiary block">Wt</span>{vitals.weight} kg</div>}
                       {vitals.height && <div><span className="font-semibold text-text-tertiary block">Ht</span>{vitals.height} cm</div>}
                       {vitals.bmi && <div><span className="font-semibold text-text-tertiary block">BMI</span>{vitals.bmi}</div>}
                       {vitals.pulseRate && <div><span className="font-semibold text-text-tertiary block">PR</span>{vitals.pulseRate} bpm</div>}
                       {vitals.spo2 && <div><span className="font-semibold text-text-tertiary block">SpO2</span>{vitals.spo2}%{vitals.spo2On ? ` on ${vitals.spo2On}` : ""}</div>}
                       {(vitals.bpSystolic || vitals.bpDiastolic) && <div><span className="font-semibold text-text-tertiary block">BP</span>{vitals.bpSystolic || "\u2014"}/{vitals.bpDiastolic || "\u2014"} mmHg</div>}
                     </div>
                   </div>
                 )}

                 {/* Comorbidities Display */}
                 {comorbs && (
                   <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                     <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-2">Comorbidities</p>
                     <div className="flex flex-wrap gap-1.5">
                       {COMORBIDITY_OPTIONS.filter(opt => comorbs[opt.key]).map(opt => (
                         <Badge key={opt.key} className="bg-amber-100 text-amber-800 border border-amber-300 text-xs px-2 py-0.5 shadow-none">{opt.label}</Badge>
                       ))}
                       {comorbs.otherDetails && <Badge className="bg-amber-100 text-amber-800 border border-amber-300 text-xs px-2 py-0.5 shadow-none">{comorbs.otherDetails}</Badge>}
                     </div>
                   </div>
                 )}

                 {/* Known Allergies (physio) */}
                 {isPhysio && notes?.knownAllergies && (
                   <div className="space-y-1">
                     <Label className="text-xs font-semibold text-text-tertiary uppercase">Known Allergies</Label>
                     <p className="text-sm text-text-primary bg-red-50 p-3 rounded-md border border-red-200">{notes.knownAllergies}</p>
                   </div>
                 )}

                 <div className="space-y-5">
                    {editMode ? (
                      <>
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold text-text-tertiary uppercase">Chief Complaints</Label>
                          <Textarea value={String(editData.chiefComplaints || "")} onChange={(e) => setEditData({ ...editData, chiefComplaints: e.target.value })} className="bg-surface border-border-light text-text-primary resize-none min-h-[80px]" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold text-text-tertiary uppercase">{isPhysio ? "Provisional Diagnosis" : "Diagnosis"}</Label>
                            <Textarea value={String(editData.diagnosis || "")} onChange={(e) => setEditData({ ...editData, diagnosis: e.target.value })} className="bg-surface border-border-light text-text-primary resize-none min-h-[80px]" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold text-text-tertiary uppercase">Plan of Care & Advice</Label>
                            <Textarea value={String(editData.planOfCare || "")} onChange={(e) => setEditData({ ...editData, planOfCare: e.target.value })} className="bg-surface border-border-light text-text-primary resize-none min-h-[80px]" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold text-text-tertiary uppercase">Treatment Protocol</Label>
                            <Input value={String(editData.treatmentProtocol || "")} onChange={(e) => setEditData({ ...editData, treatmentProtocol: e.target.value })} className="bg-surface border-border-light text-text-primary h-10" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold text-text-tertiary uppercase">Follow-up</Label>
                            <Input value={String(editData.followUp || "")} onChange={(e) => setEditData({ ...editData, followUp: e.target.value })} className="bg-surface border-border-light text-text-primary h-10" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold text-text-tertiary uppercase">Recommended Sessions</Label>
                          <Input type="number" min="1" value={String(editData.recommendedSessions || "")} onChange={(e) => setEditData({ ...editData, recommendedSessions: e.target.value })} className="bg-surface border-border-light text-text-primary h-10 max-w-32" />
                        </div>
                      </>
                    ) : (
                      <>
                        {selectedConsultation.chiefComplaints &&
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-text-tertiary uppercase">Chief Complaints</Label>
                            <p className="text-sm text-text-primary bg-surface-secondary p-3 rounded-md border border-border-light italic">{selectedConsultation.chiefComplaints}</p>
                          </div>
                        }

                        {/* Physio: History of Presenting Illness */}
                        {isPhysio && notes?.historyPresentingIllness && (
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-text-tertiary uppercase">History of Presenting Illness</Label>
                            <p className="text-sm text-text-primary bg-surface-secondary p-3 rounded-md border border-border-light">{notes.historyPresentingIllness}</p>
                          </div>
                        )}

                        {/* Physio: Pain History */}
                        {isPhysio && notes?.painHistory && (
                          <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-orange-700 mb-2">Pain History</p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                              {notes.painHistory.site && <div><span className="font-semibold text-orange-600 block">Site</span>{notes.painHistory.site}</div>}
                              {notes.painHistory.side && <div><span className="font-semibold text-orange-600 block">Side</span>{notes.painHistory.side}</div>}
                              {notes.painHistory.onset && <div><span className="font-semibold text-orange-600 block">Onset</span>{notes.painHistory.onset}</div>}
                              {notes.painHistory.duration && <div><span className="font-semibold text-orange-600 block">Duration</span>{notes.painHistory.duration}</div>}
                              {notes.painHistory.frequency && <div><span className="font-semibold text-orange-600 block">Frequency</span>{notes.painHistory.frequency}</div>}
                              {notes.painHistory.intensity && <div><span className="font-semibold text-orange-600 block">Intensity</span>{notes.painHistory.intensity}</div>}
                              {notes.painHistory.painAtRest && <div><span className="font-semibold text-orange-600 block">Pain at Rest (NRS)</span>{notes.painHistory.painAtRest}/10</div>}
                              {notes.painHistory.painOnMovement && <div><span className="font-semibold text-orange-600 block">Pain on Movement (NRS)</span>{notes.painHistory.painOnMovement}/10</div>}
                              {notes.painHistory.aggravatingFactors && <div className="col-span-2"><span className="font-semibold text-orange-600 block">Aggravating Factors</span>{notes.painHistory.aggravatingFactors}</div>}
                              {notes.painHistory.relievingFactors && <div className="col-span-2"><span className="font-semibold text-orange-600 block">Relieving Factors</span>{notes.painHistory.relievingFactors}</div>}
                            </div>
                          </div>
                        )}

                        {/* Physio: Family History */}
                        {isPhysio && notes?.familyHistory && (
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-text-tertiary uppercase">Family History</Label>
                            <p className="text-sm text-text-primary bg-surface-secondary p-3 rounded-md border border-border-light">{notes.familyHistory}</p>
                          </div>
                        )}

                        {/* Physio: Substance Use */}
                        {isPhysio && notes?.substanceUse && Object.values(notes.substanceUse).some(Boolean) && (
                          <div className="bg-surface-secondary rounded-lg p-4 border border-border-light">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-2">Substance Use</p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                              {notes.substanceUse.smoking && <div><span className="font-semibold text-text-tertiary block">Smoking</span>{notes.substanceUse.smoking}</div>}
                              {notes.substanceUse.alcohol && <div><span className="font-semibold text-text-tertiary block">Alcohol</span>{notes.substanceUse.alcohol}</div>}
                              {notes.substanceUse.tobacco && <div><span className="font-semibold text-text-tertiary block">Tobacco</span>{notes.substanceUse.tobacco}</div>}
                              {notes.substanceUse.other && <div><span className="font-semibold text-text-tertiary block">Other</span>{notes.substanceUse.other}</div>}
                            </div>
                          </div>
                        )}

                        {/* Physio: Investigations */}
                        {isPhysio && notes?.investigations && (
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-text-tertiary uppercase">Investigations</Label>
                            <p className="text-sm text-text-primary bg-surface-secondary p-3 rounded-md border border-border-light">{notes.investigations}</p>
                          </div>
                        )}

                        {selectedConsultation.diagnosis &&
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-text-tertiary uppercase">{isPhysio ? "Provisional Diagnosis" : "Diagnosis"}</Label>
                            <p className="text-sm text-text-primary font-medium">{selectedConsultation.diagnosis}</p>
                          </div>
                        }

                        {/* ===== Physio Examination Data ===== */}
                        {isPhysio && exam && (
                          <div className="space-y-5 border-t-2 border-teal-200 pt-4">
                            <p className="text-xs font-black text-text-primary uppercase tracking-wider">Examination</p>

                            {/* Posture */}
                            {exam.posture && (exam.posture.anterior || exam.posture.lateral || exam.posture.posterior) && (
                              <div className="bg-surface-secondary rounded-lg p-4 border border-border-light">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-2">Posture Assessment</p>
                                <div className="grid grid-cols-3 gap-3 text-xs">
                                  {exam.posture.anterior && <div><span className="font-semibold text-text-tertiary block">Anterior</span>{exam.posture.anterior}</div>}
                                  {exam.posture.lateral && <div><span className="font-semibold text-text-tertiary block">Lateral</span>{exam.posture.lateral}</div>}
                                  {exam.posture.posterior && <div><span className="font-semibold text-text-tertiary block">Posterior</span>{exam.posture.posterior}</div>}
                                </div>
                              </div>
                            )}

                            {/* Soft Tissue */}
                            {exam.softTissue && (exam.softTissue.site || exam.softTissue.warmth || exam.softTissue.tenderness) && (
                              <div className="bg-surface-secondary rounded-lg p-4 border border-border-light">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-2">Soft Tissue Examination</p>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                  {exam.softTissue.site && <div><span className="font-semibold text-text-tertiary block">Site</span>{exam.softTissue.site}</div>}
                                  {exam.softTissue.side && <div><span className="font-semibold text-text-tertiary block">Side</span>{exam.softTissue.side}</div>}
                                  {exam.softTissue.warmth && <div><span className="font-semibold text-text-tertiary block">Warmth</span>{exam.softTissue.warmth}</div>}
                                  {exam.softTissue.tenderness && <div><span className="font-semibold text-text-tertiary block">Tenderness</span>{exam.softTissue.tenderness}{exam.softTissue.tendernessGrade ? ` (${exam.softTissue.tendernessGrade})` : ""}</div>}
                                  {exam.softTissue.edema && <div><span className="font-semibold text-text-tertiary block">Edema</span>{exam.softTissue.edema}</div>}
                                  {exam.softTissue.observations && <div className="col-span-2"><span className="font-semibold text-text-tertiary block">Observations</span>{exam.softTissue.observations}</div>}
                                </div>
                              </div>
                            )}

                            {/* Girth Measurement */}
                            {exam.girthMeasurement?.length > 0 && (
                              <div className="bg-surface-secondary rounded-lg p-4 border border-border-light">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-2">Girth Measurement</p>
                                <Table>
                                  <TableHeader><TableRow className="border-border-light"><TableHead className="text-[10px] text-text-tertiary">Site</TableHead><TableHead className="text-[10px] text-text-tertiary">Right</TableHead><TableHead className="text-[10px] text-text-tertiary">Left</TableHead></TableRow></TableHeader>
                                  <TableBody>{exam.girthMeasurement.map((r: { site: string; right: string; left: string }, i: number) => (
                                    <TableRow key={i} className="border-border-light text-xs"><TableCell>{r.site}</TableCell><TableCell>{r.right}</TableCell><TableCell>{r.left}</TableCell></TableRow>
                                  ))}</TableBody>
                                </Table>
                              </div>
                            )}

                            {/* Tightness */}
                            {exam.tightnessEvaluation?.length > 0 && (
                              <div className="bg-surface-secondary rounded-lg p-4 border border-border-light">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-2">Tightness Evaluation</p>
                                <Table>
                                  <TableHeader><TableRow className="border-border-light"><TableHead className="text-[10px] text-text-tertiary">Muscle</TableHead><TableHead className="text-[10px] text-text-tertiary">Right</TableHead><TableHead className="text-[10px] text-text-tertiary">Left</TableHead></TableRow></TableHeader>
                                  <TableBody>{exam.tightnessEvaluation.map((r: { muscle: string; rightGrade: string; leftGrade: string }, i: number) => (
                                    <TableRow key={i} className="border-border-light text-xs"><TableCell>{r.muscle}</TableCell><TableCell>{r.rightGrade}</TableCell><TableCell>{r.leftGrade}</TableCell></TableRow>
                                  ))}</TableBody>
                                </Table>
                              </div>
                            )}

                            {/* ROM */}
                            {exam.rangeOfMotion?.length > 0 && (
                              <div className="bg-surface-secondary rounded-lg p-4 border border-border-light">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-2">Range of Motion</p>
                                <Table>
                                  <TableHeader><TableRow className="border-border-light"><TableHead className="text-[10px] text-text-tertiary">Joint</TableHead><TableHead className="text-[10px] text-text-tertiary">Movement</TableHead><TableHead className="text-[10px] text-text-tertiary">Right</TableHead><TableHead className="text-[10px] text-text-tertiary">Left</TableHead><TableHead className="text-[10px] text-text-tertiary">End Feel</TableHead></TableRow></TableHeader>
                                  <TableBody>{exam.rangeOfMotion.map((r: { joint: string; movement: string; right: string; left: string; endFeel: string }, i: number) => (
                                    <TableRow key={i} className="border-border-light text-xs"><TableCell>{r.joint}</TableCell><TableCell>{r.movement}</TableCell><TableCell>{r.right}</TableCell><TableCell>{r.left}</TableCell><TableCell>{r.endFeel}</TableCell></TableRow>
                                  ))}</TableBody>
                                </Table>
                              </div>
                            )}

                            {/* MMT */}
                            {exam.manualMuscleTesting?.length > 0 && (
                              <div className="bg-surface-secondary rounded-lg p-4 border border-border-light">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-2">Manual Muscle Testing</p>
                                <Table>
                                  <TableHeader><TableRow className="border-border-light"><TableHead className="text-[10px] text-text-tertiary">Joint</TableHead><TableHead className="text-[10px] text-text-tertiary">Muscle Group</TableHead><TableHead className="text-[10px] text-text-tertiary">Right</TableHead><TableHead className="text-[10px] text-text-tertiary">Left</TableHead></TableRow></TableHeader>
                                  <TableBody>{exam.manualMuscleTesting.map((r: { joint: string; muscleGroup: string; right: string; left: string }, i: number) => (
                                    <TableRow key={i} className="border-border-light text-xs"><TableCell>{r.joint}</TableCell><TableCell>{r.muscleGroup}</TableCell><TableCell>{r.right}</TableCell><TableCell>{r.left}</TableCell></TableRow>
                                  ))}</TableBody>
                                </Table>
                              </div>
                            )}

                            {/* Neurological */}
                            {exam.neurological?.length > 0 && (
                              <div className="bg-surface-secondary rounded-lg p-4 border border-border-light">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-2">Neurological Examination</p>
                                <Table>
                                  <TableHeader><TableRow className="border-border-light"><TableHead className="text-[10px] text-text-tertiary">Sensory</TableHead><TableHead className="text-[10px] text-text-tertiary">Right</TableHead><TableHead className="text-[10px] text-text-tertiary">Left</TableHead><TableHead className="text-[10px] text-text-tertiary">Equality</TableHead></TableRow></TableHeader>
                                  <TableBody>{exam.neurological.map((r: { sensory: string; right: string; left: string; equality: string }, i: number) => (
                                    <TableRow key={i} className="border-border-light text-xs"><TableCell>{r.sensory}</TableCell><TableCell>{r.right}</TableCell><TableCell>{r.left}</TableCell><TableCell>{r.equality}</TableCell></TableRow>
                                  ))}</TableBody>
                                </Table>
                              </div>
                            )}

                            {/* DTR */}
                            {exam.deepTendonReflexes && (
                              <div className="space-y-1">
                                <Label className="text-xs font-semibold text-text-tertiary uppercase">Deep Tendon Reflexes</Label>
                                <p className="text-sm text-text-primary bg-surface-secondary p-3 rounded-md border border-border-light">{exam.deepTendonReflexes}</p>
                              </div>
                            )}

                            {/* Gait Analysis */}
                            {exam.gaitAnalysis && Object.values(exam.gaitAnalysis).some(Boolean) && (
                              <div className="bg-surface-secondary rounded-lg p-4 border border-border-light">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-2">Observational Gait Analysis</p>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                  {exam.gaitAnalysis.initialContact && <div><span className="font-semibold text-text-tertiary block">Initial Contact</span>{exam.gaitAnalysis.initialContact}</div>}
                                  {exam.gaitAnalysis.loadingResponse && <div><span className="font-semibold text-text-tertiary block">Loading Response</span>{exam.gaitAnalysis.loadingResponse}</div>}
                                  {exam.gaitAnalysis.midStance && <div><span className="font-semibold text-text-tertiary block">Mid-stance</span>{exam.gaitAnalysis.midStance}</div>}
                                  {exam.gaitAnalysis.terminalStance && <div><span className="font-semibold text-text-tertiary block">Terminal Stance</span>{exam.gaitAnalysis.terminalStance}</div>}
                                  {exam.gaitAnalysis.preSwing && <div><span className="font-semibold text-text-tertiary block">Pre-swing</span>{exam.gaitAnalysis.preSwing}</div>}
                                  {exam.gaitAnalysis.initialSwing && <div><span className="font-semibold text-text-tertiary block">Initial Swing</span>{exam.gaitAnalysis.initialSwing}</div>}
                                  {exam.gaitAnalysis.midSwing && <div><span className="font-semibold text-text-tertiary block">Mid-swing</span>{exam.gaitAnalysis.midSwing}</div>}
                                  {exam.gaitAnalysis.terminalSwing && <div><span className="font-semibold text-text-tertiary block">Terminal Swing</span>{exam.gaitAnalysis.terminalSwing}</div>}
                                </div>
                              </div>
                            )}

                            {/* Functional Assessment */}
                            {exam.functionalAssessment && (
                              <div className="space-y-1">
                                <Label className="text-xs font-semibold text-text-tertiary uppercase">Functional Assessment</Label>
                                <p className="text-sm text-text-primary bg-surface-secondary p-3 rounded-md border border-border-light">{exam.functionalAssessment}</p>
                              </div>
                            )}

                            {/* Special Tests */}
                            {exam.specialTests && (
                              <div className="space-y-1">
                                <Label className="text-xs font-semibold text-text-tertiary uppercase">Special Tests</Label>
                                <p className="text-sm text-text-primary bg-surface-secondary p-3 rounded-md border border-border-light">{exam.specialTests}</p>
                              </div>
                            )}

                            {/* Differential Diagnosis */}
                            {exam.differentialDiagnosis && (
                              <div className="space-y-1">
                                <Label className="text-xs font-semibold text-text-tertiary uppercase">Differential Diagnosis</Label>
                                <p className="text-sm text-text-primary bg-surface-secondary p-3 rounded-md border border-border-light">{exam.differentialDiagnosis}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Physio Treatment section */}
                        {isPhysio && notes?.physioTreatment && Object.values(notes.physioTreatment).some(Boolean) && (
                          <div className="bg-teal-50 rounded-lg p-4 border border-teal-200">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700 mb-2">Treatment</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                              {notes.physioTreatment.initialTreatment && <div><span className="font-semibold text-teal-600 block">Initial Treatment</span>{notes.physioTreatment.initialTreatment}</div>}
                              {notes.physioTreatment.exercises && <div><span className="font-semibold text-teal-600 block">Exercises</span>{notes.physioTreatment.exercises}</div>}
                              {notes.physioTreatment.modality && <div><span className="font-semibold text-teal-600 block">Modality</span>{notes.physioTreatment.modality}</div>}
                              {notes.physioTreatment.adjunct && <div><span className="font-semibold text-teal-600 block">Adjunct</span>{notes.physioTreatment.adjunct}</div>}
                              {notes.physioTreatment.therapistNotes && <div className="col-span-2"><span className="font-semibold text-teal-600 block">Therapist Notes</span>{notes.physioTreatment.therapistNotes}</div>}
                            </div>
                          </div>
                        )}

                        {selectedConsultation.planOfCare &&
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-text-tertiary uppercase">Plan of Care & Advice</Label>
                            <p className="text-sm text-text-primary bg-surface-secondary p-3 rounded-md border border-border-light">{selectedConsultation.planOfCare}</p>
                          </div>
                        }
                        {selectedConsultation.treatmentProtocol && !isPhysio &&
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-text-tertiary uppercase">Treatment Protocol</Label>
                            <p className="text-sm text-text-primary bg-surface-secondary p-3 rounded-md border border-border-light">{selectedConsultation.treatmentProtocol}</p>
                          </div>
                        }
                        {selectedConsultation.followUp &&
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-text-tertiary uppercase">Follow-up</Label>
                            <p className="text-sm text-text-primary font-medium">{selectedConsultation.followUp}</p>
                          </div>
                        }
                      </>
                    )}
                 </div>

                 {selectedConsultation.recommendedSessions && !editMode && (
                 <div className="border-t border-border-light pt-5 mt-5">
                   <div className="flex items-center justify-between bg-green-50 border border-green-100 p-4 rounded-xl">
                      <div>
                         <p className="text-xs font-bold text-green-800 uppercase tracking-wider mb-1">Recommended Sessions</p>
                         <p className="text-2xl font-black text-green-700">{selectedConsultation.recommendedSessions} <span className="text-green-600/60 text-sm font-medium">sessions</span></p>
                      </div>
                      <div className="text-right">
                         {(selectedConsultation.packages?.length ?? 0) > 0 ? (
                           <Badge className="bg-green-600 text-white border-0">Package Created</Badge>
                         ) : (
                           <Badge variant="outline" className="bg-surface text-text-secondary border-border-light">No Package</Badge>
                         )}
                      </div>
                   </div>
                 </div>
                 )}
              </div>
            </>
          );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
