"use client";
import { Activity, Heart, Stethoscope } from "lucide-react";
import { FormSection, FormField, FormRow, TextInput, TextAreaInput, YesNoField, SelectInput } from "./form-components";
import { Checkbox } from "@/components/ui/checkbox";

export interface PhysioFormState {
  occupation: string; sport: string;
  chiefComplaints: string; hpi: string;
  painSite: string; painSide: string; painOnset: string;
  painDuration: string; painDurationDetail: string;
  painFrequency: string; painFrequencyDetail: string;
  painAtRest: string; painOnMovement: string;
  aggravatingFactors: string; relievingFactors: string;
  pastMedicalHistory: string; pastInjuryHistory: string; pastSurgicalHistory: string;
  familyHistory: string;
  sleep: string; dietAppetite: string; bowelBladder: string; substanceUse: string;
  investigations: string; currentMedications: string;
  differentialDiagnosis: string; structuresAffected: string;
  exercises: string; modality: string; adjunct: string; manualTherapy: string;
  therapistNotes: string; followUp: string;
  dm: boolean; htn: boolean; cad: boolean; pcos: boolean; thyroid: string; comorOther: string;
}

export const PHYSIO_INITIAL: PhysioFormState = {
  occupation: "", sport: "", chiefComplaints: "", hpi: "",
  painSite: "", painSide: "", painOnset: "",
  painDuration: "", painDurationDetail: "", painFrequency: "", painFrequencyDetail: "",
  painAtRest: "", painOnMovement: "", aggravatingFactors: "", relievingFactors: "",
  pastMedicalHistory: "", pastInjuryHistory: "", pastSurgicalHistory: "", familyHistory: "",
  sleep: "", dietAppetite: "", bowelBladder: "", substanceUse: "",
  investigations: "", currentMedications: "",
  differentialDiagnosis: "", structuresAffected: "",
  exercises: "", modality: "", adjunct: "", manualTherapy: "",
  therapistNotes: "", followUp: "",
  dm: false, htn: false, cad: false, pcos: false, thyroid: "", comorOther: "",
};

export function PhysioForm({ state, set, disabled }: { state: PhysioFormState; set: (s: Partial<PhysioFormState>) => void; disabled: boolean }) {
  return (
    <div className="space-y-5">
      <FormSection title="Consultation Details" icon={<Stethoscope className="h-4 w-4 text-blue-600" />}>
        <FormRow>
          <FormField label="Occupation"><TextInput value={state.occupation} onChange={v => set({ occupation: v })} placeholder="e.g. IT Professional" disabled={disabled} /></FormField>
          <FormField label="Sport / Physical Activity"><TextInput value={state.sport} onChange={v => set({ sport: v })} placeholder="e.g. Running, Cricket" disabled={disabled} /></FormField>
        </FormRow>
      </FormSection>

      <FormSection title="Comorbidities" icon={<Heart className="h-4 w-4 text-red-500" />}>
        <div className="flex flex-wrap gap-4">
          {([["dm","DM"],["htn","HTN"],["cad","CAD"],["pcos","PCOS"]] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={state[key]} onCheckedChange={v => set({ [key]: v === true })} disabled={disabled} />
              <span className="text-sm font-medium text-text-secondary">{label}</span>
            </label>
          ))}
        </div>
        <FormRow>
          <FormField label="Thyroid">
            <SelectInput value={state.thyroid} onChange={v => set({ thyroid: v })} disabled={disabled}
              options={[{ value: "none", label: "None" }, { value: "up", label: "Hyper (↑)" }, { value: "down", label: "Hypo (↓)" }]} />
          </FormField>
          <FormField label="Other"><TextInput value={state.comorOther} onChange={v => set({ comorOther: v })} disabled={disabled} /></FormField>
        </FormRow>
      </FormSection>

      <FormSection title="Chief Complaints">
        <TextAreaInput value={state.chiefComplaints} onChange={v => set({ chiefComplaints: v })} placeholder="Patient's main concerns..." disabled={disabled} rows={3} />
      </FormSection>

      <FormSection title="History of Presenting Illness">
        <TextAreaInput value={state.hpi} onChange={v => set({ hpi: v })} placeholder="Detailed history..." disabled={disabled} rows={3} />
      </FormSection>

      <FormSection title="Pain History" icon={<Activity className="h-4 w-4 text-purple-600" />}>
        <FormField label="Site"><TextInput value={state.painSite} onChange={v => set({ painSite: v })} placeholder="e.g. Lower back, Left knee" disabled={disabled} /></FormField>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Side">
            <SelectInput value={state.painSide} onChange={v => set({ painSide: v })} disabled={disabled}
              options={[{ value: "Right", label: "Right" }, { value: "Left", label: "Left" }, { value: "Bilateral", label: "Bilateral" }]} />
          </FormField>
          <FormField label="Onset">
            <SelectInput value={state.painOnset} onChange={v => set({ painOnset: v })} disabled={disabled}
              options={[{ value: "Sudden", label: "Sudden" }, { value: "Gradual", label: "Gradual" }, { value: "Insidious", label: "Insidious" }]} />
          </FormField>
          <FormField label="Duration">
            <SelectInput value={state.painDuration} onChange={v => set({ painDuration: v })} disabled={disabled}
              options={[{ value: "Acute", label: "Acute" }, { value: "Chronic", label: "Chronic" }, { value: "Acute on Chronic", label: "Acute on Chronic" }]} />
          </FormField>
        </div>
        <FormRow>
          <FormField label="Duration Detail"><TextInput value={state.painDurationDetail} onChange={v => set({ painDurationDetail: v })} placeholder="e.g. 3 months" disabled={disabled} /></FormField>
          <FormField label="Frequency">
            <SelectInput value={state.painFrequency} onChange={v => set({ painFrequency: v })} disabled={disabled}
              options={[{ value: "Constant", label: "Constant" }, { value: "Intermittent", label: "Intermittent" }, { value: "On activity", label: "On activity" }]} />
          </FormField>
        </FormRow>
        {state.painFrequency === "On activity" && (
          <FormField label="Activity Detail"><TextInput value={state.painFrequencyDetail} onChange={v => set({ painFrequencyDetail: v })} placeholder="Which activity?" disabled={disabled} /></FormField>
        )}
        <FormRow>
          <FormField label="VAS at Rest (0-10)"><TextInput type="number" min={0} max={10} value={state.painAtRest} onChange={v => set({ painAtRest: v })} disabled={disabled} /></FormField>
          <FormField label="VAS on Movement (0-10)"><TextInput type="number" min={0} max={10} value={state.painOnMovement} onChange={v => set({ painOnMovement: v })} disabled={disabled} /></FormField>
        </FormRow>
        <FormField label="Aggravating Factors"><TextInput value={state.aggravatingFactors} onChange={v => set({ aggravatingFactors: v })} disabled={disabled} /></FormField>
        <FormField label="Relieving Factors"><TextInput value={state.relievingFactors} onChange={v => set({ relievingFactors: v })} disabled={disabled} /></FormField>
      </FormSection>

      <FormSection title="Past History">
        <FormField label="Past Medical History"><TextAreaInput value={state.pastMedicalHistory} onChange={v => set({ pastMedicalHistory: v })} disabled={disabled} rows={2} /></FormField>
        <FormField label="Past Injury History"><TextAreaInput value={state.pastInjuryHistory} onChange={v => set({ pastInjuryHistory: v })} disabled={disabled} rows={2} /></FormField>
        <FormField label="Past Surgical History"><TextAreaInput value={state.pastSurgicalHistory} onChange={v => set({ pastSurgicalHistory: v })} disabled={disabled} rows={2} /></FormField>
      </FormSection>

      <FormSection title="Personal History">
        <FormRow>
          <FormField label="Sleep"><TextInput value={state.sleep} onChange={v => set({ sleep: v })} disabled={disabled} /></FormField>
          <FormField label="Diet & Appetite"><TextInput value={state.dietAppetite} onChange={v => set({ dietAppetite: v })} disabled={disabled} /></FormField>
        </FormRow>
        <FormRow>
          <FormField label="Bowel/Bladder"><TextInput value={state.bowelBladder} onChange={v => set({ bowelBladder: v })} disabled={disabled} /></FormField>
          <FormField label="Substance Use Pattern"><TextInput value={state.substanceUse} onChange={v => set({ substanceUse: v })} disabled={disabled} /></FormField>
        </FormRow>
      </FormSection>

      <FormSection title="Investigations & Medications">
        <FormField label="Investigations (if any)"><TextAreaInput value={state.investigations} onChange={v => set({ investigations: v })} disabled={disabled} rows={2} /></FormField>
        <FormField label="Current Medications"><TextAreaInput value={state.currentMedications} onChange={v => set({ currentMedications: v })} disabled={disabled} rows={2} /></FormField>
      </FormSection>

      <FormSection title="Diagnosis">
        <FormField label="Differential Diagnosis"><TextAreaInput value={state.differentialDiagnosis} onChange={v => set({ differentialDiagnosis: v })} disabled={disabled} rows={2} /></FormField>
        <FormField label="Structures Affected"><TextAreaInput value={state.structuresAffected} onChange={v => set({ structuresAffected: v })} disabled={disabled} rows={2} /></FormField>
      </FormSection>

      <FormSection title="Treatment">
        <FormField label="Exercises Prescribed"><TextAreaInput value={state.exercises} onChange={v => set({ exercises: v })} placeholder="Exercise protocol..." disabled={disabled} rows={3} /></FormField>
        <FormRow>
          <FormField label="Modality"><TextInput value={state.modality} onChange={v => set({ modality: v })} placeholder="e.g. Ultrasound, IFT" disabled={disabled} /></FormField>
          <FormField label="Adjunct"><TextInput value={state.adjunct} onChange={v => set({ adjunct: v })} placeholder="Taping, Dry needling..." disabled={disabled} /></FormField>
        </FormRow>
        <FormField label="Manual Therapy"><TextAreaInput value={state.manualTherapy} onChange={v => set({ manualTherapy: v })} disabled={disabled} rows={2} /></FormField>
      </FormSection>

      <FormSection title="Therapist Notes">
        <TextAreaInput value={state.therapistNotes} onChange={v => set({ therapistNotes: v })} placeholder="Additional observations..." disabled={disabled} rows={3} />
      </FormSection>

      <FormSection title="Follow Up">
        <TextInput value={state.followUp} onChange={v => set({ followUp: v })} placeholder="e.g. Review in 2 weeks" disabled={disabled} />
      </FormSection>
    </div>
  );
}
