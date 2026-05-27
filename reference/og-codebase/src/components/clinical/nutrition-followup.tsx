"use client";

import { Input } from "@/components/ui/input";
import {
  ComorbiditiesField,
  Field,
  RepeatableTable,
  Section,
  VitalsField,
  todayDateString,
} from "./shared";
import type { ClinicalFormProps } from "./clinical-shell";

interface State {
  vitals: Record<string, unknown>;
  comorbidities: Record<string, unknown>;
  primaryGoal: string;
  sessions: Record<string, unknown>[];
}

export function NutritionFollowupForm({ formData, setFormData, chiefComplaints, setChiefComplaints, disabled }: ClinicalFormProps) {
  const data = formData as Partial<State>;
  const update = (patch: Partial<State>) => setFormData({ ...data, ...patch });
  const sessions = (data.sessions as Record<string, unknown>[] | undefined) ?? [];

  return (
    <div className="space-y-5">
      <Section title="Today's visit">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Chief complaint" span={2}>
            <Input value={chiefComplaints} onChange={(e) => setChiefComplaints(e.target.value)} disabled={disabled} />
          </Field>
          <Field label="Primary goal" span={2}>
            <Input
              value={data.primaryGoal ?? ""}
              onChange={(e) => update({ primaryGoal: e.target.value })}
              disabled={disabled}
            />
          </Field>
        </div>
      </Section>
      <Section title="Vitals">
        <VitalsField value={data.vitals ?? {}} onChange={(v) => update({ vitals: v })} disabled={disabled} />
      </Section>
      <Section title="Comorbidities">
        <ComorbiditiesField
          value={data.comorbidities ?? {}}
          onChange={(v) => update({ comorbidities: v })}
          disabled={disabled}
        />
      </Section>
      <Section title="Session log" description="Counselling notes per visit.">
        <RepeatableTable
          rows={sessions}
          columns={[
            { key: "sessionNumber", label: "#", width: "w-10" },
            { key: "date", label: "Date" },
            { key: "notes", label: "Notes" },
            { key: "remark", label: "Remark" },
            { key: "sign", label: "Sign", width: "w-16" },
          ]}
          onChange={(rows) => update({ sessions: rows })}
          blank={() => ({
            sessionNumber: String(sessions.length + 1),
            date: todayDateString(),
            notes: "",
            remark: "",
            sign: "",
          })}
          disabled={disabled}
          minRows={1}
        />
      </Section>
    </div>
  );
}
