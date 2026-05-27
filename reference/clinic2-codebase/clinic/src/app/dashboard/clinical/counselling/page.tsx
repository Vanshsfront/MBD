"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Heart, Plus, Save, Loader2, X } from "lucide-react";

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

const TEMPLATE = "counselling" as const;

export default function CounsellingPage() {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? "";

  const [clients, setClients] = useState<ClientLite[]>([]);
  const [services, setServices] = useState<ServiceLite[]>([]);
  const [records, setRecords] = useState<ConsultationItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [clientId, setClientId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [maritalStatus, setMaritalStatus] = useState("");
  const [occupation, setOccupation] = useState("");

  // Reason for seeking counselling
  const [whatBrings, setWhatBrings] = useState("");
  const [issueOnset, setIssueOnset] = useState("");
  const [lifeImpact, setLifeImpact] = useState("");

  // Medical / counselling history
  const [medicalConditions, setMedicalConditions] = useState("");
  const [currentMedications, setCurrentMedications] = useState("");
  const [prevCounsellingYn, setPrevCounsellingYn] = useState<"yes" | "no" | "">("");
  const [prevCounsellingDetails, setPrevCounsellingDetails] = useState("");

  // Goals (5 slots per PDF)
  const [goals, setGoals] = useState<string[]>(["", "", "", "", ""]);

  // Mental health history
  const [traumaYn, setTraumaYn] = useState<"yes" | "no" | "">("");
  const [traumaDetails, setTraumaDetails] = useState("");
  const [prevDiagnosisYn, setPrevDiagnosisYn] = useState<"yes" | "no" | "">("");
  const [prevDiagnosisDetails, setPrevDiagnosisDetails] = useState("");

  // Substance use
  const [substanceYn, setSubstanceYn] = useState<"yes" | "no" | "">("");
  const [substanceName, setSubstanceName] = useState("");
  const [substanceFrequency, setSubstanceFrequency] = useState("");
  const [substanceQuantity, setSubstanceQuantity] = useState("");

  // Consent
  const [consentVoluntary, setConsentVoluntary] = useState(false);
  const [consentConfidentiality, setConsentConfidentiality] = useState(false);
  const [consentLimits, setConsentLimits] = useState(false);

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
    setClientId("");
    setServiceId("");
    setMaritalStatus("");
    setOccupation("");
    setWhatBrings("");
    setIssueOnset("");
    setLifeImpact("");
    setMedicalConditions("");
    setCurrentMedications("");
    setPrevCounsellingYn("");
    setPrevCounsellingDetails("");
    setGoals(["", "", "", "", ""]);
    setTraumaYn("");
    setTraumaDetails("");
    setPrevDiagnosisYn("");
    setPrevDiagnosisDetails("");
    setSubstanceYn("");
    setSubstanceName("");
    setSubstanceFrequency("");
    setSubstanceQuantity("");
    setConsentVoluntary(false);
    setConsentConfidentiality(false);
    setConsentLimits(false);
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
        occupation: occupation || undefined,
        maritalStatus: maritalStatus || undefined,
        reasonForCounselling: {
          whatBrings: whatBrings || undefined,
          onset: issueOnset || undefined,
          lifeImpact: lifeImpact || undefined,
        },
        medicalHistory: {
          conditions: medicalConditions || undefined,
          medications: currentMedications || undefined,
          previousCounselling: prevCounsellingYn || undefined,
          previousCounsellingDetails: prevCounsellingDetails || undefined,
        },
        goals: goals.filter(g => g.trim()),
        mentalHealth: {
          traumaticEvents: traumaYn || undefined,
          traumaticEventsDetails: traumaDetails || undefined,
          previousDiagnosis: prevDiagnosisYn || undefined,
          previousDiagnosisDetails: prevDiagnosisDetails || undefined,
        },
        substanceUse: {
          uses: substanceYn || undefined,
          substance: substanceName || undefined,
          frequency: substanceFrequency || undefined,
          quantity: substanceQuantity || undefined,
        },
        consent: {
          voluntary: consentVoluntary,
          confidentiality: consentConfidentiality,
          confidentialityLimits: consentLimits,
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
          chiefComplaints: whatBrings || undefined,
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
      toast.success("Counselling record saved");
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
            <Heart className="h-5 w-5 text-rose-600" /> {TEMPLATE_LABEL[TEMPLATE]}
          </h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            Fill per patient — each visit creates a separate medical record.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-rose-600 hover:bg-rose-700 text-white">
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
                        const notes = parseNotes(r.assessmentNotes);
                        return (
                          <div key={r.id} className="text-xs flex items-start gap-3 bg-surface-secondary/40 rounded-md px-2.5 py-1.5">
                            <span className="text-text-tertiary shrink-0 w-20">{format(new Date(r.date), "dd MMM yyyy")}</span>
                            <span className="text-text-secondary line-clamp-2">{r.chiefComplaints || (typeof (notes as { therapistNotes?: string }).therapistNotes === "string" ? (notes as { therapistNotes?: string }).therapistNotes : "—")}</span>
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
            <Heart className="h-5 w-5 text-rose-600" /> New Counselling Record
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
                      <div className="px-2 py-1.5 text-xs text-text-tertiary">No Counselling services configured.</div>
                    ) : departmentServices.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Occupation</Label>
                <Input value={occupation} onChange={e => setOccupation(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Marital Status</Label>
                <Input value={maritalStatus} onChange={e => setMaritalStatus(e.target.value)} className="h-10" />
              </div>
            </div>

            <section className="space-y-3">
              <h3 className="text-sm font-bold text-text-primary border-b border-border-light pb-1">Reason for Seeking Counselling</h3>
              <div className="space-y-2">
                <Label className="text-xs font-semibold">What brings you to counselling?</Label>
                <Textarea value={whatBrings} onChange={e => setWhatBrings(e.target.value)} rows={3} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold">When did the issue start?</Label>
                <Textarea value={issueOnset} onChange={e => setIssueOnset(e.target.value)} rows={2} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold">How is it affecting your life?</Label>
                <Textarea value={lifeImpact} onChange={e => setLifeImpact(e.target.value)} rows={3} />
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-bold text-text-primary border-b border-border-light pb-1">Medical History</h3>
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Current or pre-existing conditions</Label>
                <Textarea value={medicalConditions} onChange={e => setMedicalConditions(e.target.value)} rows={2} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Current medications</Label>
                <Textarea value={currentMedications} onChange={e => setCurrentMedications(e.target.value)} rows={2} />
              </div>
              <YesNoField label="Previous counselling/therapy experience" value={prevCounsellingYn} onChange={setPrevCounsellingYn} />
              {prevCounsellingYn === "yes" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Details</Label>
                  <Textarea value={prevCounsellingDetails} onChange={e => setPrevCounsellingDetails(e.target.value)} rows={2} />
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-bold text-text-primary border-b border-border-light pb-1">Counselling Goals</h3>
              {goals.map((g, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-text-tertiary w-4 shrink-0">{i + 1}.</span>
                  <Input value={g} onChange={e => setGoals(prev => prev.map((x, j) => j === i ? e.target.value : x))} className="h-9 text-sm" placeholder="e.g. Manage anxiety before work meetings" />
                </div>
              ))}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-bold text-text-primary border-b border-border-light pb-1">Mental Health History</h3>
              <YesNoField label="Have you experienced any traumatic events?" value={traumaYn} onChange={setTraumaYn} />
              {traumaYn === "yes" && (
                <Textarea value={traumaDetails} onChange={e => setTraumaDetails(e.target.value)} rows={2} placeholder="Details" />
              )}
              <YesNoField label="Any previous mental health diagnoses?" value={prevDiagnosisYn} onChange={setPrevDiagnosisYn} />
              {prevDiagnosisYn === "yes" && (
                <Textarea value={prevDiagnosisDetails} onChange={e => setPrevDiagnosisDetails(e.target.value)} rows={2} placeholder="Details" />
              )}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-bold text-text-primary border-b border-border-light pb-1">Substance Use</h3>
              <YesNoField label="Do you use any substances? (Alcohol, tobacco, smoking, etc)" value={substanceYn} onChange={setSubstanceYn} />
              {substanceYn === "yes" && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Substance</Label>
                    <Input value={substanceName} onChange={e => setSubstanceName(e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Frequency</Label>
                    <Input value={substanceFrequency} onChange={e => setSubstanceFrequency(e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Quantity</Label>
                    <Input value={substanceQuantity} onChange={e => setSubstanceQuantity(e.target.value)} className="h-9 text-sm" />
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-bold text-text-primary border-b border-border-light pb-1">Consent</h3>
              <ConsentRow checked={consentVoluntary} onChange={setConsentVoluntary} label="I confirm that I am voluntarily seeking emotional wellness counselling and consent to participate in counselling sessions." />
              <ConsentRow checked={consentConfidentiality} onChange={setConsentConfidentiality} label="I understand that information shared will be kept confidential and used only for assessment, support, and treatment." />
              <ConsentRow checked={consentLimits} onChange={setConsentLimits} label="I understand that confidentiality may be limited when there is a risk of harm to myself or others, or when required by law." />
            </section>

            <section className="space-y-2">
              <Label className="text-xs font-semibold">Therapist Notes</Label>
              <Textarea value={therapistNotes} onChange={e => setTherapistNotes(e.target.value)} rows={3} />
            </section>

            <div className="flex justify-end gap-2 pt-4 border-t border-border-light">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}><X className="h-4 w-4 mr-1.5" /> Cancel</Button>
              <Button onClick={submit} disabled={submitting || !clientId || !serviceId} className="bg-rose-600 hover:bg-rose-700 text-white">
                {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save Record
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function YesNoField({ label, value, onChange }: { label: string; value: "yes" | "no" | ""; onChange: (v: "yes" | "no" | "") => void }) {
  return (
    <div className="flex items-center gap-3">
      <Label className="text-xs font-semibold flex-1">{label}</Label>
      <div className="flex gap-2">
        {(["yes", "no"] as const).map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(value === opt ? "" : opt)}
            className={`h-8 px-3 rounded-md text-xs font-semibold border transition-colors ${value === opt ? "bg-rose-50 border-rose-300 text-rose-700" : "bg-surface border-border-light text-text-secondary hover:border-border"}`}
          >{opt === "yes" ? "Yes" : "No"}</button>
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
