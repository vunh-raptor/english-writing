import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-none border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/12 text-primary",
        brand: "border-transparent bg-brand-muted text-brand-ink",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        sage: "border-transparent bg-sage-muted text-sage-ink",
        outline: "border-border text-muted-foreground",
        // mono uppercase kicker — the Scriptorium section label
        eyebrow:
          "border-transparent bg-transparent px-0 font-mono text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
