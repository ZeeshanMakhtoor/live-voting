import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-none border-2 font-bold uppercase tracking-wide transition-colors disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        default:
          "border-foreground bg-foreground text-background hover:bg-accent hover:border-accent",
        outline: "border-foreground bg-transparent text-foreground hover:bg-foreground/5",
        accent: "border-accent bg-accent text-accent-foreground hover:opacity-90",
        destructive:
          "border-destructive bg-transparent text-destructive hover:bg-destructive hover:text-destructive-foreground",
        // For a control that is deliberately not actionable yet, rather
        // than a live control that happens to be unavailable. Reads as a
        // waiting state instead of a broken one.
        muted: "border-foreground/25 bg-muted text-muted-foreground",
      },
      size: {
        default: "h-11 px-4 text-sm",
        lg: "h-14 px-8 text-base",
        sm: "h-9 px-3 text-xs",
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
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };
