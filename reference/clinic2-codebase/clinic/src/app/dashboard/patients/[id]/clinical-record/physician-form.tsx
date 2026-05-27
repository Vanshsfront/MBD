"use client";
import { Stethoscope, Heart, ClipboardList, FlaskConical } from "lucide-react";
import { FormSection, FormField, FormRow, TextInput, TextAreaInput, YesNoField, ConsentRow } from "./form-components";
import { Checkbox } from "@/components/ui/checkbox";

export interface PhysicianFormState {
  chiefComplaints: string; pastMedicalHistory: string; pastSurgicalHistory: string; familyHistory: string;
  sleep: string; dietAppetite: string; bowelBladder: string; personalOthers: string;
  diagnosis: string; currentMedications: string; planOfCare: string; followUp: string;
  labCbc: boolean; labRft: boolean; labLft: boolean; labTft: boolean; labLipid: boolean;
  labCmp: boolean; labHba1c: boolean; labCrp: boolean; labUrinalysis: boolean; labOther: string;
  imgXray: string; imgMri: string; imgCt: string; imgUsg: string; imgEcg: string; imgDexa: string; imgOther: string;
  refPhysio: boolean; refSc: boolean; refMassage: boolean; refNutrition: boolean; refCounselling: boolean; refYoga: boolean;
  qualifiedWellness: "yes" | "no" | "";
}

export const PHYSICIAN_INITIAL: PhysicianFormState = {
  chiefComplaints: "", pastMedicalHistory: "", pastSurgicalHistory: "", familyHistory: "",
  sleep: "", dietAppetite: "", bowelBladder: "", personalOthers: "",
  diagnosis: "", currentMedications: "", planOfCare: "", followUp: "",
  labCbc: false, labRft: false, labLft: false, labTft: false, labLipid: false,
  labCmp: false, labHba1c: false, labCrp: false, labUrinalysis: false, labOther: "",
  imgXray: "", imgMri: "", imgCt: "", imgUsg: "", imgEcg: "", imgDexa: "", imgOther: "",
  refPhysio: false, refSc: false, refMassage: false, refNutrition: false, refCounselling: false, refYoga: false,
  qualifiedWellness: "",
};

export function PhysicianForm({ state, set, disabled }: { state: PhysicianFormState; set: (s: Partial<PhysicianFormState>) => void; disabled: boolean }) {
  const labChecks: Array<{ key: keyof PhysicianFormState; label: string }> = [
    { key: "labCbc", label: "CBC" }, { key: "labRft", label: "Renal Function Test" }, { key: "labLft", label: "Liver Function Test" },
    { key: "labTft", label: "Thyroid Function Test" }, { key: "labLipid", label: "Lipid Profile" }, { key: "labCmp", label: "CMP" },
    { key: "labHba1c", label: "HbA1c" }, { key: "labCrp", label: "CRP" }, { key: "labUrinalysis", label: "Urinalysis" },
  ];
  const refChecks: Array<{ key: keyof PhysicianFormState; label: string }> = [
    { key: "refPhysio", label: "Physiotherapy" }, { key: "refSc", label: "Strength & Conditioning" },
    { key: "refMassage", label: "Sports / Deep Tissue Massage" }, { key: "refNutrition", label: "Nutrition Guidance" },
    { key: "refCounselling", label: "Counselling & Stress support" }, { key: "refYoga", label: "Wellness Yoga" },
  ];

  return (
    <div className="space-y-5">
      <FormSection title="Chief Complaints" icon={<Stethoscope className="h-4 w-4 text-blue-600" />}>
        <TextAreaInput value={state.chiefComplaints} onChange={v => set({ chiefComplaints: v })} placeholder="Patient's main concerns..." disabled={disabled} rows={3} />
      </FormSection>

      <FormSection title="Medical History" icon={<ClipboardList className="h-4 w-4 text-purple-600" />}>
        <FormField label="Past Medical History">
          <TextAreaInput value={state.pastMedicalHistory} onChange={v => set({ pastMedicalHistory: v })} disabled={disabled} rows={2} />
        </FormField>
        <FormField label="Past Surgical History">
          <TextAreaInput value={state.pastSurgicalHistory} onChange={v => set({ pastSurgicalHistory: v })} disabled={disabled} rows={2} />
        </FormField>
        <FormField label="Family History">
          <TextAreaInput value={state.familyHistory} onChange={v => set({ familyHistory: v })} disabled={disabled} rows={2} />
        </FormField>
      </FormSection>

      <FormSection title="Personal History">
        <FormRow>
          <FormField label="Sleep"><TextInput value={state.sleep} onChange={v => set({ sleep: v })} disabled={disabled} /></FormField>
          <FormField label="Diet & Appetite"><TextInput value={state.dietAppetite} onChange={v => set({ dietAppetite: v })} disabled={disabled} /></FormField>
        </FormRow>
        <FormRow>
          <FormField label="Bowel/Bladder"><TextInput value={state.bowelBladder} onChange={v => set({ bowelBladder: v })} disabled={disabled} /></FormField>
          <FormField label="Others"><TextInput value={state.personalOthers} onChange={v => set({ personalOthers: v })} disabled={disabled} /></FormField>
        </FormRow>
      </FormSection>

      <FormSection title="Diagnosis">
        <TextAreaInput value={state.diagnosis} onChange={v => set({ diagnosis: v })} disabled={disabled} rows={2} />
      </FormSection>

      <FormSection title="Lab Investigations" icon={<FlaskConical className="h-4 w-4 text-teal-600" />}>
        <div className="grid grid-cols-3 gap-3">
          {labChecks.map(c => (
            <label key={c.key} className="flex items-center gap-2 cursor-pointer text-sm">
              <Checkbox checked={state[c.key] as boolean} onCheckedChange={v => set({ [c.key]: v === true })} disabled={disabled} />
              <span className="text-text-secondary font-medium text-xs">{c.label}</span>
            </label>
          ))}
        </div>
        <FormField label="Other"><TextInput value={state.labOther} onChange={v => set({ labOther: v })} disabled={disabled} /></FormField>
      </FormSection>

      <FormSection title="Diagnostic Imaging">
        <FormRow>
          <FormField label="X-Ray"><TextInput value={state.imgXray} onChange={v => set({ imgXray: v })} disabled={disabled} /></FormField>
          <FormField label="MRI"><TextInput value={state.imgMri} onChange={v => set({ imgMri: v })} disabled={disabled} /></FormField>
        </FormRow>
        <FormRow>
          <FormField label="CT"><TextInput value={state.imgCt} onChange={v => set({ imgCt: v })} disabled={disabled} /></FormField>
          <FormField label="USG / US"><TextInput value={state.imgUsg} onChange={v => set({ imgUsg: v })} disabled={disabled} /></FormField>
        </FormRow>
        <FormRow>
          <FormField label="ECG"><TextInput value={state.imgEcg} onChange={v => set({ imgEcg: v })} disabled={disabled} /></FormField>
          <FormField label="DEXA Scan"><TextInput value={state.imgDexa} onChange={v => set({ imgDexa: v })} disabled={disabled} /></FormField>
        </FormRow>
        <FormField label="Other"><TextInput value={state.imgOther} onChange={v => set({ imgOther: v })} disabled={disabled} /></FormField>
      </FormSection>

      <FormSection title="Current Medications">
        <TextAreaInput value={state.currentMedications} onChange={v => set({ currentMedications: v })} disabled={disabled} rows={2} />
      </FormSection>

      <FormSection title="Plan of Care & Advice">
        <TextAreaInput value={state.planOfCare} onChange={v => set({ planOfCare: v })} disabled={disabled} rows={4} />
      </FormSection>

      <FormSection title="Follow Up">
        <TextAreaInput value={state.followUp} onChange={v => set({ followUp: v })} placeholder="e.g. Review in 2 weeks" disabled={disabled} rows={2} />
      </FormSection>

      <FormSection title="Internal Referral" icon={<Heart className="h-4 w-4 text-red-500" />}>
        <div className="grid grid-cols-2 gap-3">
          {refChecks.map(c => (
            <label key={c.key} className="flex items-center gap-2 cursor-pointer text-sm">
              <Checkbox checked={state[c.key] as boolean} onCheckedChange={v => set({ [c.key]: v === true })} disabled={disabled} />
              <span className="text-text-secondary font-medium text-xs">{c.label}</span>
            </label>
          ))}
        </div>
        <div className="pt-2 border-t border-border-light">
          <YesNoField label="Qualified for Wellness Program?" value={state.qualifiedWellness} onChange={v => set({ qualifiedWellness: v })} disabled={disabled} />
        </div>
      </FormSection>
    </div>
  );
}
