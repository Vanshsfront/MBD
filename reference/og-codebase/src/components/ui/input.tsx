import * as React from "react";
import { cn } from "@/lib/utils";

// Input recipe matches the legacy codebase: h-9 (a touch shorter than the
// shadcn default), rounded-lg corners, a warm ring on focus, and explicit
// aria-invalid error styling so the FieldErrors in forms light up red on
// submit-time validation failures.

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-lg border border-[color:var(--border)] bg-card px-3 py-1 text-sm shadow-[0_1px_1px_0_var(--shadow-color)] transition-[border-color,box-shadow] placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30",
        "aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20",
        "disabled:cursor-not-allowed disabled:bg-muted/40 disabled:opacity-60",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
