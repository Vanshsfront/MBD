"use client";

import { Input } from "@/components/ui/input";
import { Field, RepeatableTable, Section, VitalsField } from "./shared";
import type { ClinicalFormProps } from "./clinical-shell";

interface State {
  vitals: Record<string, unknown>;
  fmsRows: Record<string, unknown>[];
  strengthRows: Record<string, unknown>[];
  powerRows: Record<string, unknown>[];
  cardioRows: Record<string, unknown>[];
  findings: { strengths?: string; limitations?: string; risks?: string; programme?: string };
}

export function FabForm({ formData, setFormData, disabled }: ClinicalFormProps) {
  const data = formData as Partial<State>;
  const update = (patch: Partial<State>) => setFormData({ ...data, ...patch });
  const fms = (data.fmsRows as Record<string, unknown>[] | undefined) ?? [];
  const strength = (data.strengthRows as Record<string, unknown>[] | undefined) ?? [];
  const power = (data.powerRows as Record<string, unknown>[] | undefined) ?? [];
  const cardio = (data.cardioRows as Record<string, unknown>[] | undefined) ?? [];

  return (
    <div className="space-y-5">
      <Section title="Anthropometry & vitals">
        <VitalsField value={data.vitals ?? {}} onChange={(v) => update({ vitals: v })} disabled={disabled} />
      </Section>

      <Section title="Functional Movement Screen (FMS)">
        <RepeatableTable
          rows={fms}
          columns={[
            { key: "index", label: "#", width: "w-10" },
            { key: "test", label: "Test" },
            { key: "score", label: "Score (0–3)", width: "w-24" },
            { key: "notes", label: "Notes" },
          ]}
          onChange={(rows) => update({ fmsRows: rows })}
          blank={() => ({ index: String(fms.length + 1), test: "", score: "", notes: "" })}
          disabled={disabled}
          minRows={3}
        />
      </Section>

      <Section title="Strength tests">
        <RepeatableTable
          rows={strength}
          columns={[
            { key: "test", label: "Test" },
            { key: "right", label: "Right" },
            { key: "left", label: "Left" },
            { key: "notes", label: "Notes" },
          ]}
          onChange={(rows) => update({ strengthRows: rows })}
          blank={() => ({ test: "", right: "", left: "", notes: "" })}
          disabled={disabled}
          minRows={2}
        />
      </Section>

      <Section title="Power & speed">
        <RepeatableTable
          rows={power}
          columns={[
            { key: "test", label: "Test" },
            { key: "trial1", label: "Trial 1" },
            { key: "trial2", label: "Trial 2" },
            { key: "best", label: "Best" },
          ]}
          onChange={(rows) => update({ powerRows: rows })}
          blank={() => ({ test: "", trial1: "", trial2: "", best: "" })}
          disabled={disabled}
          minRows={2}
        />
      </Section>

      <Section title="Cardio / capacity">
        <RepeatableTable
          rows={cardio}
          columns={[
            { key: "test", label: "Test" },
            { key: "result", label: "Result" },
            { key: "notes", label: "Notes" },
          ]}
          onChange={(rows) => update({ cardioRows: rows })}
          blank={() => ({ test: "", result: "", notes: "" })}
          disabled={disabled}
          minRows={2}
        />
      </Section>

      <Section title="Findings & recommendations">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Strengths" span={2}>
            <Input
              value={data.findings?.strengths ?? ""}
              onChange={(e) =>
                update({ findings: { ...(data.findings ?? {}), strengths: e.target.value } })
              }
              disabled={disabled}
            />
          </Field>
          <Field label="Limitations" span={2}>
            <Input
              value={data.findings?.limitations ?? ""}
              onChange={(e) =>
                update({ findings: { ...(data.findings ?? {}), limitations: e.target.value } })
              }
              disabled={disabled}
            />
          </Field>
          <Field label="Risk factors" span={2}>
            <Input
              value={data.findings?.risks ?? ""}
              onChange={(e) =>
                update({ findings: { ...(data.findings ?? {}), risks: e.target.value } })
              }
              disabled={disabled}
            />
          </Field>
          <Field label="Programme recommendation" span={2}>
            <Input
              value={data.findings?.programme ?? ""}
              onChange={(e) =>
                update({ findings: { ...(data.findings ?? {}), programme: e.target.value } })
              }
              disabled={disabled}
            />
          </Field>
        </div>
      </Section>
    </div>
  );
}
