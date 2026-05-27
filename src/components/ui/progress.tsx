import * as React from "react";
import { cn } from "@/lib/utils";

// Lightweight progress bar (no Radix dep). `value` is 0–100.
export function Progress({
  value = 0,
  className,
  indicatorClassName,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value?: number; indicatorClassName?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <div
        className={cn("h-full rounded-full bg-primary transition-all", indicatorClassName)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
