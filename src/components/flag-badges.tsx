// Color-coded client-flag badges (PRD §6 punchlist #8). Reused on the patient
// list, detail header, assignment queue, calendar tooltips and invoices.

import { cn } from "@/lib/utils";

export interface FlagLite {
  type: string;
  label: string;
  color: string | null;
}

// Map a flag's stored color name to a soft badge palette. Falls back to amber.
const COLOR_CLASS: Record<string, string> = {
  red: "bg-red-50 text-red-700 ring-red-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  yellow: "bg-amber-50 text-amber-700 ring-amber-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  purple: "bg-purple-50 text-purple-700 ring-purple-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  pink: "bg-pink-50 text-pink-700 ring-pink-200",
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
};

function classFor(color: string | null): string {
  return COLOR_CLASS[(color ?? "amber").toLowerCase()] ?? COLOR_CLASS.amber;
}

export function FlagBadges({
  flags,
  max,
  className,
}: {
  flags: FlagLite[];
  max?: number;
  className?: string;
}) {
  if (!flags || flags.length === 0) return null;
  const shown = max ? flags.slice(0, max) : flags;
  const extra = max && flags.length > max ? flags.length - max : 0;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {shown.map((f, i) => (
        <span
          key={`${f.type}-${i}`}
          title={f.type}
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset",
            classFor(f.color),
          )}
        >
          {f.label}
        </span>
      ))}
      {extra > 0 ? (
        <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-[color:var(--text-secondary)]">
          +{extra}
        </span>
      ) : null}
    </span>
  );
}
