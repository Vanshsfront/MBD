"use client";
import { Sparkles } from "lucide-react";
import { FormSection, FormField, FormRow, TextInput, TextAreaInput, YesNoField, ChoiceField, ConsentRow } from "./form-components";

export interface YogaFormState {
  occupation: string;
  conditionsYn: "yes" | "no" | ""; conditionsDetails: string;
  injuryYn: "yes" | "no" | ""; injuryDetails: string;
  medications: string;
  exerciseYn: "yes" | "no" | ""; activityType: string; daysPerWeek: string;
  sleepQuality: string; stressLevel: string; physicalLimitations: string;
  practicedYn: "yes" | "no" | ""; level: string; yogaType: string; practiceDuration: string;
  goals: string[]; focusAreas: string; sessionType: string;
  consentTrue: boolean; consentDisclose: boolean; consentNotMedical: boolean;
  therapistNotes: string;
}

export const YOGA_INITIAL: YogaFormState = {
  occupation: "",
  conditionsYn: "", conditionsDetails: "", injuryYn: "", injuryDetails: "",
  medications: "",
  exerciseYn: "", activityType: "", daysPerWeek: "",
  sleepQuality: "", stressLevel: "", physicalLimitations: "",
  practicedYn: "", level: "", yogaType: "", practiceDuration: "",
  goals: ["", "", "", "", ""], focusAreas: "", sessionType: "",
  consentTrue: false, consentDisclose: false, consentNotMedical: false,
  therapistNotes: "",
};

export function YogaForm({ state, set, disabled }: { state: YogaFormState; set: (s: Partial<YogaFormState>) => void; disabled: boolean }) {
  return (
    <div className="space-y-5">
      <FormSection title="Basic Info">
        <FormField label="Occupation"><TextInput value={state.occupation} onChange={v => set({ occupation: v })} disabled={disabled} /></FormField>
      </FormSection>

      <FormSection title="Medical History">
        <YesNoField label="Any current or pre-existing medical condition?" value={state.conditionsYn} onChange={v => set({ conditionsYn: v })} disabled={disabled} color="emerald" />
        {state.conditionsYn === "yes" && <TextAreaInput value={state.conditionsDetails} onChange={v => set({ conditionsDetails: v })} disabled={disabled} rows={2} placeholder="Details" />}
        <YesNoField label="Have you had any recent injuries or surgery?" value={state.injuryYn} onChange={v => set({ injuryYn: v })} disabled={disabled} color="emerald" />
        {state.injuryYn === "yes" && <TextAreaInput value={state.injuryDetails} onChange={v => set({ injuryDetails: v })} disabled={disabled} rows={2} placeholder="Details" />}
        <FormField label="Any current medications?">
          <TextAreaInput value={state.medications} onChange={v => set({ medications: v })} disabled={disabled} rows={2} />
        </FormField>
      </FormSection>

      <FormSection title="Physical Activity & Lifestyle" icon={<Sparkles className="h-4 w-4 text-emerald-600" />}>
        <YesNoField label="Do you exercise regularly?" value={state.exerciseYn} onChange={v => set({ exerciseYn: v })} disabled={disabled} color="emerald" />
        <FormRow>
          <FormField label="Type of activity"><TextInput value={state.activityType} onChange={v => set({ activityType: v })} placeholder="e.g. Walking, Gym" disabled={disabled} /></FormField>
          <FormField label="Days per week"><TextInput value={state.daysPerWeek} onChange={v => set({ daysPerWeek: v })} placeholder="e.g. 3 d/wk" disabled={disabled} /></FormField>
        </FormRow>
        <ChoiceField label="Sleep Quality" value={state.sleepQuality} onChange={v => set({ sleepQuality: v })} color="emerald" disabled={disabled}
          options={[["poor", "Poor"], ["intermediate", "Intermediate"], ["good", "Good"]]} />
        <ChoiceField label="Stress Level" value={state.stressLevel} onChange={v => set({ stressLevel: v })} color="emerald" disabled={disabled}
          options={[["low", "Low"], ["moderate", "Moderate"], ["high", "High"]]} />
        <FormField label="Physical limitations or discomfort">
          <TextAreaInput value={state.physicalLimitations} onChange={v => set({ physicalLimitations: v })} disabled={disabled} rows={2} />
        </FormField>
      </FormSection>

      <FormSection title="Yoga Experience">
        <YesNoField label="Have you ever practiced yoga?" value={state.practicedYn} onChange={v => set({ practicedYn: v })} disabled={disabled} color="emerald" />
        <ChoiceField label="Level of difficulty" value={state.level} onChange={v => set({ level: v })} color="emerald" disabled={disabled}
          options={[["beginner", "Beginner"], ["intermediate", "Intermediate"], ["advanced", "Advanced"]]} />
        <FormRow>
          <FormField label="Type of yoga practiced"><TextInput value={state.yogaType} onChange={v => set({ yogaType: v })} disabled={disabled} /></FormField>
          <FormField label="Duration of practice"><TextInput value={state.practiceDuration} onChange={v => set({ practiceDuration: v })} placeholder="e.g. 6 months" disabled={disabled} /></FormField>
        </FormRow>
      </FormSection>

      <FormSection title="Goals & Expectations">
        <p className="text-xs text-text-tertiary mb-1">What are your goals for yoga? (e.g., flexibility, stress relief, pain management, weight loss)</p>
        {state.goals.map((g, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary w-4 shrink-0">{String.fromCharCode(97 + i)}.</span>
            <TextInput value={g} onChange={v => set({ goals: state.goals.map((x, j) => j === i ? v : x) })} disabled={disabled} />
          </div>
        ))}
        <FormField label="Specific areas to focus on">
          <TextAreaInput value={state.focusAreas} onChange={v => set({ focusAreas: v })} disabled={disabled} rows={2} />
        </FormField>
        <ChoiceField label="Preferred session type" value={state.sessionType} onChange={v => set({ sessionType: v })} color="emerald" disabled={disabled}
          options={[["personal", "Personal (1:1)"], ["duo", "Group of Two"], ["trio", "Group of Three"]]} />
      </FormSection>

      <FormSection title="Consent">
        <ConsentRow checked={state.consentTrue} onChange={v => set({ consentTrue: v })} disabled={disabled}
          label="I confirm that the information provided is true. I understand that yoga involves physical movement which may carry risk of injury." />
        <ConsentRow checked={state.consentDisclose} onChange={v => set({ consentDisclose: v })} disabled={disabled}
          label="It is my responsibility to inform the instructor of any existing injuries, conditions, or discomfort before and during sessions." />
        <ConsentRow checked={state.consentNotMedical} onChange={v => set({ consentNotMedical: v })} disabled={disabled}
          label="Yoga instruction is not a substitute for medical treatment, and I have been advised to consult a healthcare professional if needed." />
      </FormSection>

      <FormSection title="Therapist Notes">
        <TextAreaInput value={state.therapistNotes} onChange={v => set({ therapistNotes: v })} disabled={disabled} rows={3} />
      </FormSection>
    </div>
  );
}
