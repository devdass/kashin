import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-mono uppercase tracking-[0.08em] text-xs transition-colors disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary: "bg-[#b8922a] text-[#1c2b3a] hover:bg-[#c8a84b]",
        navy: "bg-[#1c2b3a] text-white hover:bg-[#b8922a] hover:text-[#1c2b3a]",
        outline: "border border-[#1c2b3a] text-[#1a3a5c] hover:bg-[#1c2b3a] hover:text-white",
        ghost: "text-[#7a7a7a] hover:text-[#b8922a]",
        danger: "border border-[#b43b31] text-[#b43b31] hover:bg-[#b43b31] hover:text-white",
      },
      size: {
        default: "min-h-10 px-5",
        sm: "min-h-8 px-3 text-[10px]",
        lg: "min-h-11 px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "navy",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };