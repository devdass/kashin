"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  children,
  className,
  mobile = false,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  mobile?: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href;

  if (mobile) {
    return (
      <Link
        className={`grid min-h-12 place-items-center border-t-2 px-1 font-mono text-[9px] uppercase tracking-[0.05em] ${
          active
            ? "border-[#1c2b3a] text-[#1c2b3a]"
            : "border-transparent text-[#7a7a7a]"
        }`}
        href={href}
      >
        {children}
      </Link>
    );
  }

  return (
    <Link
      className={`border-l-[3px] px-6 py-3 font-mono text-[11px] uppercase tracking-[0.08em] transition ${
        active
          ? "border-[#b8922a] bg-white/5 text-white"
          : "border-transparent text-white/60 hover:border-[#b8922a] hover:bg-white/5 hover:text-white"
      } ${className ?? ""}`}
      href={href}
    >
      {children}
    </Link>
  );
}
