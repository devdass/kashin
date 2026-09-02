import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "w-full border border-[#c8bea8] bg-[#faf8f3] px-3 py-2 text-sm text-[#1a1a1a] outline-none transition focus:border-[#b8922a] focus:ring-2 focus:ring-[#b8922a]/15 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };