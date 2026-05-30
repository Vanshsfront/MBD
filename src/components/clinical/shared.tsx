"use client";

// Shared primitives for the per-template clinical-record forms. Keeps each
// template component focused on its own data shape, not duplicated layout.

import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ───────── Field wrappers ─────────

export function Field({
  label,
  children,
  span,
}: {
  label: string;
  children: React.ReactNode;
  span?: 1 | 2 | 3 | 4;
}) {
  const cls =
    span === 4
      ? "sm:col-span-4"
      : span === 3
        ? "sm:col-span-3"
        : span === 2
          ? "sm:col-span-2"
          : "";
  return (
    <div className={`space-y-1.5 ${cls}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

// `.clin-section` is defined in src/app/globals.css (Batch 1) — neumorphic
// card recipe with a scroll-margin offset so anchor jumps from the section
// rail land below the sticky header rather than under it. The id is slugged
// from the title so each section is addressable as `section-{slug}` without
// every caller having to thread an id prop through.
export function Section({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  id?: string;
}) {
  const sectionId = id ?? `section-${slug(title)}`;
  return (
    <section id={sectionId} className="clin-section">
      <div className="clin-section-head">
        <h2>{title}</h2>
        {description ? <p className="clin-section-hint">{description}</p> : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ───────── Vitals + Comorbidities (shared by every consultation/followup) ─────────

export interface VitalsValue extends Record<string, unknown> {
  weightKg?: string;
  heightCm?: string;
  bmi?: string;
  spo2?: string;
  spo2Device?: string;
  pulseBpm?: string;
  bp?: string;
}

export function VitalsField({
  value,
  onChange,
  disabled,
}: {
  value: VitalsValue;
  onChange: (v: VitalsValue) => void;
  disabled?: boolean;
}) {
  const set = useCallback(
    (k: keyof VitalsValue, v: string) => onChange({ ...value, [k]: v }),
    [value, onChange],
  );
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Field label="Weight (kg)">
        <Input
          value={value.weightKg ?? ""}
          onChange={(e) => set("weightKg", e.target.value)}
          disabled={disabled}
        />
      </Field>
      <Field label="Height (cm)">
        <Input
          value={value.heightCm ?? ""}
          onChange={(e) => set("heightCm", e.target.value)}
          disabled={disabled}
        />
      </Field>
      <Field label="BMI">
        <Input
          value={value.bmi ?? ""}
          onChange={(e) => set("bmi", e.target.value)}
          disabled={disabled}
        />
      </Field>
      <Field label="Pulse (bpm)">
        <Input
          value={value.pulseBpm ?? ""}
          onChange={(e) => set("pulseBpm", e.target.value)}
          disabled={disabled}
        />
      </Field>
      <Field label="SpO₂ %">
        <Input
          value={value.spo2 ?? ""}
          onChange={(e) => set("spo2", e.target.value)}
          disabled={disabled}
        />
      </Field>
      <Field label="BP (mmHg)">
        <Input
          value={value.bp ?? ""}
          onChange={(e) => set("bp", e.target.value)}
          placeholder="120/80"
          disabled={disabled}
        />
      </Field>
    </div>
  );
}

export interface ComorbiditiesValue extends Record<string, unknown> {
  dm?: string;
  htn?: string;
  cad?: string;
  pcos?: string;
  thyroid?: string;
  otherFlag?: string;
  otherText?: string;
  thyroidEnd?: string;
}

const COMORBIDITY_KEYS: ReadonlyArray<{
  key: keyof ComorbiditiesValue;
  label: string;
}> = [
  { key: "dm", label: "DM" },
  { key: "htn", label: "HTN" },
  { key: "cad", label: "CAD" },
  { key: "pcos", label: "PCOS" },
  { key: "thyroid", label: "Thyroid" },
];

export function ComorbiditiesField({
  value,
  onChange,
  disabled,
}: {
  value: ComorbiditiesValue;
  onChange: (v: ComorbiditiesValue) => void;
  disabled?: boolean;
}) {
  const setBox = (k: keyof ComorbiditiesValue, on: boolean) => {
    onChange({ ...value, [k]: on ? "☑" : "☐" });
  };
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {COMORBIDITY_KEYS.map(({ key, label }) => (
        <label
          key={key}
          className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
        >
          <input
            type="checkbox"
            checked={value[key] === "☑"}
            onChange={(e) => setBox(key, e.target.checked)}
            disabled={disabled}
          />
          {label}
        </label>
      ))}
      <Input
        placeholder="Other (specify)"
        value={value.otherText ?? ""}
        onChange={(e) =>
          onChange({
            ...value,
            otherText: e.target.value,
            otherFlag: e.target.value ? "☑" : "☐",
          })
        }
        disabled={disabled}
        className="sm:col-span-2"
      />
    </div>
  );
}

// ───────── Repeatable row table ─────────

export interface ColumnDef<T> {
  key: keyof T;
  label: string;
  width?: string; // e.g. "w-16" or "w-24"
  type?: "text" | "checkbox";
}

export function RepeatableTable<T extends Record<string, unknown>>({
  rows,
  columns,
  onChange,
  blank,
  disabled,
  minRows = 1,
}: {
  rows: T[];
  columns: ReadonlyArray<ColumnDef<T>>;
  onChange: (rows: T[]) => void;
  blank: () => T;
  disabled?: boolean;
  minRows?: number;
}) {
  const setRow = (idx: number, k: keyof T, v: unknown) => {
    const copy = rows.slice();
    copy[idx] = { ...(copy[idx] ?? blank()), [k]: v } as T;
    onChange(copy);
  };
  const removeRow = (idx: number) => {
    if (rows.length <= minRows) return;
    onChange(rows.filter((_, i) => i !== idx));
  };
  const addRow = () => onChange([...rows, blank()]);

  // Pad to minRows so new templates show empty rows out of the box.
  const padded = rows.length < minRows ? [...rows, ...new Array(minRows - rows.length).fill(null).map(() => blank())] : rows;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              {columns.map((c) => (
                <th key={String(c.key)} className={`px-2 py-1 text-left ${c.width ?? ""}`}>
                  {c.label}
                </th>
              ))}
              {!disabled ? <th className="w-10" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {padded.map((row, idx) => (
              <tr key={idx}>
                {columns.map((c) => {
                  const raw = row?.[c.key];
                  if (c.type === "checkbox") {
                    const checked = raw === "☑";
                    return (
                      <td key={String(c.key)} className="px-2 py-1">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setRow(idx, c.key, e.target.checked ? "☑" : "☐")
                          }
                          disabled={disabled}
                        />
                      </td>
                    );
                  }
                  return (
                    <td key={String(c.key)} className="px-1 py-0.5">
                      <Input
                        value={typeof raw === "string" ? raw : ""}
                        onChange={(e) => setRow(idx, c.key, e.target.value)}
                        disabled={disabled}
                        className="h-7 text-xs"
                      />
                    </td>
                  );
                })}
                {!disabled ? (
                  <td className="px-1 py-0.5 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => removeRow(idx)}
                      disabled={padded.length <= minRows}
                    >
                      ✕
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!disabled ? (
        <Button type="button" size="sm" variant="outline" onClick={addRow}>
          + Add row
        </Button>
      ) : null}
    </div>
  );
}

// ───────── Recommendation picker ─────────

export interface ServiceOption {
  id: string;
  name: string;
  basePrice: number;
  gstRate: number;
  participantCount: number;
}

export interface RecommendationItem {
  serviceId: string;
  serviceName: string;
  count: number;
  perAmount?: number;
  gstRate?: number;
}

export function RecommendationPicker({
  services,
  value,
  onChange,
  disabled,
}: {
  services: ServiceOption[];
  value: RecommendationItem[];
  onChange: (v: RecommendationItem[]) => void;
  disabled?: boolean;
}) {
  const add = (serviceId: string) => {
    if (!serviceId) return;
    const svc = services.find((s) => s.id === serviceId);
    if (!svc) return;
    if (value.find((r) => r.serviceId === serviceId)) return;
    onChange([
      ...value,
      {
        serviceId: svc.id,
        serviceName: svc.name,
        count: 6,
        perAmount: svc.basePrice,
        gstRate: svc.gstRate,
      },
    ]);
  };
  const setCount = (serviceId: string, count: number) => {
    onChange(
      value.map((r) =>
        r.serviceId === serviceId ? { ...r, count: Math.max(1, count) } : r,
      ),
    );
  };
  const remove = (serviceId: string) => {
    onChange(value.filter((r) => r.serviceId !== serviceId));
  };
  return (
    <div className="space-y-2">
      <Select
        value=""
        onValueChange={(v) => add(v)}
        disabled={disabled || services.length === 0}
      >
        <SelectTrigger>
          <SelectValue
            placeholder={
              services.length === 0 ? "No services in this department" : "Add a service…"
            }
          />
        </SelectTrigger>
        <SelectContent>
          {services.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name} (₹{s.basePrice})
              {s.participantCount > 1 ? ` · qty=${s.participantCount}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value.length > 0 ? (
        <ul className="space-y-1.5">
          {value.map((r) => (
            <li
              key={r.serviceId}
              className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-1.5"
            >
              <span className="flex-1 text-sm">{r.serviceName}</span>
              <Input
                type="number"
                min={1}
                max={50}
                value={r.count}
                onChange={(e) => setCount(r.serviceId, Number(e.target.value))}
                disabled={disabled}
                className="h-8 w-20"
              />
              <span className="text-xs text-muted-foreground">sessions</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => remove(r.serviceId)}
                disabled={disabled}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

// ───────── Session protocol (every clinical form) ─────────
// Free-text textarea: what the therapist actually did this session — exercise
// list, modalities, progressions, etc. Distinct from `treatmentProtocol`
// (long-term plan) and from session notes (subjective response). Persists
// in Consultation.formData.sessionProtocol (no schema column needed —
// formData is already JSON).
export function SessionProtocolField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Section
      title="Session protocol"
      description="Plan / approach used in this session — exercises, modalities, progressions."
    >
      <textarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={4}
        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
        placeholder="e.g. 3×10 squats, hip mobility flow, theraband side-steps, 10 min cupping mid-back…"
      />
    </Section>
  );
}
