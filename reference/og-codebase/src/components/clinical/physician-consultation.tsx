"use client";

// Physician first-visit consultation. PRD §6.1: PHYSICIAN_CONSULTATION.docx
// covers vitals + comorbidities + 12 narrative fields + lab investigations
// + diagnostic imaging + internal references + wellness program flag.

import { Input } from "@/components/ui/input";
import { ComorbiditiesField, Field, Section, VitalsField } from "./shared";
import type { ClinicalFormProps } from "./clinical-shell";

interface State {
  vitals: Record<string, unknown>;
  comorbidities: Record<string, unknown>;
  knownAllergies: string;
  pastMedicalHistory: string;
  pastSurgicalHistory: string;
  familyHistory: string;
  personalHistory: string;
  personal: { sleep?: string; appetite?: string; bowelBladder?: string; others?: string };
  currentMedications: string;
  lab: { cbc?: string; rft?: string; lft?: string; tft?: string; lipid?: string; cmp?: string; hba1c?: string; urinalysis?: string };
  imaging: { xray?: string; mri?: string; ct?: string; usg?: string; ecg?: string; dexa?: string };
  ref: { physiotherapy?: string; sc?: string; massage?: string; nutrition?: string; counselling?: string; yoga?: string };
  wellnessProgram: { yes?: string; no?: string };
}

const LAB_TESTS: ReadonlyArray<{ key: keyof State["lab"]; label: string }> = [
  { key: "cbc", label: "CBC" },
  { key: "rft", label: "Renal function" },
  { key: "lft", label: "Liver function" },
  { key: "tft", label: "Thyroid function" },
  { key: "lipid", label: "Lipid profile" },
  { key: "cmp", label: "CMP" },
  { key: "hba1c", label: "HbA1c" },
  { key: "urinalysis", label: "Urinalysis" },
];

const IMAGING: ReadonlyArray<{ key: keyof State["imaging"]; label: string }> = [
  { key: "xray", label: "X-Ray" },
  { key: "mri", label: "MRI" },
  { key: "ct", label: "CT" },
  { key: "usg", label: "USG" },
  { key: "ecg", label: "ECG" },
  { key: "dexa", label: "DEXA" },
];

const REFERRALS: ReadonlyArray<{ key: keyof State["ref"]; label: string }> = [
  { key: "physiotherapy", label: "Physiotherapy" },
  { key: "sc", label: "S&C" },
  { key: "massage", label: "Massage" },
  { key: "nutrition", label: "Nutrition" },
  { key: "counselling", label: "Counselling" },
  { key: "yoga", label: "Yoga" },
];

export function PhysicianConsultationForm({
  formData,
  setFormData,
  chiefComplaints,
  setChiefComplaints,
  diagnosis,
  setDiagnosis,
  planOfCare,
  setPlanOfCare,
  followUp,
  setFollowUp,
  disabled,
}: ClinicalFormProps) {
  const data = formData as Partial<State>;
  const update = (patch: Partial<State>) => setFormData({ ...data, ...patch });

  const setBox = <K extends keyof State>(group: K, key: string, on: boolean) => {
    const current = (data[group] ?? {}) as Record<string, string>;
    update({ [group]: { ...current, [key]: on ? "☑" : "☐" } } as unknown as Partial<State>);
  };

  return (
    <div className="space-y-5">
      <Section title="Chief complaint & history">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Chief complaints" span={2}>
            <Input
              value={chiefComplaints}
              onChange={(e) => setChiefComplaints(e.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field label="Known allergies" span={2}>
            <Input
              value={data.knownAllergies ?? ""}
              onChange={(e) => update({ knownAllergies: e.target.value })}
              disabled={disabled}
            />
          </Field>
          <Field label="Past medical history" span={2}>
            <Textarea
              value={data.pastMedicalHistory ?? ""}
              onChange={(v) => update({ pastMedicalHistory: v })}
              disabled={disabled}
            />
          </Field>
          <Field label="Past surgical history" span={2}>
            <Textarea
              value={data.pastSurgicalHistory ?? ""}
              onChange={(v) => update({ pastSurgicalHistory: v })}
              disabled={disabled}
            />
          </Field>
          <Field label="Family history" span={2}>
            <Textarea
              value={data.familyHistory ?? ""}
              onChange={(v) => update({ familyHistory: v })}
              disabled={disabled}
            />
          </Field>
          <Field label="Personal history (notes)" span={2}>
            <Textarea
              value={data.personalHistory ?? ""}
              onChange={(v) => update({ personalHistory: v })}
              disabled={disabled}
            />
          </Field>
          <Field label="Sleep">
            <Input
              value={data.personal?.sleep ?? ""}
              onChange={(e) =>
                update({ personal: { ...(data.personal ?? {}), sleep: e.target.value } })
              }
              disabled={disabled}
            />
          </Field>
          <Field label="Diet & appetite">
            <Input
              value={data.personal?.appetite ?? ""}
              onChange={(e) =>
                update({
                  personal: { ...(data.personal ?? {}), appetite: e.target.value },
                })
              }
              disabled={disabled}
            />
          </Field>
          <Field label="Bowel/Bladder">
            <Input
              value={data.personal?.bowelBladder ?? ""}
              onChange={(e) =>
                update({
                  personal: { ...(data.personal ?? {}), bowelBladder: e.target.value },
                })
              }
              disabled={disabled}
            />
          </Field>
          <Field label="Others">
            <Input
              value={data.personal?.others ?? ""}
              onChange={(e) =>
                update({ personal: { ...(data.personal ?? {}), others: e.target.value } })
              }
              disabled={disabled}
            />
          </Field>
          <Field label="Current medications" span={2}>
            <Textarea
              value={data.currentMedications ?? ""}
              onChange={(v) => update({ currentMedications: v })}
              disabled={disabled}
            />
          </Field>
        </div>
      </Section>

      <Section title="Vitals">
        <VitalsField
          value={data.vitals ?? {}}
          onChange={(v) => update({ vitals: v })}
          disabled={disabled}
        />
      </Section>

      <Section title="Comorbidities">
        <ComorbiditiesField
          value={data.comorbidities ?? {}}
          onChange={(v) => update({ comorbidities: v })}
          disabled={disabled}
        />
      </Section>

      <Section title="Lab investigations" description="Tick all that apply.">
        <CheckboxRow
          items={LAB_TESTS}
          values={(data.lab ?? {}) as Record<string, string>}
          onToggle={(k, on) => setBox("lab", k, on)}
          disabled={disabled}
        />
      </Section>

      <Section title="Diagnostic imaging">
        <CheckboxRow
          items={IMAGING}
          values={(data.imaging ?? {}) as Record<string, string>}
          onToggle={(k, on) => setBox("imaging", k, on)}
          disabled={disabled}
        />
      </Section>

      <Section title="Internal references">
        <CheckboxRow
          items={REFERRALS}
          values={(data.ref ?? {}) as Record<string, string>}
          onToggle={(k, on) => setBox("ref", k, on)}
          disabled={disabled}
        />
        <div className="mt-3 flex items-center gap-4">
          <span className="text-sm font-medium">Wellness programme:</span>
          {(["yes", "no"] as const).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="wellnessProgram"
                checked={data.wellnessProgram?.[k] === "☑"}
                onChange={() =>
                  update({
                    wellnessProgram: { yes: k === "yes" ? "☑" : "☐", no: k === "no" ? "☑" : "☐" },
                  })
                }
                disabled={disabled}
              />
              {k === "yes" ? "Yes" : "No"}
            </label>
          ))}
        </div>
      </Section>

      <Section title="Diagnosis & plan">
        <div className="space-y-3">
          <Field label="Diagnosis (provisional)">
            <Input
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field label="Plan of care & advice">
            <Textarea
              value={planOfCare}
              onChange={setPlanOfCare}
              disabled={disabled}
            />
          </Field>
          <Field label="Follow up">
            <Input
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              disabled={disabled}
            />
          </Field>
        </div>
      </Section>
    </div>
  );
}

function CheckboxRow<K extends string>({
  items,
  values,
  onToggle,
  disabled,
}: {
  items: ReadonlyArray<{ key: K; label: string }>;
  values: Record<string, string>;
  onToggle: (k: K, on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((it) => (
        <label
          key={it.key}
          className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
        >
          <input
            type="checkbox"
            checked={values[it.key] === "☑"}
            onChange={(e) => onToggle(it.key, e.target.checked)}
            disabled={disabled}
          />
          {it.label}
        </label>
      ))}
    </div>
  );
}

function Textarea({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      rows={2}
      className="flex min-h-[44px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}
