"use client";

import { useState } from "react";

export function Collapsible({
  title,
  eyebrow,
  children,
  defaultOpen = false,
  badge,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="mt-8 first:mt-0">
      <button
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 border-b border-[#c8bea8] pb-2 text-left"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span>
          <span className="block eyebrow">{eyebrow}</span>
          <span className="mt-1 block font-serif text-xl font-bold text-[#1c2b3a]">{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {badge ? <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[#9a9a9a]">{badge}</span> : null}
          <span aria-hidden="true" className="font-mono text-sm text-[#7a7a7a]">{open ? "−" : "+"}</span>
        </span>
      </button>
      {open ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}