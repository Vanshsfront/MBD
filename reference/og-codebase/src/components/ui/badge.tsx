import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Badge recipe matches the legacy pill aesthetic — rounded-full, h-5, with
// a tinted ring. We keep the existing semantic variants (default / success
// / warning / danger / info / outline) since the dashboard uses every one
// of them — only the shape changes.

const badgeVariants = cva(
  "inline-flex h-5 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
  {
    variants: {
      variant: {
        default: "bg-secondary text-foreground ring-[color:var(--border)]",
        success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
        warning: "bg-amber-50 text-amber-800 ring-amber-200",
        danger: "bg-red-50 text-red-700 ring-red-200",
        info: "bg-sky-50 text-sky-700 ring-sky-200",
        outline: "bg-transparent text-foreground ring-[color:var(--border)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
