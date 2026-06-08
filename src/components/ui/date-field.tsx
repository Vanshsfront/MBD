"use client";

// Shared date picker for cross-browser consistency. Native <input type="date">
// renders very differently across Safari / Chrome / Edge — this is a single
// Radix-based component that looks identical everywhere. API mirrors the
// native input: pass `value` as "yyyy-MM-dd" (the same string the native
// input emits), receive the same string from onChange. Existing call sites
// can swap with minimal churn.

import { useMemo, useState } from "react";
import { format, parse, isValid } from "date-fns";
import { DayPicker, type Matcher } from "react-day-picker";
import "react-day-picker/style.css";
import { CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ISO = "yyyy-MM-dd";

function parseIso(v: string | null | undefined): Date | undefined {
  if (!v) return undefined;
  const d = parse(v, ISO, new Date());
  return isValid(d) ? d : undefined;
}

export function DateField({
  value,
  onChange,
  id,
  min,
  max,
  required,
  invalid,
  disabled,
  placeholder = "Pick a date",
  className,
  defaultMonth,
}: {
  /** Date as ISO yyyy-MM-dd (matches native input[type=date]). */
  value: string;
  onChange: (v: string) => void;
  id?: string;
  min?: string;
  max?: string;
  required?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Month to focus when there's no value yet. Defaults to today. */
  defaultMonth?: Date;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => parseIso(value), [value]);
  const minDate = useMemo(() => parseIso(min), [min]);
  const maxDate = useMemo(() => parseIso(max), [max]);

  const display = selected
    ? format(selected, "dd MMM yyyy")
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          id={id}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-required={required || undefined}
          className={cn(
            "h-9 w-full justify-start gap-2 px-3 font-normal",
            !selected && "text-muted-foreground",
            invalid && "border-destructive",
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
          <span className="truncate">{display}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <DayPicker
          mode="single"
          selected={selected}
          defaultMonth={selected ?? defaultMonth ?? new Date()}
          disabled={
            ((): Matcher[] | undefined => {
              const m: Matcher[] = [];
              if (minDate) m.push({ before: minDate });
              if (maxDate) m.push({ after: maxDate });
              return m.length ? m : undefined;
            })()
          }
          captionLayout="dropdown"
          startMonth={new Date(1900, 0, 1)}
          endMonth={new Date(new Date().getFullYear() + 5, 11, 31)}
          onSelect={(d) => {
            if (d) {
              onChange(format(d, ISO));
              setOpen(false);
            } else {
              onChange("");
            }
          }}
          className="p-3"
        />
      </PopoverContent>
    </Popover>
  );
}
