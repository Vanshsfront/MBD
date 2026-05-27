import * as React from "react";
import { cn } from "@/lib/utils";

// Matches input.tsx styling (warm border, ring-3 focus halo, card surface).
export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[80px] w-full rounded-lg border border-[color:var(--border)] bg-card px-3 py-2 text-sm shadow-[0_1px_2px_0_var(--shadow-color)] placeholder:text-[color:var(--text-tertiary)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
