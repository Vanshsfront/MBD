"use client";

import { Input } from "@/components/ui/input";
import { Field, RepeatableTable, Section, todayDateString } from "./shared";
import type { ClinicalFormProps } from "./clinical-shell";

interface State {
  primaryGoal: string;
  sessions: Record<string, unknown>[];
}

export function YogaFollowupForm({ formData, setFormData, disabled }: ClinicalFormProps) {
  const data = formData as Partial<State>;
  const update = (patch: Partial<State>) => setFormData({ ...data, ...patch });
  const sessions = (data.sessions as Record<string, unknown>[] | undefined) ?? [];

  return (
    <div className="space-y-5">
      <Section title="Practice goal">
        <Field label="Primary goal" span={2}>
          <Input
            value={data.primaryGoal ?? ""}
            onChange={(e) => update({ primaryGoal: e.target.value })}
            disabled={disabled}
          />
        </Field>
      </Section>
      <Section title="Session log">
        <RepeatableTable
          rows={sessions}
          columns={[
            { key: "sessionNumber", label: "#", width: "w-10" },
            { key: "date", label: "Date" },
            { key: "yogaSession", label: "Yoga session" },
            { key: "remark", label: "Remark" },
            { key: "sign", label: "Sign", width: "w-16" },
          ]}
          onChange={(rows) => update({ sessions: rows })}
          blank={() => ({
            sessionNumber: String(sessions.length + 1),
            date: todayDateString(),
            yogaSession: "",
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
