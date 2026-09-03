"use client";

import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConnectionState =
  | { status: "idle"; message?: string }
  | { status: "testing"; message?: string }
  | { status: "ok"; message: string }
  | { status: "fail"; message: string }
  | { status: "warn"; message: string };

const styles: Record<Exclude<ConnectionState["status"], "idle">, string> = {
  testing: "border-[#c8bea8] bg-[#faf8f3] text-[#1c2b3a]",
  ok: "border-[#1a5c2a] bg-[#eef6ee] text-[#1a5c2a]",
  fail: "border-[#b43b31] bg-[#faf7f0] text-[#b43b31]",
  warn: "border-[#b8922a] bg-[#fdf8e9] text-[#8a6d00]",
};

function Icon({ state }: { state: ConnectionState }) {
  switch (state.status) {
    case "testing":
      return <Loader2 className="h-4 w-4 animate-spin" />;
    case "ok":
      return <CheckCircle2 className="h-4 w-4" />;
    case "fail":
      return <XCircle className="h-4 w-4" />;
    case "warn":
      return <AlertTriangle className="h-4 w-4" />;
    default:
      return null;
  }
}

export function ConnectionBanner({
  state,
  className,
}: {
  state: ConnectionState;
  className?: string;
}) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <div
      role={state.status === "fail" ? "alert" : "status"}
      aria-live="polite"
      className={cn(
        "flex items-start gap-2 border-l-4 px-3 py-2.5 text-sm leading-5",
        styles[state.status as Exclude<ConnectionState["status"], "idle">],
        className,
      )}
    >
      <Icon state={state} />
      <span>{state.message}</span>
    </div>
  );
}