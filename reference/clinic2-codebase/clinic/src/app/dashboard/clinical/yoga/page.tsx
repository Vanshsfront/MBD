"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Sparkles, Plus, Save, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

import {
  type ClientLite,
  type ConsultationItem,
  type ServiceLite,
  TEMPLATE_DEPARTMENT,
  TEMPLATE_LABEL,
  parseNotes,
} from "../_shared";

const TEMPLATE = "yoga" as const;

type YN = "yes" | "no" | "";

export default function YogaPage() {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? "";

  const [clients, setClients] = useState<ClientLite[]>([]);
  const [services, setServices] = useState<ServiceLite[]>([]);
  const [records, setRecords] = useState<ConsultationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [clientId, setClientId] = useState("");
  const [serviceId, setServiceId] = useState("");

  // Medical history
  const [condYn, setCondYn] = useState<YN>("");
  const [condDetails, setCondDetails] = useState("");
  const [injuryYn, setInjuryYn] = useState<YN>("");
  const [injuryDetails, setInjuryDetails] = useState("");
  const [medications, setMedications] = useState("");

  // Physical activity
  const [exerciseYn, setExerciseYn] = useState<YN>("");
  const [activityType, setActivityType] = useState("");
  const [daysPerWeek, setDaysPerWeek] = useState("");
  const [sleepQuality, setSleepQuality] = useState<"" | "poor" | "intermediate" | "good">("");
  const [stressLevel, setStressLevel] = useState<"" | "low" | "moderate" | "high">("");
  const [physicalLimitations, setPhysicalLimitations] = useState("");

  // Yoga experience
  const [practicedYn, setPracticedYn] = useState<YN>("");
  const [level, setLevel] = useState<"" | "beginner" | "intermediate" | "advanced">("");
  const [yogaType, setYogaType] = useState("");
  const [practiceDuration, setPracticeDuration] = useState("");

  // Goals
  const [goals, setGoals] = useState<string[]>(["", "", "", "", ""]);
  const [focusAreas, setFocusAreas] = useState("");
  const [sessionType, setSessionType] = useState<"" | "personal" | "duo" | "trio">("");

  // Consent
  const [consentTrue, setConsentTrue] = useState(false);
  const [consentDisclose, setConsentDisclose] = useState(false);
  const [consentNotMedical, setConsentNotMedical] = useState(false);

  // Therapist notes
  const [therapistNotes, setTherapistNotes] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [cRes, sRes, recRes] = await Promise.all([
          fetch("/api/clients?limit=200&assignedToMe=true"),
          fetch("/api/services"),
          fetch(`/api/consultations?type=${TEMPLATE}`),
        ]);
        const cJson = await cRes.json();
        const sJson = await sRes.json();
        const recJson = await recRes.json();
        setClients(cJson.clients ?? cJson ?? []);
        setServices(Array.isArray(sJson) ? sJson : []);
        setRecords(Array.isArray(recJson) ? recJson : []);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const departmentServices = useMemo(
    () => services.filter(s => s.department?.name === TEMPLATE_DEPARTMENT[TEMPLATE]),
    [services]
  );

  const clientRecords = useMemo(
    () => records.reduce<Record<string, ConsultationItem[]>>((acc, r) => {
      (acc[r.client.id] ||= []).push(r);
      return acc;
    }, {}),
    [records]
  );

  function resetForm() {
    setClientId(""); setServiceId("");
    setCondYn(""); setCondDetails(""); setInjuryYn(""); setInjuryDetails(""); setMedications("");
    setExerciseYn(""); setActivityType(""); setDaysPerWeek(""); setSleepQuality(""); setStressLevel(""); setPhysicalLimitations("");
    setPracticedYn(""); setLevel(""); setYogaType(""); setPracticeDuration("");
    setGoals(["", "", "", "", ""]); setFocusAreas(""); setSessionType("");
    setConsentTrue(false); setConsentDisclose(false); setConsentNotMedical(false);
    setTherapistNotes("");
  }

  async function submit() {
    if (!clientId || !serviceId || !userId) {
      toast.error("Patient and service are required");
      return;
    }
    setSubmitting(true);
    try {
      const assessmentNotes = {
        consultationType: TEMPLATE,
        medicalHistory: {
          conditions: condYn || undefined,
          conditionDetails: condDetails || undefined,
          recentInjuryOrSurgery: injuryYn || undefined,
          recentInjuryDetails: injuryDetails || undefined,
          medications: medications || undefined,
        },
        lifestyle: {
          exerciseRegularly: exerciseYn || undefined,
          activityType: activityType || undefined,
          daysPerWeek: daysPerWeek || undefined,
          sleepQuality: sleepQuality || undefined,
          stressLevel: stressLevel || undefined,
          physicalLimitations: physicalLimitations || undefined,
        },
        yogaExperience: {
          everPracticed: practicedYn || undefined,
          level: level || undefined,
          typePracticed: yogaType || undefined,
          duration: practiceDuration || undefined,
        },
        goals: goals.filter(g => g.trim()),
        focusAreas: focusAreas || undefined,
        sessionType: sessionType || undefined,
        consent: {
          truthfulInformation: consentTrue,
          disclosureObligation: consentDisclose,
          notMedicalSubstitute: consentNotMedical,
        },
        therapistNotes: therapistNotes || undefined,
      };

      const res = await fetch("/api/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          serviceId,
          consultantId: userId,
          chiefComplaints: condDetails || injuryDetails || physicalLimitations || undefined,
          planOfCare: goals.filter(g => g.trim()).join("; ") || undefined,
          assessmentNotes,
          performedById: userId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Save failed");
      }
      const created: ConsultationItem = await res.json();
      setRecords(r => [created, ...r]);
      toast.success("Yoga record saved");
      setOpen(false);
      resetForm();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-600" /> {TEMPLATE_LABEL[TEMPLATE]}
          </h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            Fill per patient — each visit creates a separate medical record.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus className="h-4 w-4 mr-1.5" /> New Record
        </Button>
      </div>

      <div className="bg-surface rounded-xl border border-border-light p-5 space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">My Patients</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-text-tertiary"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : clients.length === 0 ? (
          <p className="text-sm text-text-tertiary">No patients assigned to you yet.</p>
        ) : (
          <div className="divide-y divide-border-light">
            {clients.map(c => {
              const list = clientRecords[c.id] ?? [];
              return (
                <div key={c.id} className="py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{c.firstName} {c.lastName} <span className="font-mono text-[11px] text-text-tertiary ml-2">{c.clientCode}</span></p>
                      <p className="text-xs text-text-tertiary">{c.phone}{c.age ? ` · ${c.age}y` : ""}{c.sex ? ` · ${c.sex}` : ""}</p>
                    </div>
                    <span className="text-xs text-text-tertiary bg-surface-secondary rounded-full px-2 py-0.5 border border-border-light">{list.length} record{list.length === 1 ? "" : "s"}</span>
                  </div>
                  {list.length > 0 && (
                    <div className="mt-2 space-y-1.5 pl-2">
                      {list.slice(0, 3).map(r => {
                        const notes = parseNotes(r.assessmentNotes) as { goals?: string[]; therapistNotes?: string };
                        const summary = (notes.goals ?? []).join(", ") || notes.therapistNotes || "—";
                        return (
                          <div key={r.id} className="text-xs flex items-start gap-3 bg-surface-secondary/40 rounded-md px-2.5 py-1.5">
                            <span className="text-text-tertiary shrink-0 w-20">{format(new Date(r.date), "dd MMM yyyy")}</span>
                            <span className="text-text-secondary line-clamp-2">{summary}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl bg-surface max-h-[88vh] overflow-y-auto">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-600" /> New Yoga Record
          </DialogTitle>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Patient *</Label>
                <Select value={clientId} onValueChange={v => v && setClientId(v)}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select patient">
                      {clientId ? (() => { const c = clients.find(x => x.id === clientId); return c ? `${c.firstName} ${c.lastName}` : null; })() : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName} ({c.clientCode})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Service *</Label>
                <Select value={serviceId} onValueChange={v => v && setServiceId(v)}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select service">
                      {serviceId ? departmentServices.find(s => s.id === serviceId)?.name : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {departmentServices.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-text-tertiary">No Yoga services configured.</div>
                    ) : departmentServices.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <section className="space-y-3">
              <h3 className="text-sm font-bold text-text-primary border-b border-border-light pb-1">Medical History</h3>
              <YesNoField label="Current or pre-existing medical condition?" value={condYn} onChange={setCondYn} color="emerald" />
              {condYn === "yes" && <Textarea value={condDetails} onChange={e => setCondDetails(e.target.value)} rows={2} placeholder="Details" />}
              <YesNoField label="Recent injuries or surgery?" value={injuryYn} onChange={setInjuryYn} color="emerald" />
              {injuryYn === "yes" && <Textarea value={injuryDetails} onChange={e => setInjuryDetails(e.target.value)} rows={2} placeholder="Details" />}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Current medications</Label>
                <Textarea value={medications} onChange={e => setMedications(e.target.value)} rows={2} />
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-bold text-text-primary border-b border-border-light pb-1">Physical Activity &amp; Lifestyle</h3>
              <YesNoField label="Do you exercise regularly?" value={exerciseYn} onChange={setExerciseYn} color="emerald" />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Type of activity</Label>
                  <Input value={activityType} onChange={e => setActivityType(e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Days per week</Label>
                  <Input type="number" min="0" max="7" value={daysPerWeek} onChange={e => setDaysPerWeek(e.target.value)} className="h-9 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ChoiceField label="Sleep Quality" value={sleepQuality} onChange={setSleepQuality} options={[["poor", "Poor"], ["intermediate", "Intermediate"], ["good", "Good"]]} color="emerald" />
                <ChoiceField label="Stress Level" value={stressLevel} onChange={setStressLevel} options={[["low", "Low"], ["moderate", "Moderate"], ["high", "High"]]} color="emerald" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Physical limitations or discomfort</Label>
                <Textarea value={physicalLimitations} onChange={e => setPhysicalLimitations(e.target.value)} rows={2} />
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-bold text-text-primary border-b border-border-light pb-1">Yoga Experience</h3>
              <YesNoField label="Have you ever practiced yoga?" value={practicedYn} onChange={setPracticedYn} color="emerald" />
              <div className="grid grid-cols-3 gap-3">
                <ChoiceField label="Level" value={level} onChange={setLevel} options={[["beginner", "Beginner"], ["intermediate", "Intermediate"], ["advanced", "Advanced"]]} color="emerald" />
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Type practiced</Label>
                  <Input value={yogaType} onChange={e => setYogaType(e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Duration of practice</Label>
                  <Input value={practiceDuration} onChange={e => setPracticeDuration(e.target.value)} className="h-9 text-sm" placeholder="e.g. 2 years" />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-bold text-text-primary border-b border-border-light pb-1">Goals &amp; Expectations</h3>
              {goals.map((g, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-text-tertiary w-4 shrink-0">{i + 1}.</span>
                  <Input value={g} onChange={e => setGoals(prev => prev.map((x, j) => j === i ? e.target.value : x))} className="h-9 text-sm" placeholder="Flexibility, stress relief, pain management…" />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Specific focus areas</Label>
                <Textarea value={focusAreas} onChange={e => setFocusAreas(e.target.value)} rows={2} />
              </div>
              <ChoiceField label="Preferred session type" value={sessionType} onChange={setSessionType} options={[["personal", "Personal (1:1)"], ["duo", "Group of Two"], ["trio", "Group of Three"]]} color="emerald" />
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-bold text-text-primary border-b border-border-light pb-1">Consent</h3>
              <ConsentRow checked={consentTrue} onChange={setConsentTrue} label="The information I have provided is true and complete. I understand yoga involves physical movement and exercise which may carry a risk of injury, and I agree to participate voluntarily and at my own risk." />
              <ConsentRow checked={consentDisclose} onChange={setConsentDisclose} label="It is my responsibility to disclose injuries, conditions, pain, or discomfort before and during sessions, and to stop any activity that causes pain." />
              <ConsentRow checked={consentNotMedical} onChange={setConsentNotMedical} label="Yoga instruction is not a substitute for medical treatment; I have been advised to consult a healthcare professional if needed." />
            </section>

            <section className="space-y-2">
              <Label className="text-xs font-semibold">Therapist Notes</Label>
              <Textarea value={therapistNotes} onChange={e => setTherapistNotes(e.target.value)} rows={3} />
            </section>

            <div className="flex justify-end gap-2 pt-4 border-t border-border-light">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}><X className="h-4 w-4 mr-1.5" /> Cancel</Button>
              <Button onClick={submit} disabled={submitting || !clientId || !serviceId} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save Record
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function YesNoField({ label, value, onChange, color }: { label: string; value: YN; onChange: (v: YN) => void; color: "emerald" | "rose" | "blue" }) {
  const active = color === "emerald" ? "bg-emerald-50 border-emerald-300 text-emerald-700"
    : color === "rose" ? "bg-rose-50 border-rose-300 text-rose-700"
    : "bg-blue-50 border-blue-300 text-blue-700";
  return (
    <div className="flex items-center gap-3">
      <Label className="text-xs font-semibold flex-1">{label}</Label>
      <div className="flex gap-2">
        {(["yes", "no"] as const).map(opt => (
          <button key={opt} type="button"
            onClick={() => onChange(value === opt ? "" : opt)}
            className={`h-8 px-3 rounded-md text-xs font-semibold border transition-colors ${value === opt ? active : "bg-surface border-border-light text-text-secondary hover:border-border"}`}
          >{opt === "yes" ? "Yes" : "No"}</button>
        ))}
      </div>
    </div>
  );
}

function ChoiceField<T extends string>({ label, value, onChange, options, color }: { label: string; value: T | ""; onChange: (v: T | "") => void; options: Array<[T, string]>; color: "emerald" | "rose" | "blue" }) {
  const active = color === "emerald" ? "bg-emerald-50 border-emerald-300 text-emerald-700"
    : color === "rose" ? "bg-rose-50 border-rose-300 text-rose-700"
    : "bg-blue-50 border-blue-300 text-blue-700";
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([k, l]) => (
          <button key={k} type="button"
            onClick={() => onChange(value === k ? "" : k)}
            className={`h-8 px-3 rounded-md text-xs font-semibold border transition-colors ${value === k ? active : "bg-surface border-border-light text-text-secondary hover:border-border"}`}
          >{l}</button>
        ))}
      </div>
    </div>
  );
}

function ConsentRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-start gap-2.5 text-xs text-text-secondary cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={v => onChange(v === true)} className="mt-0.5" />
      <span>{label}</span>
    </label>
  );
}
