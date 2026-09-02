"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/actions";
import { NavLink } from "@/components/nav-link";

const navigation = [
  { href: "/", label: "Home", short: "Home" },
  { href: "/activity", label: "Activity", short: "Activity" },
  { href: "/budget", label: "Budget", short: "Budget" },
];

const PRIVACY_STORAGE_KEY = "kashin-privacy-mode";
const moneyPattern = /(?:NZ)?[-+]?\$[\d,.]+/g;

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.7" />
      {hidden && <path d="m4 4 16 16" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />}
    </svg>
  );
}

function PrivacyButton({ privateMode, onToggle, mobile = false }: { privateMode: boolean; onToggle: () => void; mobile?: boolean }) {
  return (
    <button
      aria-label={privateMode ? "Show dollar values" : "Hide dollar values"}
      aria-pressed={privateMode}
      className={mobile
        ? "flex min-h-10 items-center gap-2 border border-[#b8922a] bg-[#faf7f0] px-3 font-mono text-[9px] uppercase tracking-[0.07em] text-[#1c2b3a]"
        : "flex w-full items-center justify-center gap-2 border border-[#b8922a]/70 px-3 py-2.5 font-mono text-[9px] uppercase tracking-[0.08em] text-white transition hover:bg-white/5 hover:text-[#c8a84b]"}
      onClick={onToggle}
      title={privateMode ? "Show dollar values" : "Hide dollar values"}
      type="button"
    >
      <EyeIcon hidden={privateMode} />
      <span>{privateMode ? "Show values" : "Privacy mode"}</span>
    </button>
  );
}

export function FinanceChrome({ children }: { children: React.ReactNode }) {
  const [privateMode, setPrivateMode] = useState(false);
  const [privacyPreferenceLoaded, setPrivacyPreferenceLoaded] = useState(false);
  const originalMoneyText = useRef(new WeakMap<Text, string>());

  useEffect(() => {
    const loadPreference = window.setTimeout(() => {
      setPrivateMode(window.localStorage.getItem(PRIVACY_STORAGE_KEY) === "on");
      setPrivacyPreferenceLoaded(true);
    }, 0);
    return () => window.clearTimeout(loadPreference);
  }, []);

  useEffect(() => {
    if (!privacyPreferenceLoaded) return;
    const root = document.querySelector("[data-finance-content]");
    if (!root) return;

    const visitTextNodes = (container: Node, mask: boolean) => {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();
      while (current) {
        const text = current as Text;
        if (mask) {
          if (moneyPattern.test(text.data)) {
            moneyPattern.lastIndex = 0;
            originalMoneyText.current.set(text, text.data);
            text.data = text.data.replace(moneyPattern, "***");
          } else {
            moneyPattern.lastIndex = 0;
          }
        } else {
          const original = originalMoneyText.current.get(text);
          if (original !== undefined) text.data = original;
        }
        current = walker.nextNode();
      }
    };

    visitTextNodes(root, privateMode);
    window.localStorage.setItem(PRIVACY_STORAGE_KEY, privateMode ? "on" : "off");

    if (!privateMode) return;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") visitTextNodes(mutation.target.parentNode ?? mutation.target, true);
        for (const node of mutation.addedNodes) visitTextNodes(node, true);
      }
    });
    observer.observe(root, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [privateMode, privacyPreferenceLoaded]);

  const togglePrivacy = () => setPrivateMode((value) => !value);

  return (
    <main className="min-h-screen bg-[#f0ebe0] text-[#1a1a1a] md:flex">
      <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col overflow-hidden bg-[#1c2b3a] py-6 text-white md:flex">
        <Link className="px-6 font-serif text-xl font-bold" href="/">
          Kashin
        </Link>
        <div className="mx-6 mb-5 mt-4 h-[3px] border-y border-[#b8922a]" />
        <nav className="flex flex-col overflow-y-auto">
          {navigation.map((item) => (
            <NavLink
              className="border-l-[3px] border-transparent px-6 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-white/60 transition hover:border-[#b8922a] hover:bg-white/5 hover:text-white"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </NavLink>
          ))}
          <NavLink
            className="border-l-[3px] border-transparent px-6 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-white/60 transition hover:border-[#b8922a] hover:bg-white/5 hover:text-white"
            href="/settings"
          >
            Settings
          </NavLink>
        </nav>
        <div className="mt-auto px-6">
          <PrivacyButton onToggle={togglePrivacy} privateMode={privateMode} />
          <p className="font-mono text-[9px] uppercase leading-5 tracking-[0.1em] text-white/35">
            Akahu connected
            <br />SQLite · private server
          </p>
          <form action={logout}>
            <button className="mt-4 font-mono text-[10px] uppercase tracking-[0.08em] text-white/55 hover:text-[#c8a84b]" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between gap-3 border-b border-[#c8bea8] bg-[#f0ebe0] px-4 py-3 md:hidden">
          <Link className="font-serif text-lg font-bold text-[#1c2b3a]" href="/">
            Kashin
          </Link>
          <PrivacyButton mobile onToggle={togglePrivacy} privateMode={privateMode} />
        </header>
        <div data-finance-content>{children}</div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t border-[#c8bea8] bg-[#faf7f0] md:hidden">
        {navigation.map((item) => (
          <NavLink
            className="grid min-h-12 place-items-center border-t-2 border-transparent px-1 font-mono text-[9px] uppercase tracking-[0.05em] text-[#7a7a7a]"
            href={item.href}
            key={item.href}
            mobile
          >
            {item.short}
          </NavLink>
        ))}
        <NavLink
          className="grid min-h-12 place-items-center border-t-2 border-transparent px-1 font-mono text-[9px] uppercase tracking-[0.05em] text-[#7a7a7a]"
          href="/settings"
          mobile
        >
          Settings
        </NavLink>
      </nav>
    </main>
  );
}

export function FinanceShell({
  children,
  eyebrow,
  title,
  description,
  action,
  wide = false,
}: {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <FinanceChrome>
      <div
        className={`mx-auto w-full px-4 pb-24 pt-6 lg:px-8 lg:pb-10 lg:pt-8 ${
          wide ? "max-w-[1120px]" : "max-w-[720px]"
        }`}
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="mt-2 font-serif text-[28px] font-bold leading-tight text-[#1c2b3a]">
              {title}
            </h1>
            {description && (
              <p className="mt-2 max-w-xl text-sm leading-5 text-[#4a4a4a]">
                {description}
              </p>
            )}
          </div>
          {action}
        </div>
        <div className="double-rule mt-5" />
        <div className={description ? "mt-5" : "mt-4"}>{children}</div>
      </div>
    </FinanceChrome>
  );
}
