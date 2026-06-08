"use client";

import { Input } from "@/components/ui/input";
import { Field, Section } from "./shared";
import type { ClinicalFormProps } from "./clinical-shell";

interface State {
  primaryGoal: string;
  yogaExperience: string;
  activityRoutine: string;
  chronicConditions: string;
  recentInjuries: string;
  stressSleep: string;
  dietPattern: string;
  p: { individual?: string; duo?: string; group?: string; online?: string; timePreference?: string };
  specialRequests: string;
}

export function YogaIntakeForm({ formData, setFormData, disabled }: ClinicalFormProps) {
  const data = formData as Partial<State>;
  const update = (patch: Partial<State>) => setFormData({ ...data, ...patch });
  const setBox = (group: keyof State, key: string, on: boolean) => {
    const current = (data[group] ?? {}) as Record<string, string>;
    update({ [group]: { ...current, [key]: on ? "☑" : "☐" } } as unknown as Partial<State>);
  };

  return (
    <div className="space-y-5">
      <Section title="Goals & experience">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Primary goal / why yoga" span={2}>
            <Input
              value={data.primaryGoal ?? ""}
              onChange={(e) => update({ primaryGoal: e.target.value })}
              disabled={disabled}
            />
          </Field>
          <Field label="Prior yoga experience" span={2}>
            <Input
              value={data.yogaExperience ?? ""}
              onChange={(e) => update({ yogaExperience: e.target.value })}
              disabled={disabled}
            />
          </Field>
          <Field label="Current activity / exercise" span={2}>
            <Input
              value={data.activityRoutine ?? ""}
              onChange={(e) => update({ activityRoutine: e.target.value })}
              disabled={disabled}
            />
          </Field>
        </div>
      </Section>

      <Section title="Health screen">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Chronic conditions / meds" span={2}>
            <Input
              value={data.chronicConditions ?? ""}
              onChange={(e) => update({ chronicConditions: e.target.value })}
              disabled={disabled}
            />
          </Field>
          <Field label="Recent surgeries / injuries" span={2}>
            <Input
              value={data.recentInjuries ?? ""}
              onChange={(e) => update({ recentInjuries: e.target.value })}
              disabled={disabled}
            />
          </Field>
          <Field label="Stress (1–10) / sleep quality">
            <Input
              value={data.stressSleep ?? ""}
              onChange={(e) => update({ stressSleep: e.target.value })}
              disabled={disabled}
            />
          </Field>
          <Field label="Diet pattern">
            <Input
              value={data.dietPattern ?? ""}
              onChange={(e) => update({ dietPattern: e.target.value })}
              disabled={disabled}
            />
          </Field>
        </div>
      </Section>

      <Section title="Practice preferences">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Format</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["individual", "duo", "group", "online"] as const).map((k) => (
              <label key={k} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={data.p?.[k] === "☑"}
                  onChange={(e) => setBox("p", k, e.target.checked)}
                  disabled={disabled}
                />
                {k}
              </label>
            ))}
          </div>
          <Field label="Time of day preference">
            <Input
              value={data.p?.timePreference ?? ""}
              onChange={(e) =>
                update({ p: { ...(data.p ?? {}), timePreference: e.target.value } })
              }
              disabled={disabled}
            />
          </Field>
          <Field label="Special requests / contraindications">
            <Input
              value={data.specialRequests ?? ""}
              onChange={(e) => update({ specialRequests: e.target.value })}
              disabled={disabled}
            />
          </Field>
        </div>
      </Section>
    </div>
  );
}
