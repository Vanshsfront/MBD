"use client";

import { Input } from "@/components/ui/input";
import { Field, Section } from "./shared";
import type { ClinicalFormProps } from "./clinical-shell";

interface State {
  presentingConcern: string;
  onsetTriggers: string;
  severityImpact: string;
  priorTherapy: string;
  mh: { mood?: string; sleep?: string; appetite?: string; alcohol?: string; tobacco?: string; other?: string; otherText?: string };
  riskNotes: string;
  primaryGoal: string;
  secondaryGoals: string;
}

export function CounsellingIntakeForm({ formData, setFormData, disabled }: ClinicalFormProps) {
  const data = formData as Partial<State>;
  const update = (patch: Partial<State>) => setFormData({ ...data, ...patch });
  const setBox = (group: keyof State, key: string, on: boolean) => {
    const current = (data[group] ?? {}) as Record<string, string>;
    update({ [group]: { ...current, [key]: on ? "☑" : "☐" } } as unknown as Partial<State>);
  };

  return (
    <div className="space-y-5">
      <Section title="Presenting concern">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Reason for seeking counselling" span={2}>
            <Input
              value={data.presentingConcern ?? ""}
              onChange={(e) => update({ presentingConcern: e.target.value })}
              disabled={disabled}
            />
          </Field>
          <Field label="Onset / triggers" span={2}>
            <Input
              value={data.onsetTriggers ?? ""}
              onChange={(e) => update({ onsetTriggers: e.target.value })}
              disabled={disabled}
            />
          </Field>
          <Field label="Severity (1–10) + life impact" span={2}>
            <Input
              value={data.severityImpact ?? ""}
              onChange={(e) => update({ severityImpact: e.target.value })}
              disabled={disabled}
            />
          </Field>
          <Field label="Prior therapy / medications" span={2}>
            <Input
              value={data.priorTherapy ?? ""}
              onChange={(e) => update({ priorTherapy: e.target.value })}
              disabled={disabled}
            />
          </Field>
        </div>
      </Section>

      <Section title="Mental-health screen">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Mood">
            <Input
              value={data.mh?.mood ?? ""}
              onChange={(e) => update({ mh: { ...(data.mh ?? {}), mood: e.target.value } })}
              disabled={disabled}
            />
          </Field>
          <Field label="Sleep">
            <Input
              value={data.mh?.sleep ?? ""}
              onChange={(e) => update({ mh: { ...(data.mh ?? {}), sleep: e.target.value } })}
              disabled={disabled}
            />
          </Field>
          <Field label="Appetite">
            <Input
              value={data.mh?.appetite ?? ""}
              onChange={(e) => update({ mh: { ...(data.mh ?? {}), appetite: e.target.value } })}
              disabled={disabled}
            />
          </Field>
          <Field label="Substance use" span={3}>
            <div className="flex flex-wrap gap-3">
              {(["alcohol", "tobacco", "other"] as const).map((k) => (
                <label key={k} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={data.mh?.[k] === "☑"}
                    onChange={(e) => setBox("mh", k, e.target.checked)}
                    disabled={disabled}
                  />
                  {k}
                </label>
              ))}
              <Input
                placeholder="Other (specify)"
                value={data.mh?.otherText ?? ""}
                onChange={(e) =>
                  update({ mh: { ...(data.mh ?? {}), otherText: e.target.value } })
                }
                disabled={disabled}
                className="max-w-xs"
              />
            </div>
          </Field>
          <Field label="Risk notes (SI / HI)" span={3}>
            <Input
              value={data.riskNotes ?? ""}
              onChange={(e) => update({ riskNotes: e.target.value })}
              disabled={disabled}
            />
          </Field>
        </div>
      </Section>

      <Section title="Goals">
        <div className="grid grid-cols-1 gap-3">
          <Field label="Primary goal">
            <Input
              value={data.primaryGoal ?? ""}
              onChange={(e) => update({ primaryGoal: e.target.value })}
              disabled={disabled}
            />
          </Field>
          <Field label="Secondary goals">
            <Input
              value={data.secondaryGoals ?? ""}
              onChange={(e) => update({ secondaryGoals: e.target.value })}
              disabled={disabled}
            />
          </Field>
        </div>
      </Section>
    </div>
  );
}
