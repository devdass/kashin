"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { cn } from "@/lib/utils";
import { ConnectionBanner, type ConnectionState } from "@/components/connection-banner";

export type InlineActionResult = { ok: boolean; message?: string };

/**
 * Wraps a server-action `<form>` (action returns `{ ok, message }`) so the
 * button shows a spinner + "…ing" label while pending and an inline
 * success/failure banner once it resolves. No redirects, no page reload.
 */
export function InlineActionForm({
  action,
  idleLabel,
  pendingLabel,
  okMessage,
  children,
  className,
  buttonClassName,
}: {
  action: (formData: FormData) => Promise<InlineActionResult>;
  idleLabel: string;
  pendingLabel: string;
  okMessage?: string;
  children?: React.ReactNode;
  className?: string;
  buttonClassName?: string;
}) {
  const [state, formAction, pending] = useActionState<
    InlineActionResult,
    FormData
  >(async (_prev, formData) => action(formData), { ok: false });

  const bannerState: ConnectionState =
    pending
      ? { status: "testing", message: `${pendingLabel}…` }
      : state.message || (state.ok && okMessage)
        ? state.ok
          ? { status: "ok", message: state.message ?? okMessage ?? "Done." }
          : { status: "fail", message: state.message ?? "That didn't work." }
        : { status: "idle" };

  return (
    <div>
      <form action={formAction} className={className}>
        {children}
        <button
          className={cn(
            "min-h-10 inline-flex items-center justify-center gap-2 border border-[#1c2b3a] px-4 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#1a3a5c] transition hover:bg-[#1c2b3a] hover:text-white disabled:pointer-events-none disabled:opacity-60",
            buttonClassName,
          )}
          disabled={pending}
          type="submit"
        >
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {pendingLabel}
            </>
          ) : (
            idleLabel
          )}
        </button>
      </form>
      <div className="mt-2">
        <ConnectionBanner state={bannerState} />
      </div>
    </div>
  );
}