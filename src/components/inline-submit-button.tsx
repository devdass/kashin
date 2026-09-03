"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * A submit button for server-action `<form>`s that swaps its label for a
 * "…ing" state with a spinner while the action is in flight (via useFormStatus).
 * Use inside a `<form action={...}>`.
 */
export function InlineSubmitButton({
  idleLabel,
  pendingLabel,
  className,
  variant = "outline",
}: {
  idleLabel: string;
  pendingLabel: string;
  className?: string;
  variant?: "outline" | "navy" | "danger";
}) {
  const { pending } = useFormStatus();
  const base =
    "min-h-10 inline-flex items-center justify-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] transition disabled:pointer-events-none disabled:opacity-60";
  const variants: Record<typeof variant, string> = {
    outline:
      "border border-[#1c2b3a] px-4 text-[#1a3a5c] hover:bg-[#1c2b3a] hover:text-white",
    navy: "bg-[#1c2b3a] px-6 text-white hover:bg-[#b8922a] hover:text-[#1c2b3a]",
    danger: "px-2 text-[#b43b31] hover:underline",
  };
  return (
    <button className={cn(base, variants[variant], className)} disabled={pending} type="submit">
      {pending ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {pendingLabel}
        </>
      ) : (
        idleLabel
      )}
    </button>
  );
}