"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-[15px] w-[15px] shrink-0 border border-[#c8bea8] bg-[#faf7f0] outline-none transition focus-visible:ring-2 focus-visible:ring-[#b8922a]/40 focus-visible:ring-offset-1 focus-visible:ring-offset-[#f0ebe0] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-[#1c2b3a] data-[state=checked]:bg-[#1c2b3a] data-[state=checked]:text-white",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("flex items-center justify-center text-current")}
    >
      {props["aria-checked"] === "mixed" ? (
        <Minus className="h-3 w-3" />
      ) : (
        <Check className="h-3 w-3" />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };