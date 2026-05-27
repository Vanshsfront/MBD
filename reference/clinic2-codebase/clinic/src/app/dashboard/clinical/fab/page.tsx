"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Dumbbell, Plus, Save, Loader2, X } from "lucide-react";

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

const TEMPLATE = "fab" as const;
type YN = "yes" | "no" | "";

// Assessment battery components grouped by section, matching the PDF.
const BATTERY_GROUPS: Array<{ group: string; components: string[] }> = [
  { group: "Vitals", components: ["Heart Rate", "Blood Pressure", "SpO2"] },
  { group: "Body Composition", components: ["Height", "Weight", "BMI", "Limb Length (L, R)"] },
  { group: "Flexibility", components: ["Sit & Reach Test", "Back Scratch Test", "Ankle Dorsiflexion Test"] },
  { group: "Strength & Endurance", components: ["Push ups (60s)", "Squats (60s)", "Forearm Plank (till failure)"] },
  { group: "Aerobic Fitness", components: ["2-Min Step Test", "YMCA Step Test"] },
  { group: "Anaerobic Fitness", components: ["Sprint Test (Speed)", "Vertical Jump Test (FP)"] },
  { group: "Agility", components: ["T-Test"] },
  { group: "Reaction Time", components: ["Ruler Drop Test"] },
  { group: "Balance Test", components: ["Y-Balance Test"] },
];

type BatteryRow = {
  preResult: string; preInference: string;
  postResult: string; postInference: string;
  remarks: string;
};

function emptyBattery(): Record<string, BatteryRow> {
  const out: Record<string, BatteryRow> = {};
  for (const g of BATTERY_GROUPS) for (const c of g.components) out[c] = { preResult: "", preInference: "", postResult: "", postInference: "", remarks: "" };
  return out;
}

export default function FabPage() {
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

  // Medical & Injury Screening
  const [painInjuryYn, setPainInjuryYn] = useState<YN>("");
  const [painInjuryDetails, setPainInjuryDetails] = useState("");
  const [pastInjury, setPastInjury] = useState("");
  const [medicalYn, setMedicalYn] = useState<YN>("");
  const [medicalDetails, setMedicalDetails] = useState("");
  const [medications, setMedications] = useState("");

  // Training History
  const [trainsYn, setTrainsYn] = useState<YN>("");
  const [trainingExperience, setTrainingExperience] = useState("");
  const [trainingModality, setTrainingModality] = useState("");
  const [trainingDaysPerWeek, setTrainingDaysPerWeek] = useState("");
  const [trainingHours, setTrainingHours] = useState("");
  const [trainedWithCoachYn, setTrainedWithCoachYn] = useState<YN>("");

  // Health Status
  const [sleepQuality, setSleepQuality] = useState<"" | "poor" | "fair" | "good">("");
  const [sleepHours, setSleepHours] = useState("");
  const [stress, setStress] = useState<"" | "low" | "moderate" | "high">("");
  const [activityLevel, setActivityLevel] = useState<"" | "sedentary" | "lightly" | "moderately" | "very" | "athletic">("");
  const [appetite, setAppetite] = useState<"" | "poor" | "adequate" | "good" | "high">("");
  const [hydration, setHydration] = useState<"" | "low" | "moderate" | "high">("");
  const [hydrationLitres, setHydrationLitres] = useState("");
  const [motivation, setMotivation] = useState<"" | "low" | "moderate" | "high">("");

  // Goals (6 per PDF)
  const [goals, setGoals] = useState<string[]>(["", "", "", "", "", ""]);

  // Battery
  const [preTestDate, setPreTestDate] = useState("");
  const [postTestDate, setPostTestDate] = useState("");
  const [battery, setBattery] = useState<Record<string, BatteryRow>>(() => emptyBattery());
  const [assessmentNotesText, setAssessmentNotesText] = useState("");

  // Consent
  const [consentTrue, setConsentTrue] = useState(false);
  const [consentDisclose, setConsentDisclose] = useState(false);
  const [consentNotMedical, setConsentNotMedical] = useState(false);

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
    setPainInjuryYn(""); setPainInjuryDetails(""); setPastInjury(""); setMedicalYn(""); setMedicalDetails(""); setMedications("");
    setTrainsYn(""); setTrainingExperience(""); setTrainingModality(""); setTrainingDaysPerWeek(""); setTrainingHours(""); setTrainedWithCoachYn("");
    setSleepQuality(""); setSleepHours(""); setStress(""); setActivityLevel(""); setAppetite(""); setHydration(""); setHydrationLitres(""); setMotivation("");
    setGoals(["", "", "", "", "", ""]);
    setPreTestDate(""); setPostTestDate(""); setBattery(emptyBattery()); setAssessmentNotesText("");
    setConsentTrue(false); setConsentDisclose(false); setConsentNotMedical(false);
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
        medicalInjuryScreening: {
          currentPainOrInjury: painInjuryYn || undefined,
          currentPainDetails: painInjuryDetails || undefined,
          pastInjuryOrSurgery: pastInjury || undefined,
          medicalConditions: medicalYn || undefined,
          medicalDetails: medicalDetails || undefined,
          medications: medications || undefined,
        },
        trainingHistory: {
          currentlyTrains: trainsYn || undefined,
          experience: trainingExperience || undefined,
          modality: trainingModality || undefined,
          daysPerWeek: trainingDaysPerWeek || undefined,
          hoursPerSession: trainingHours || undefined,
          trainedWithCoach: trainedWithCoachYn || undefined,
        },
        healthStatus: {
          sleepQuality: sleepQuality || undefined,
          sleepHours: sleepHours || undefined,
          stress: stress || undefined,
          activityLevel: activityLevel || undefined,
          appetite: appetite || undefined,
          hydration: hydration || undefined,
          hydrationLitres: hydrationLitres || undefined,
          motivation: motivation || undefined,
        },
        goals: goals.filter(g => g.trim()),
        battery: {
          preTestDate: preTestDate || undefined,
          postTestDate: postTestDate || undefined,
          rows: battery,
        },
        assessmentNotes: assessmentNotesText || undefined,
        consent: {
          truthfulInformation: consentTrue,
          disclosureObligation: consentDisclose,
          notMedicalSubstitute: consentNotMedical,
        },
      };

      const res = await fetch("/api/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          serviceId,
          consultantId: userId,
          chiefComplaints: painInjuryDetails || medicalDetails || undefined,
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
      toast.success("FAB record saved");
      setOpen(false);
      resetForm();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  function updateRow(component: string, field: keyof BatteryRow, value: string) {
    setBattery(prev => ({ ...prev, [component]: { ...prev[component], [field]: value } }));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Dumbbell className="h-5 w-5 text-blue-600" /> {TEMPLATE_LABEL[TEMPLATE]}
          </h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            Fill per patient — each assessment creates a separate medical record.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
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
                    <span className="text-xs text-text-tertiary bg-surface-secondary rounded-full px-2 py-0.5 border border-border-light">{list.length} assessment{list.length === 1 ? "" : "s"}</span>
                  </div>
                  {list.length > 0 && (
                    <div className="mt-2 space-y-1.5 pl-2">
                      {list.slice(0, 3).map(r => {
                        const notes = parseNotes(r.assessmentNotes) as { battery?: { preTestDate?: string; postTestDate?: string }; goals?: string[] };
                        const summary = (notes.goals ?? []).join(", ") || "—";
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
        <DialogContent className="sm:max-w-5xl bg-surface max-h-[88vh] overflow-y-auto">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Dumbbell className="h-5 w-5 text-blue-600" /> New Functional Assessment Battery
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
                      <div className="px-2 py-1.5 text-xs text-text-tertiary">No S&amp;C services configured.</div>
                    ) : departmentServices.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <section className="space-y-3">
              <h3 className="text-sm font-bold text-text-primary border-b border-border-light pb-1">Medical &amp; Injury Screening</h3>
              <YesNoField label="Current pain or injury?" value={painInjuryYn} onChange={setPainInjuryYn} />
              {painInjuryYn === "yes" && <Textarea value={painInjuryDetails} onChange={e => setPainInjuryDetails(e.target.value)} rows={2} placeholder="Location & nature" />}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Past injury or surgery</Label>
                <Textarea value={pastInjury} onChange={e => setPastInjury(e.target.value)} rows={2} />
              </div>
              <YesNoField label="Any medical conditions?" value={medicalYn} onChange={setMedicalYn} />
              {medicalYn === "yes" && (
                <>
                  <Textarea value={medicalDetails} onChange={e => setMedicalDetails(e.target.value)} rows={2} placeholder="Conditions" />
                  <Textarea value={medications} onChange={e => setMedications(e.target.value)} rows={2} placeholder="Medications" />
                </>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-bold text-text-primary border-b border-border-light pb-1">Training History</h3>
              <YesNoField label="Do you currently train?" value={trainsYn} onChange={setTrainsYn} />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs font-semibold">Training experience</Label><Input value={trainingExperience} onChange={e => setTrainingExperience(e.target.value)} className="h-9 text-sm" /></div>
                <div className="space-y-1"><Label className="text-xs font-semibold">Training modality</Label><Input value={trainingModality} onChange={e => setTrainingModality(e.target.value)} className="h-9 text-sm" /></div>
                <div className="space-y-1"><Label className="text-xs font-semibold">Days / week</Label><Input type="number" min="0" max="7" value={trainingDaysPerWeek} onChange={e => setTrainingDaysPerWeek(e.target.value)} className="h-9 text-sm" /></div>
                <div className="space-y-1"><Label className="text-xs font-semibold">Hours / session</Label><Input type="number" min="0" value={trainingHours} onChange={e => setTrainingHours(e.target.value)} className="h-9 text-sm" /></div>
              </div>
              <YesNoField label="Trained with a coach?" value={trainedWithCoachYn} onChange={setTrainedWithCoachYn} />
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-bold text-text-primary border-b border-border-light pb-1">Health Status Check</h3>
              <div className="grid grid-cols-2 gap-3">
                <ChoiceField label="Sleep Quality" value={sleepQuality} onChange={setSleepQuality} options={[["poor", "Poor"], ["fair", "Fair"], ["good", "Good"]]} />
                <div className="space-y-1"><Label className="text-xs font-semibold">Hours / night</Label><Input type="number" min="0" max="16" step="0.5" value={sleepHours} onChange={e => setSleepHours(e.target.value)} className="h-9 text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ChoiceField label="Stress Levels" value={stress} onChange={setStress} options={[["low", "Low"], ["moderate", "Moderate"], ["high", "High"]]} />
                <ChoiceField label="Appetite Level" value={appetite} onChange={setAppetite} options={[["poor", "Poor"], ["adequate", "Adequate"], ["good", "Good"], ["high", "High"]]} />
              </div>
              <ChoiceField label="Daily Physical Activity Level" value={activityLevel} onChange={setActivityLevel}
                options={[["sedentary", "Sedentary"], ["lightly", "Lightly Active"], ["moderately", "Moderately Active"], ["very", "Very Active"], ["athletic", "Athletic"]]} />
              <div className="grid grid-cols-2 gap-3">
                <ChoiceField label="Hydration" value={hydration} onChange={setHydration} options={[["low", "Low"], ["moderate", "Moderate"], ["high", "High"]]} />
                <div className="space-y-1"><Label className="text-xs font-semibold">Litres / day</Label><Input type="number" min="0" step="0.5" value={hydrationLitres} onChange={e => setHydrationLitres(e.target.value)} className="h-9 text-sm" /></div>
              </div>
              <ChoiceField label="Motivation to Exercise" value={motivation} onChange={setMotivation} options={[["low", "Low"], ["moderate", "Moderate"], ["high", "High"]]} />
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-bold text-text-primary border-b border-border-light pb-1">Goals</h3>
              {goals.map((g, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-text-tertiary w-4 shrink-0">{String.fromCharCode(97 + i)}.</span>
                  <Input value={g} onChange={e => setGoals(prev => prev.map((x, j) => j === i ? e.target.value : x))} className="h-9 text-sm" placeholder="Strength, hypertrophy, weight management…" />
                </div>
              ))}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-bold text-text-primary border-b border-border-light pb-1">Functional Assessment Battery</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Pre-Test Date</Label>
                  <Input type="date" value={preTestDate} onChange={e => setPreTestDate(e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Post-Test Date</Label>
                  <Input type="date" value={postTestDate} onChange={e => setPostTestDate(e.target.value)} className="h-9 text-sm" />
                </div>
              </div>

              <div className="rounded-lg border border-border-light overflow-hidden">
                <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1.2fr] text-[10px] font-bold uppercase tracking-wider bg-surface-secondary text-text-tertiary px-3 py-2 border-b border-border-light">
                  <span>Component</span>
                  <span>Pre Result</span>
                  <span>Pre Inference</span>
                  <span>Post Result</span>
                  <span>Post Inference</span>
                  <span>Remarks</span>
                </div>
                {BATTERY_GROUPS.map(g => (
                  <div key={g.group}>
                    <div className="px-3 py-1 bg-blue-50/50 text-[10px] font-bold uppercase tracking-wider text-blue-800 border-b border-border-light">{g.group}</div>
                    {g.components.map(c => {
                      const row = battery[c];
                      return (
                        <div key={c} className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1.2fr] gap-1 px-3 py-1.5 border-b border-border-light last:border-b-0 items-center">
                          <span className="text-xs text-text-secondary font-medium pr-2">{c}</span>
                          <Input value={row.preResult} onChange={e => updateRow(c, "preResult", e.target.value)} className="h-8 text-xs" />
                          <Input value={row.preInference} onChange={e => updateRow(c, "preInference", e.target.value)} className="h-8 text-xs" />
                          <Input value={row.postResult} onChange={e => updateRow(c, "postResult", e.target.value)} className="h-8 text-xs" />
                          <Input value={row.postInference} onChange={e => updateRow(c, "postInference", e.target.value)} className="h-8 text-xs" />
                          <Input value={row.remarks} onChange={e => updateRow(c, "remarks", e.target.value)} className="h-8 text-xs" />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Assessment Notes</Label>
                <Textarea value={assessmentNotesText} onChange={e => setAssessmentNotesText(e.target.value)} rows={3} />
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-bold text-text-primary border-b border-border-light pb-1">Consent</h3>
              <ConsentRow checked={consentTrue} onChange={setConsentTrue} label="The information I have provided is accurate and complete. I understand strength &amp; conditioning training involves progressive overload and physical exertion which may carry a risk of musculoskeletal injury, and I have been medically cleared." />
              <ConsentRow checked={consentDisclose} onChange={setConsentDisclose} label="It is my responsibility to disclose any injuries, conditions, or limitations, and to inform the trainer immediately of any pain, dizziness, or discomfort during training." />
              <ConsentRow checked={consentNotMedical} onChange={setConsentNotMedical} label="I understand training programs are designed based on the information provided, results may vary, and these services do not replace medical diagnosis or treatment." />
            </section>

            <div className="flex justify-end gap-2 pt-4 border-t border-border-light">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}><X className="h-4 w-4 mr-1.5" /> Cancel</Button>
              <Button onClick={submit} disabled={submitting || !clientId || !serviceId} className="bg-blue-600 hover:bg-blue-700 text-white">
                {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save Record
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function YesNoField({ label, value, onChange }: { label: string; value: YN; onChange: (v: YN) => void }) {
  return (
    <div className="flex items-center gap-3">
      <Label className="text-xs font-semibold flex-1">{label}</Label>
      <div className="flex gap-2">
        {(["yes", "no"] as const).map(opt => (
          <button key={opt} type="button"
            onClick={() => onChange(value === opt ? "" : opt)}
            className={`h-8 px-3 rounded-md text-xs font-semibold border transition-colors ${value === opt ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-surface border-border-light text-text-secondary hover:border-border"}`}
          >{opt === "yes" ? "Yes" : "No"}</button>
        ))}
      </div>
    </div>
  );
}

function ChoiceField<T extends string>({ label, value, onChange, options }: { label: string; value: T | ""; onChange: (v: T | "") => void; options: Array<[T, string]> }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([k, l]) => (
          <button key={k} type="button"
            onClick={() => onChange(value === k ? "" : k)}
            className={`h-8 px-3 rounded-md text-xs font-semibold border transition-colors ${value === k ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-surface border-border-light text-text-secondary hover:border-border"}`}
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
