"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Button recipe matches the legacy codebase:
// - rounded-lg base (the legacy used 12-16px radius across the size scale)
// - active:translate-y-px press effect for tactile feedback
// - focus-visible ring-3 + ring-ring/40 (warm-tinted halo, not cool offset)
// - "dark" variant is the dark-charcoal CTA the legacy login screen uses
// Size scale (sm / md / lg / icon) is unchanged to keep every callsite working.

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[background-color,color,transform,box-shadow] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_1px_2px_0_var(--shadow-color)] hover:bg-primary/90",
        dark: "btn-primary-dark",
        destructive: "bg-destructive text-destructive-foreground shadow-[0_1px_2px_0_var(--shadow-color)] hover:bg-destructive/90",
        outline:
          "border border-[color:var(--border)] bg-card text-foreground shadow-[0_1px_2px_0_var(--shadow-color)] hover:bg-secondary hover:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[0_1px_2px_0_var(--shadow-color)] hover:bg-muted",
        ghost: "hover:bg-secondary hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-[0.8rem]",
        md: "h-9 px-4",
        lg: "h-10 px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
