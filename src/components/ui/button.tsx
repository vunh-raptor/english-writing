import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold ring-offset-background transition-[background-color,color,box-shadow,transform] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // The one filled action per view: an accent gradient pill.
        default:
          "bg-accent-gradient text-white shadow-glow hover:-translate-y-px hover:shadow-[0_14px_28px_-10px_hsl(var(--primary)/0.7)] dark:text-white",
        brand:
          "bg-accent-gradient text-white shadow-glow hover:-translate-y-px dark:text-white",
        secondary:
          "border border-input bg-card text-foreground shadow-soft hover:border-primary/40 hover:bg-accent",
        outline:
          "border border-input bg-card/70 text-foreground hover:border-primary/40 hover:bg-accent hover:text-accent-foreground",
        sage: "bg-primary text-primary-foreground hover:bg-oxford-deep",
        // Everything that isn't the primary action.
        ghost: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-[hsl(var(--destructive)/0.9)]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 px-4 text-[13.5px]",
        lg: "h-11 px-6 text-base",
        xl: "h-[52px] px-8 text-base",
        icon: "h-10 w-10",
        "icon-sm": "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
