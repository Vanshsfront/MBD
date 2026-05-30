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

// Expected national-number digit length per country code. Ranges accommodate
// countries with variable lengths (UK mobile = 10, landline = 11; Germany has
// 10-11). Unknown codes fall back to "min 7" generic check elsewhere.
const PHONE_DIGIT_LENGTH: Record<string, { min: number; max: number }> = {
  "+91": { min: 10, max: 10 },   // India
  "+1": { min: 10, max: 10 },    // US / Canada
  "+44": { min: 10, max: 11 },   // UK
  "+971": { min: 9, max: 9 },    // UAE
  "+966": { min: 9, max: 9 },    // Saudi Arabia
  "+974": { min: 8, max: 8 },    // Qatar
  "+65": { min: 8, max: 8 },     // Singapore
  "+61": { min: 9, max: 9 },     // Australia
  "+86": { min: 11, max: 11 },   // China
  "+49": { min: 10, max: 11 },   // Germany
  "+33": { min: 9, max: 9 },     // France
  "+81": { min: 10, max: 10 },   // Japan
  "+880": { min: 10, max: 10 },  // Bangladesh
  "+92": { min: 10, max: 10 },   // Pakistan
  "+977": { min: 10, max: 10 },  // Nepal
  "+94": { min: 9, max: 9 },     // Sri Lanka
};

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

/** Just the national-number digits, with the country code stripped. */
export function phoneNationalDigits(value: string): string {
  return parse(value).number;
}

/**
 * Returns an error message when the phone is invalid for its country code,
 * or null when it's acceptable. Empty value also returns null — callers add
 * a separate "required" check.
 */
export function validatePhone(value: string): string | null {
  const parsed = parse(value);
  if (!parsed.number) return null;
  const rule = PHONE_DIGIT_LENGTH[parsed.code];
  if (!rule) {
    // Unknown country code — fall back to the generic 7-digit floor.
    return parsed.number.length < 7 ? "Enter a valid phone number." : null;
  }
  if (parsed.number.length < rule.min || parsed.number.length > rule.max) {
    return rule.min === rule.max
      ? `Phone number must be ${rule.min} digits for ${parsed.code}.`
      : `Phone number must be ${rule.min}–${rule.max} digits for ${parsed.code}.`;
  }
  return null;
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
