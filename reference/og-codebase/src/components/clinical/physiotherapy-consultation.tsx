"use client";

// Physiotherapy first-visit consultation — the heaviest form in the system.
// PRD §6.1: matches the 10 examination tables in PHYSIOTHERAPY_CONSULTATION.docx
// (vitals, comorbidities, history, posture, pain, 5 exam tables, plan).

import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  ComorbiditiesField,
  Field,
  RepeatableTable,
  Section,
  VitalsField,
} from "./shared";
import type { ClinicalFormProps } from "./clinical-shell";

interface State {
  vitals: Record<string, unknown>;
  comorbidities: Record<string, unknown>;
  knownAllergies: string;
  hpi: string;
  pastMedicalHistory: string;
  pastSurgicalHistory: string;
  familyHistory: string;
  personalHistory: string;
  personal: { sleep?: string; appetite?: string; bowelBladder?: string; others?: string };
  investigations: string;
  currentMedications: string;
  posture: { summary?: string; anterior?: string; lateral?: string; posterior?: string };
  pain: { aggravating?: string; relieving?: string };
  functionalAssessment: string;
  specialTestsSummary: string;
  differentialDiagnosis: string;
  girthRows: Record<string, unknown>[];
  tightnessRows: Record<string, unknown>[];
  romRows: Record<string, unknown>[];
  mmtRows: Record<string, unknown>[];
  neuroRows: Record<string, unknown>[];
}

const STANDARD_ROM_JOINTS: ReadonlyArray<{ joint: string; movement: string }> = [
  { joint: "Cervical", movement: "Flexion / Extension" },
  { joint: "Cervical", movement: "Rotation L/R" },
  { joint: "Shoulder", movement: "Flexion / Abduction" },
  { joint: "Shoulder", movement: "Internal / External rotation" },
  { joint: "Elbow", movement: "Flexion / Extension" },
  { joint: "Lumbar", movement: "Flexion / Extension" },
  { joint: "Hip", movement: "Flexion / Extension" },
  { joint: "Knee", movement: "Flexion / Extension" },
  { joint: "Ankle", movement: "Dorsiflexion / Plantarflexion" },
];

function defaultRomRows(): Record<string, unknown>[] {
  return STANDARD_ROM_JOINTS.map((j, i) => ({
    index: String(i + 1),
    joint: j.joint,
    movement: j.movement,
    right: "",
    left: "",
    endFeel: "",
  }));
}

const STANDARD_MMT: ReadonlyArray<{ joint: string; muscleGroup: string }> = [
  { joint: "Shoulder", muscleGroup: "Deltoid" },
  { joint: "Shoulder", muscleGroup: "Rotator cuff" },
  { joint: "Elbow", muscleGroup: "Biceps / Triceps" },
  { joint: "Hip", muscleGroup: "Glute med / max" },
  { joint: "Knee", muscleGroup: "Quad / Hamstring" },
  { joint: "Ankle", muscleGroup: "Tib ant / Calf" },
];
function defaultMmtRows(): Record<string, unknown>[] {
  return STANDARD_MMT.map((m, i) => ({
    index: String(i + 1),
    joint: m.joint,
    muscleGroup: m.muscleGroup,
    right: "",
    left: "",
  }));
}

const STANDARD_NEURO: ReadonlyArray<string> = [
  "C5/C6 sensory",
  "L4/L5 sensory",
  "S1 sensory",
  "Biceps reflex",
  "Patellar reflex",
  "Achilles reflex",
];
function defaultNeuroRows(): Record<string, unknown>[] {
  return STANDARD_NEURO.map((c, i) => ({
    index: String(i + 1),
    component: c,
    right: "",
    left: "",
    equality: "",
  }));
}

export function PhysiotherapyConsultationForm({
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

  // Hydrate exam-table defaults the first time the form mounts on a fresh
  // record (no prior rows). Keeps the user from staring at empty tables.
  const ensureDefaults = useCallback(
    (key: keyof State, build: () => Record<string, unknown>[]) => {
      if (!Array.isArray(data[key])) {
        return build();
      }
      const arr = data[key] as Record<string, unknown>[];
      return arr.length === 0 ? build() : arr;
    },
    [data],
  );

  const update = (patch: Partial<State>) => setFormData({ ...data, ...patch });

  const girthRows = (data.girthRows as Record<string, unknown>[] | undefined) ?? [];
  const tightnessRows =
    (data.tightnessRows as Record<string, unknown>[] | undefined) ?? [];
  const romRows = ensureDefaults("romRows", defaultRomRows);
  const mmtRows = ensureDefaults("mmtRows", defaultMmtRows);
  const neuroRows = ensureDefaults("neuroRows", defaultNeuroRows);

  return (
    <div className="space-y-5">
      {/* ─── History ─── */}
      <Section title="Chief complaint & history">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Chief complaints" span={2}>
            <Input
              value={chiefComplaints}
              onChange={(e) => setChiefComplaints(e.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field label="History of presenting illness (HPI)" span={2}>
            <Textarea
              value={data.hpi ?? ""}
              onChange={(v) => update({ hpi: v })}
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
          <Field label="Family history">
            <Input
              value={data.familyHistory ?? ""}
              onChange={(e) => update({ familyHistory: e.target.value })}
              disabled={disabled}
            />
          </Field>
          <Field label="Personal history (free text)">
            <Input
              value={data.personalHistory ?? ""}
              onChange={(e) => update({ personalHistory: e.target.value })}
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
          <Field label="Appetite">
            <Input
              value={data.personal?.appetite ?? ""}
              onChange={(e) =>
                update({ personal: { ...(data.personal ?? {}), appetite: e.target.value } })
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
          <Field label="Other">
            <Input
              value={data.personal?.others ?? ""}
              onChange={(e) =>
                update({ personal: { ...(data.personal ?? {}), others: e.target.value } })
              }
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
          <Field label="Investigations" span={2}>
            <Textarea
              value={data.investigations ?? ""}
              onChange={(v) => update({ investigations: v })}
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

      {/* ─── Examination ─── */}
      <Separator />
      <Section
        title="Posture assessment"
        description="Three views; free text per view."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Anterior view" span={2}>
            <Textarea
              value={data.posture?.anterior ?? ""}
              onChange={(v) =>
                update({ posture: { ...(data.posture ?? {}), anterior: v } })
              }
              disabled={disabled}
            />
          </Field>
          <Field label="Lateral view" span={2}>
            <Textarea
              value={data.posture?.lateral ?? ""}
              onChange={(v) =>
                update({ posture: { ...(data.posture ?? {}), lateral: v } })
              }
              disabled={disabled}
            />
          </Field>
          <Field label="Posterior view" span={2}>
            <Textarea
              value={data.posture?.posterior ?? ""}
              onChange={(v) =>
                update({ posture: { ...(data.posture ?? {}), posterior: v } })
              }
              disabled={disabled}
            />
          </Field>
          <Field label="Posture summary" span={2}>
            <Input
              value={data.posture?.summary ?? ""}
              onChange={(e) =>
                update({ posture: { ...(data.posture ?? {}), summary: e.target.value } })
              }
              disabled={disabled}
            />
          </Field>
        </div>
      </Section>

      <Section title="Pain assessment">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Aggravating factors" span={2}>
            <Input
              value={data.pain?.aggravating ?? ""}
              onChange={(e) =>
                update({ pain: { ...(data.pain ?? {}), aggravating: e.target.value } })
              }
              disabled={disabled}
            />
          </Field>
          <Field label="Relieving factors" span={2}>
            <Input
              value={data.pain?.relieving ?? ""}
              onChange={(e) =>
                update({ pain: { ...(data.pain ?? {}), relieving: e.target.value } })
              }
              disabled={disabled}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Girth measurement"
        description="Add rows for each site. Right / left in cm."
      >
        <RepeatableTable
          rows={girthRows}
          columns={[
            { key: "index", label: "#", width: "w-10" },
            { key: "site", label: "Site" },
            { key: "right", label: "Right" },
            { key: "left", label: "Left" },
          ]}
          onChange={(rows) => update({ girthRows: rows })}
          blank={() => ({ index: String(girthRows.length + 1), site: "", right: "", left: "" })}
          disabled={disabled}
          minRows={2}
        />
      </Section>

      <Section title="Tightness evaluation">
        <RepeatableTable
          rows={tightnessRows}
          columns={[
            { key: "muscleGroup", label: "Muscle group" },
            { key: "mild", label: "Mild", type: "checkbox", width: "w-12" },
            { key: "moderate", label: "Moderate", type: "checkbox", width: "w-16" },
            { key: "severe", label: "Severe", type: "checkbox", width: "w-14" },
            { key: "right", label: "Right" },
            { key: "left", label: "Left" },
          ]}
          onChange={(rows) => update({ tightnessRows: rows })}
          blank={() => ({
            muscleGroup: "",
            mild: "☐",
            moderate: "☐",
            severe: "☐",
            right: "",
            left: "",
          })}
          disabled={disabled}
          minRows={2}
        />
      </Section>

      <Section
        title="Range of motion (ROM)"
        description="Standard joints pre-loaded. Add rows for non-standard joints."
      >
        <RepeatableTable
          rows={romRows}
          columns={[
            { key: "index", label: "#", width: "w-10" },
            { key: "joint", label: "Joint" },
            { key: "movement", label: "Movement" },
            { key: "right", label: "Right" },
            { key: "left", label: "Left" },
            { key: "endFeel", label: "End feel" },
          ]}
          onChange={(rows) => update({ romRows: rows })}
          blank={() => ({
            index: String(romRows.length + 1),
            joint: "",
            movement: "",
            right: "",
            left: "",
            endFeel: "",
          })}
          disabled={disabled}
          minRows={3}
        />
      </Section>

      <Section title="Manual muscle testing (MMT)">
        <RepeatableTable
          rows={mmtRows}
          columns={[
            { key: "index", label: "#", width: "w-10" },
            { key: "joint", label: "Joint" },
            { key: "muscleGroup", label: "Muscle group" },
            { key: "right", label: "Right" },
            { key: "left", label: "Left" },
          ]}
          onChange={(rows) => update({ mmtRows: rows })}
          blank={() => ({
            index: String(mmtRows.length + 1),
            joint: "",
            muscleGroup: "",
            right: "",
            left: "",
          })}
          disabled={disabled}
          minRows={3}
        />
      </Section>

      <Section title="Neurological examination">
        <RepeatableTable
          rows={neuroRows}
          columns={[
            { key: "index", label: "#", width: "w-10" },
            { key: "component", label: "Component" },
            { key: "right", label: "Right" },
            { key: "left", label: "Left" },
            { key: "equality", label: "Equality" },
          ]}
          onChange={(rows) => update({ neuroRows: rows })}
          blank={() => ({
            index: String(neuroRows.length + 1),
            component: "",
            right: "",
            left: "",
            equality: "",
          })}
          disabled={disabled}
          minRows={3}
        />
      </Section>

      <Section title="Functional & special tests">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Functional assessment" span={2}>
            <Textarea
              value={data.functionalAssessment ?? ""}
              onChange={(v) => update({ functionalAssessment: v })}
              disabled={disabled}
            />
          </Field>
          <Field label="Special tests summary" span={2}>
            <Textarea
              value={data.specialTestsSummary ?? ""}
              onChange={(v) => update({ specialTestsSummary: v })}
              disabled={disabled}
            />
          </Field>
        </div>
      </Section>

      <Section title="Diagnosis & plan">
        <div className="grid grid-cols-1 gap-3">
          <Field label="Differential diagnosis">
            <Input
              value={data.differentialDiagnosis ?? ""}
              onChange={(e) => update({ differentialDiagnosis: e.target.value })}
              disabled={disabled}
            />
          </Field>
          <Field label="Diagnosis (provisional)">
            <Input
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field label="Plan of care">
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
