"use client";

// Two-card phone input — country code select + national-number text field.
// Stores composite value as "+CC NNNNNNNNNN" (e.g. "+91 9876543210") so
// existing Prisma String columns + DOCX rendering keep working unchanged.
// Parses legacy "9876543210" inputs (no code) by defaulting to +91 (India).

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Most common codes for an India clinic with NRI / overseas patients.
// Add to this list if more are needed — order matters (defaults to first
// when no code is detected).
export const COUNTRY_CODES: ReadonlyArray<{ code: string; label: string; flag: string }> = [
  { code: "+91", label: "India", flag: "🇮🇳" },
  { code: "+1", label: "USA / Canada", flag: "🇺🇸" },
  { code: "+44", label: "UK", flag: "🇬🇧" },
  { code: "+971", label: "UAE", flag: "🇦🇪" },
  { code: "+966", label: "Saudi Arabia", flag: "🇸🇦" },
  { code: "+974", label: "Qatar", flag: "🇶🇦" },
  { code: "+65", label: "Singapore", flag: "🇸🇬" },
  { code: "+61", label: "Australia", flag: "🇦🇺" },
  { code: "+86", label: "China", flag: "🇨🇳" },
  { code: "+49", label: "Germany", flag: "🇩🇪" },
  { code: "+33", label: "France", flag: "🇫🇷" },
  { code: "+81", label: "Japan", flag: "🇯🇵" },
  { code: "+880", label: "Bangladesh", flag: "🇧🇩" },
  { code: "+92", label: "Pakistan", flag: "🇵🇰" },
  { code: "+977", label: "Nepal", flag: "🇳🇵" },
  { code: "+94", label: "Sri Lanka", flag: "🇱🇰" },
];

function parse(value: string): { code: string; number: string } {
  const v = (value ?? "").trim();
  if (!v) return { code: "+91", number: "" };
  // Look for any known code as a prefix. Match longest first so +91 isn't
  // matched when the value starts with +911 (which would be an invalid US +1
  // expansion but still — longest-match keeps it safer).
  const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
  for (const c of sorted) {
    if (v.startsWith(c.code)) {
      return { code: c.code, number: v.slice(c.code.length).replace(/[^0-9]/g, "") };
    }
  }
  // Bare number (no code) — assume +91 since this is an India clinic.
  return { code: "+91", number: v.replace(/[^0-9]/g, "") };
}

function compose(code: string, number: string): string {
  const digits = number.replace(/[^0-9]/g, "");
  if (!digits) return "";
  return `${code} ${digits}`;
}

export function PhoneField({
  value,
  onChange,
  onBlur,
  id,
  required,
  invalid,
  disabled,
  placeholder = "10-digit number",
  maxLength = 15,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  id?: string;
  required?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}) {
  const parsed = useMemo(() => parse(value), [value]);

  return (
    <div className={cn("flex gap-1.5", className)}>
      <select
        aria-label="Country code"
        value={parsed.code}
        disabled={disabled}
        onChange={(e) => onChange(compose(e.target.value, parsed.number))}
        onBlur={onBlur}
        className={cn(
          "flex h-9 shrink-0 rounded-md border bg-card px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
          "min-w-[88px]",
          invalid ? "border-destructive" : "border-input",
        )}
      >
        {COUNTRY_CODES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.flag} {c.code}
          </option>
        ))}
      </select>
      <Input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        value={parsed.number}
        required={required}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => {
          // Strip non-digits at the source so we never store junk.
          const digits = e.target.value.replace(/[^0-9]/g, "");
          onChange(compose(parsed.code, digits));
        }}
        onBlur={onBlur}
        className={cn("flex-1", invalid ? "border-destructive" : "")}
      />
    </div>
  );
}
