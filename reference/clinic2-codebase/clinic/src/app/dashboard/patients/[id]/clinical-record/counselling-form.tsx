"use client";
import { Heart } from "lucide-react";
import { FormSection, FormField, FormRow, TextInput, TextAreaInput, YesNoField, ConsentRow } from "./form-components";

export interface CounsellingFormState {
  occupation: string; maritalStatus: string;
  whatBrings: string; issueOnset: string; lifeImpact: string;
  medicalConditions: string; currentMedications: string;
  prevCounsellingYn: "yes" | "no" | ""; prevCounsellingDetails: string;
  goals: string[];
  traumaYn: "yes" | "no" | ""; traumaDetails: string;
  prevDiagnosisYn: "yes" | "no" | ""; prevDiagnosisDetails: string;
  substanceYn: "yes" | "no" | ""; substanceName: string; substanceFrequency: string; substanceQuantity: string;
  consentVoluntary: boolean; consentConfidentiality: boolean; consentLimits: boolean;
  therapistNotes: string;
}

export const COUNSELLING_INITIAL: CounsellingFormState = {
  occupation: "", maritalStatus: "",
  whatBrings: "", issueOnset: "", lifeImpact: "",
  medicalConditions: "", currentMedications: "",
  prevCounsellingYn: "", prevCounsellingDetails: "",
  goals: ["", "", "", "", ""],
  traumaYn: "", traumaDetails: "", prevDiagnosisYn: "", prevDiagnosisDetails: "",
  substanceYn: "", substanceName: "", substanceFrequency: "", substanceQuantity: "",
  consentVoluntary: false, consentConfidentiality: false, consentLimits: false,
  therapistNotes: "",
};

export function CounsellingForm({ state, set, disabled }: { state: CounsellingFormState; set: (s: Partial<CounsellingFormState>) => void; disabled: boolean }) {
  return (
    <div className="space-y-5">
      <FormSection title="Basic Info">
        <FormRow>
          <FormField label="Occupation"><TextInput value={state.occupation} onChange={v => set({ occupation: v })} disabled={disabled} /></FormField>
          <FormField label="Marital Status"><TextInput value={state.maritalStatus} onChange={v => set({ maritalStatus: v })} disabled={disabled} /></FormField>
        </FormRow>
      </FormSection>

      <FormSection title="Reason for Seeking Counselling" icon={<Heart className="h-4 w-4 text-rose-600" />}>
        <FormField label="What brings you to counselling?">
          <TextAreaInput value={state.whatBrings} onChange={v => set({ whatBrings: v })} disabled={disabled} rows={3} />
        </FormField>
        <FormField label="When did the issue start?">
          <TextAreaInput value={state.issueOnset} onChange={v => set({ issueOnset: v })} disabled={disabled} rows={2} />
        </FormField>
        <FormField label="How is it affecting your life?">
          <TextAreaInput value={state.lifeImpact} onChange={v => set({ lifeImpact: v })} disabled={disabled} rows={3} />
        </FormField>
      </FormSection>

      <FormSection title="Medical History">
        <FormField label="Current or pre-existing conditions">
          <TextAreaInput value={state.medicalConditions} onChange={v => set({ medicalConditions: v })} disabled={disabled} rows={2} />
        </FormField>
        <FormField label="Current medications">
          <TextAreaInput value={state.currentMedications} onChange={v => set({ currentMedications: v })} disabled={disabled} rows={2} />
        </FormField>
        <YesNoField label="Previous counselling/therapy experience" value={state.prevCounsellingYn} onChange={v => set({ prevCounsellingYn: v })} disabled={disabled} color="rose" />
        {state.prevCounsellingYn === "yes" && (
          <FormField label="Details">
            <TextAreaInput value={state.prevCounsellingDetails} onChange={v => set({ prevCounsellingDetails: v })} disabled={disabled} rows={2} />
          </FormField>
        )}
      </FormSection>

      <FormSection title="Counselling Goals">
        {state.goals.map((g, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary w-4 shrink-0">{i + 1}.</span>
            <TextInput value={g} onChange={v => set({ goals: state.goals.map((x, j) => j === i ? v : x) })} placeholder="e.g. Manage anxiety before work meetings" disabled={disabled} />
          </div>
        ))}
      </FormSection>

      <FormSection title="Mental Health History">
        <YesNoField label="Have you experienced any traumatic events?" value={state.traumaYn} onChange={v => set({ traumaYn: v })} disabled={disabled} color="rose" />
        {state.traumaYn === "yes" && <TextAreaInput value={state.traumaDetails} onChange={v => set({ traumaDetails: v })} disabled={disabled} rows={2} placeholder="Details" />}
        <YesNoField label="Any previous mental health diagnoses?" value={state.prevDiagnosisYn} onChange={v => set({ prevDiagnosisYn: v })} disabled={disabled} color="rose" />
        {state.prevDiagnosisYn === "yes" && <TextAreaInput value={state.prevDiagnosisDetails} onChange={v => set({ prevDiagnosisDetails: v })} disabled={disabled} rows={2} placeholder="Details" />}
      </FormSection>

      <FormSection title="Substance Use">
        <YesNoField label="Do you use any substances? (Alcohol, tobacco, smoking, etc)" value={state.substanceYn} onChange={v => set({ substanceYn: v })} disabled={disabled} color="rose" />
        {state.substanceYn === "yes" && (
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Substance"><TextInput value={state.substanceName} onChange={v => set({ substanceName: v })} disabled={disabled} /></FormField>
            <FormField label="Frequency"><TextInput value={state.substanceFrequency} onChange={v => set({ substanceFrequency: v })} disabled={disabled} /></FormField>
            <FormField label="Quantity"><TextInput value={state.substanceQuantity} onChange={v => set({ substanceQuantity: v })} disabled={disabled} /></FormField>
          </div>
        )}
      </FormSection>

      <FormSection title="Consent">
        <ConsentRow checked={state.consentVoluntary} onChange={v => set({ consentVoluntary: v })} disabled={disabled}
          label="I confirm that I am voluntarily seeking emotional wellness counselling and consent to participate in counselling sessions." />
        <ConsentRow checked={state.consentConfidentiality} onChange={v => set({ consentConfidentiality: v })} disabled={disabled}
          label="I understand that information shared will be kept confidential and used only for assessment, support, and treatment." />
        <ConsentRow checked={state.consentLimits} onChange={v => set({ consentLimits: v })} disabled={disabled}
          label="I understand that confidentiality may be limited when there is a risk of harm to myself or others, or when required by law." />
      </FormSection>

      <FormSection title="Therapist Notes">
        <TextAreaInput value={state.therapistNotes} onChange={v => set({ therapistNotes: v })} disabled={disabled} rows={3} />
      </FormSection>
    </div>
  );
}
