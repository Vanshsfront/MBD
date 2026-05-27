"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ── Shared form sub-components used across all clinical templates ──

export function YesNoField({ label, value, onChange, disabled, color = "blue" }: {
  label: string; value: "yes" | "no" | ""; onChange: (v: "yes" | "no" | "") => void; disabled?: boolean; color?: "blue" | "rose" | "emerald";
}) {
  const active = color === "rose" ? "bg-rose-50 border-rose-300 text-rose-700"
    : color === "emerald" ? "bg-emerald-50 border-emerald-300 text-emerald-700"
    : "bg-blue-50 border-blue-300 text-blue-700";
  return (
    <div className="flex items-center gap-3">
      <Label className="text-xs font-semibold flex-1">{label}</Label>
      <div className="flex gap-2">
        {(["yes", "no"] as const).map(opt => (
          <button key={opt} type="button" disabled={disabled}
            onClick={() => onChange(value === opt ? "" : opt)}
            className={`h-8 px-3 rounded-md text-xs font-semibold border transition-colors disabled:opacity-50 ${value === opt ? active : "bg-surface border-border-light text-text-secondary hover:border-border"}`}
          >{opt === "yes" ? "Yes" : "No"}</button>
        ))}
      </div>
    </div>
  );
}

export function ChoiceField<T extends string>({ label, value, onChange, options, disabled, color = "blue" }: {
  label: string; value: T | ""; onChange: (v: T | "") => void; options: Array<[T, string]>; disabled?: boolean; color?: "blue" | "rose" | "emerald";
}) {
  const active = color === "rose" ? "bg-rose-50 border-rose-300 text-rose-700"
    : color === "emerald" ? "bg-emerald-50 border-emerald-300 text-emerald-700"
    : "bg-blue-50 border-blue-300 text-blue-700";
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([k, l]) => (
          <button key={k} type="button" disabled={disabled}
            onClick={() => onChange(value === k ? "" : k)}
            className={`h-8 px-3 rounded-md text-xs font-semibold border transition-colors disabled:opacity-50 ${value === k ? active : "bg-surface border-border-light text-text-secondary hover:border-border"}`}
          >{l}</button>
        ))}
      </div>
    </div>
  );
}

export function ConsentRow({ checked, onChange, label, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-2.5 text-xs text-text-secondary cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={v => onChange(v === true)} className="mt-0.5" disabled={disabled} />
      <span>{label}</span>
    </label>
  );
}

export function FormSection({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-xl border border-border-light p-5 space-y-4">
      <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

export function FormRow({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  return <div className={`grid grid-cols-${cols} gap-4`}>{children}</div>;
}

export function FormField({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-text-secondary">{label}{required && " *"}</Label>
      {children}
    </div>
  );
}

export function TextInput({ value, onChange, placeholder, disabled, type = "text", min, max, step }: {
  value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean;
  type?: string; min?: number; max?: number; step?: number | string;
}) {
  return (
    <Input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="h-9 text-sm" disabled={disabled} min={min} max={max} step={step} />
  );
}

export function TextAreaInput({ value, onChange, placeholder, disabled, rows = 3 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; rows?: number;
}) {
  return (
    <Textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="text-sm" disabled={disabled} rows={rows} />
  );
}

export function SelectInput({ value, onChange, placeholder, options, disabled }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  options: Array<{ value: string; label: string }>; disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={v => v && onChange(v)} disabled={disabled}>
      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={placeholder || "Select"} /></SelectTrigger>
      <SelectContent className="bg-surface max-h-48">
        {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// Multi-service tag selector
export function ServiceTags({ selectedIds, services, onChange, disabled }: {
  selectedIds: string[]; services: Array<{ id: string; name: string }>; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const available = services.filter(s => !selectedIds.includes(s.id));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {selectedIds.map(id => {
          const svc = services.find(s => s.id === id);
          return (
            <span key={id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              {svc?.name || id}
              {!disabled && (
                <button type="button" onClick={() => onChange(selectedIds.filter(x => x !== id))}
                  className="hover:text-blue-900 transition-colors">×</button>
              )}
            </span>
          );
        })}
        {!disabled && available.length > 0 && !adding && (
          <button type="button" onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-surface-secondary text-text-secondary border border-border-light hover:border-blue-300 transition-colors">
            + Add Service
          </button>
        )}
      </div>
      {adding && (
        <div className="flex items-center gap-2">
          <Select onValueChange={(v: string | null) => { if (v) { onChange([...selectedIds, v]); setAdding(false); } }}>
            <SelectTrigger className="h-9 text-sm flex-1"><SelectValue placeholder="Select a service" /></SelectTrigger>
            <SelectContent className="bg-surface max-h-48">
              {available.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <button type="button" onClick={() => setAdding(false)} className="text-xs text-text-tertiary hover:text-text-primary">Cancel</button>
        </div>
      )}
      {selectedIds.length === 0 && <p className="text-xs text-amber-600">At least one service is required</p>}
    </div>
  );
}
