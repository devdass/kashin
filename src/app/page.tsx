import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth";
import { Brochure } from "@/components/brochure";
import { FinanceChrome } from "@/components/finance-shell";
import { getAuthenticatedUserId, hasAccount } from "@/lib/auth";
import { getAkahuTokens } from "@/lib/credentials";
import { getAccounts, getDashboardData } from "@/lib/finance-data";
import { isOnboardingComplete } from "@/lib/onboarding";
import { getVaultConfigurationError } from "@/lib/vault";
import { saveCredentials } from "./actions";
import { syncFinance } from "./finance-actions";
import { SpendingProfileCard } from "@/components/spending-profile-card";
import { getSpendingProfile } from "@/lib/insights";

const notices: Record<string, string> = {
  "account-created": "Your local account is ready.",
  "account-exists": "An account already exists. Sign in instead.",
  "login-failed": "The password was not accepted.",
  "login-locked": "Too many attempts. Login is locked for 15 minutes.",
  "password-length": "Use a password between 12 and 128 characters.",
  "password-mismatch": "The password confirmation did not match.",
  "session-expired": "Your session expired. Sign in again.",
  "tokens-invalid": "Akahu did not accept those tokens. Check both values.",
  "tokens-required": "Both Akahu tokens are required.",
  "tokens-saved": "Tokens verified with Akahu and encrypted locally.",
  "vault-invalid": "Configure the encryption key before saving tokens.",
  "sync-success": "Akahu accounts and transactions were synced to local SQLite.",
  "sync-failed": "The local Akahu sync failed. Try again from Settings.",
};

function formatMoney(amount: number, currency = "NZD") {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(amount);
}

function formatDate(value: string, short = false) {
  return new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: short ? "short" : "long",
    year: short ? undefined : "numeric",
    timeZone: "Pacific/Auckland",
  }).format(new Date(value));
}

function accountType(type: string) {
  const labels: Record<string, string> = {
    CHECKING: "Everyday",
    SAVINGS: "Savings",
    CREDITCARD: "Debt",
    LOAN: "Loan",
    KIWISAVER: "KiwiSaver",
    INVESTMENT: "Investment",
  };
  return labels[type] ?? type.toLowerCase();
}

function Notice({ value }: { value?: string }) {
  if (!value || !notices[value]) return null;
  const positive = ["account-created", "tokens-saved", "sync-success"].includes(value);
  return (
    <div className={`mb-6 border-l-4 px-4 py-3 text-sm ${positive ? "border-[#b8922a] bg-[#1c2b3a] text-white" : "border-[#b43b31] bg-[#faf7f0] text-[#b43b31]"}`}>
      {notices[value]}
    </div>
  );
}

function budgetSegments(categories: Array<{ color: string; amount: number }>) {
  const total = categories.reduce((sum, item) => sum + item.amount, 0);
  if (total <= 0) return { gradient: "", total };
  let cursor = 0;
  const stops: string[] = [];
  for (const item of categories) {
    if (item.amount <= 0) continue;
    const start = cursor;
    const end = cursor + (item.amount / total) * 100;
    stops.push(`${item.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`);
    cursor = end;
  }
  return { gradient: `conic-gradient(${stops.join(", ")})`, total };
}

export default async function Home({ searchParams }: { searchParams: Promise<{ notice?: string; period?: string; category?: string }> }) {
  const { notice, period, category } = await searchParams;
  const activePeriod = period === "month" ? "month" : "week";
  if (!hasAccount()) return <Brochure />;
  if (!(await getAuthenticatedUserId())) return <LoginForm notice={notice} />;
  if (!isOnboardingComplete()) redirect("/welcome");

  const vaultError = getVaultConfigurationError();
  let tokens = null;
  let credentialError: string | null = null;
  if (!vaultError) {
    try {
      tokens = getAkahuTokens();
    } catch {
      credentialError = "Stored tokens could not be decrypted with this key.";
    }
  }

  // Cache-first: read accounts and balances from local SQLite rather than
  // hitting Akahu's live API on every page load. Freshness is tracked via
  // the latest sync run; an explicit "Sync" action refreshes from Akahu.
  const accounts = getAccounts();
  const spendingProfile = tokens ? getSpendingProfile() : null;
  const finance = tokens
    ? getDashboardData({ period: activePeriod, selectedCategoryId: category })
    : null;

  const sortedCategories = finance
    ? [...finance.categories].sort((a, b) => {
        const aUsage = a.budget && a.budget > 0 ? a.budgetSpent / a.budget : -1;
        const bUsage = b.budget && b.budget > 0 ? b.budgetSpent / b.budget : -1;
        return bUsage - aUsage || b.amount - a.amount || a.name.localeCompare(b.name);
      })
    : [];
  const spentCategories = sortedCategories.filter((item) => item.amount > 0);
  const totalSpent = sortedCategories.reduce((sum, item) => sum + item.amount, 0);
  const totalBudgetSpent = sortedCategories.reduce((sum, item) => sum + item.budgetSpent, 0);
  const totalBudget = sortedCategories.reduce((sum, item) => sum + (item.budget ?? 0), 0);
  const { gradient } = budgetSegments(spentCategories);
  const amountOwing = Math.max(finance?.debtAccount?.current_balance ?? 0, 0);
  const debtTarget = finance?.settings.debt_monthly_target ?? 0;
  const debtProgress = debtTarget ? Math.min(((finance?.debtPayments ?? 0) / debtTarget) * 100, 100) : 0;
  const debtNet = (finance?.debtPayments ?? 0) - (finance?.debtCharges ?? 0);

  return (
    <FinanceChrome>
      <div className="mx-auto w-full max-w-[1100px] px-4 pb-24 pt-6 md:px-8 lg:pb-10 lg:pt-8">
        <Notice value={notice} />

        {vaultError && (
          <div className="border-l-4 border-[#b43b31] bg-[#faf7f0] p-4 text-sm text-[#b43b31]">
            <p className="font-semibold">Encryption key required</p>
            <p className="mt-1">Configure <code className="font-mono">AKAHU_ENCRYPTION_KEY</code> and restart the service.</p>
          </div>
        )}

        {!vaultError && tokens && finance && (
          <>
            <p className="eyebrow">{activePeriod === "week" ? "This week" : "This month"} · {formatDate(new Date().toISOString())}</p>
            <div className="mt-2 flex overflow-hidden border border-[#c8bea8] w-fit">
              <Link className={`px-3 py-1 font-mono text-[10px] uppercase tracking-[0.05em] transition ${activePeriod === "week" ? "bg-[#1c2b3a] text-white" : "bg-[#faf7f0] text-[#7a7a7a] hover:text-[#1c2b3a]"}`} href="/?period=week">Week</Link>
              <Link className={`border-l border-[#c8bea8] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.05em] transition ${activePeriod === "month" ? "bg-[#1c2b3a] text-white" : "bg-[#faf7f0] text-[#7a7a7a] hover:text-[#1c2b3a]"}`} href="/?period=month">Month</Link>
            </div>

            <div className="mt-4 md:grid md:grid-cols-[1fr_320px] md:items-start md:gap-x-8">

              {/* ── Left column ── */}
              <div>
                {/* Spending hero */}
                <div className="grid items-center gap-5 border border-[#c8bea8] bg-[#faf7f0] p-5 sm:grid-cols-[auto_1fr]">
                  <div className="mx-auto h-32 w-32 shrink-0 rounded-full border border-[#c8bea8]" style={{ background: gradient }}>
                    <div className="grid h-full place-items-center rounded-full border-8 border-[#faf7f0]">
                      <div className="text-center">
                        <p className="meta-label">{activePeriod === "week" ? "This week" : "This month"}</p>
                        <p className="serif-amount mt-1 font-bold">{formatMoney(totalSpent)}</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-semibold text-[#1c2b3a]">vs balanced budget</p>
                      <Link className="font-mono text-[10px] uppercase tracking-[0.05em] text-[#1a3a5c] hover:text-[#b8922a]" href="/budget">Edit →</Link>
                    </div>
                    <div className="mt-2 h-1.5 bg-[#f0ebe0]">
                      <div
                        className={`h-full ${totalBudgetSpent > totalBudget ? "bg-[#b43b31]" : "bg-[#1a3a5c]"}`}
                        style={{ width: `${totalBudget ? Math.min((totalBudgetSpent / totalBudget) * 100, 100) : 0}%` }}
                      />
                    </div>
                    <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.05em] text-[#7a7a7a]">
                      {activePeriod === "week" ? "Month to date · " : ""}{formatMoney(totalBudgetSpent)} of {formatMoney(totalBudget)} budgeted
                    </p>
                  </div>
                </div>

                {/* Category breakdown */}
                <div className="mt-1 border border-t-0 border-[#c8bea8]">
                  {sortedCategories.map((categoryItem) => {
                    const categoryIsOpen = finance.selectedCategory?.id === categoryItem.id;
                    const categoryHref = categoryIsOpen
                      ? `/?period=${activePeriod}`
                      : `/?period=${activePeriod}&category=${encodeURIComponent(categoryItem.id)}`;
                    const limit = categoryItem.budget ?? 0;
                    const budgetPct = limit ? (categoryItem.budgetSpent / limit) * 100 : 0;
                    const over = limit > 0 && categoryItem.budgetSpent > limit;
                    const periodPct = limit ? (categoryItem.amount / limit) * 100 : 0;
                    const barPct = activePeriod === "week"
                      ? over ? 100 : Math.min(periodPct, 100)
                      : Math.min(budgetPct, 100);
                    const displayedPct = activePeriod === "week" && !over ? periodPct : budgetPct;
                    return (
                      <div className="border-b border-[#c8bea8]/50 last:border-b-0" key={categoryItem.id}>
                        <Link
                          aria-expanded={categoryIsOpen}
                          className={`grid grid-cols-[auto_minmax(0,1fr)_5rem] items-center gap-x-3 px-4 py-3 transition hover:bg-[#f5f0e6] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#b8922a] ${categoryIsOpen ? "bg-[#f5f0e6]" : ""}`}
                          href={categoryHref}
                          scroll={false}
                        >
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: categoryItem.color }} />
                          <div className="min-w-0">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-sm text-[#1a1a1a]">{categoryItem.name}</span>
                              <span className={`serif-amount shrink-0 text-sm ${activePeriod === "month" && over ? "!text-[#b43b31]" : ""}`}>
                                {formatMoney(categoryItem.amount)}
                              </span>
                            </div>
                            <div className="mt-1.5 h-1 bg-[#f0ebe0]">
                              <div className={`h-full ${over ? "bg-[#b43b31]" : "bg-[#1a3a5c]"}`} style={{ width: `${barPct}%` }} />
                            </div>
                            {activePeriod === "week" && limit > 0 && (
                              <p className={`mt-1 font-mono text-[8px] uppercase tracking-[0.04em] ${over ? "text-[#b43b31]" : "text-[#9a9a9a]"}`}>
                                Month to date · {formatMoney(categoryItem.budgetSpent)} of {formatMoney(limit)} · {Math.round(budgetPct)}%
                              </p>
                            )}
                          </div>
                          <span className={`flex items-center justify-end gap-2 text-right font-mono text-[9px] ${over ? "text-[#b43b31]" : "text-[#9a9a9a]"}`}>
                            {limit ? `${Math.round(displayedPct)}%` : "—"}
                            <span aria-hidden="true">{categoryIsOpen ? "↑" : "↓"}</span>
                          </span>
                        </Link>

                        {categoryIsOpen && (
                          <div className="border-t border-[#c8bea8]/50 bg-[#faf7f0] px-4 pb-4 pt-3">
                            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[#7a7a7a]">
                              Top 5 spends · {activePeriod === "week" ? "this week" : "this month"}
                            </p>
                            {finance.selectedCategorySpends.length > 0 ? (
                              <div className="mt-2 divide-y divide-[#c8bea8]/40">
                                {finance.selectedCategorySpends.map((spend) => (
                                  <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-baseline gap-3 py-2" key={spend.id}>
                                    <span className="font-mono text-[9px] uppercase text-[#7a7a7a]">{formatDate(spend.date, true)}</span>
                                    <span className="min-w-0 truncate text-sm text-[#1a1a1a]">
                                      {spend.label}
                                      <span className="ml-2 hidden font-mono text-[8px] uppercase text-[#9a9a9a] sm:inline">{spend.accountName}</span>
                                    </span>
                                    <span className="serif-amount text-sm">{formatMoney(spend.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-3 text-sm text-[#7a7a7a]">No individual spends in this period.</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>


                {/* Recent activity */}
                <section className="mt-6">
                  <div className="flex items-baseline justify-between">
                    <p className="eyebrow">Recent activity</p>
                    <Link className="font-mono text-[10px] uppercase tracking-[0.05em] text-[#1a3a5c] hover:text-[#b8922a]" href="/activity">View all →</Link>
                  </div>
                  <div className="mt-3 border border-[#c8bea8]">
                    {finance.recentTransactions.map((t) => (
                      <div className="grid grid-cols-[3.5rem_1fr_auto] items-baseline gap-3 border-b border-[#c8bea8]/50 px-4 py-3 last:border-b-0" key={t.id}>
                        <span className="font-mono text-[9px] uppercase text-[#7a7a7a]">{formatDate(t.date, true)}</span>
                        <span className="min-w-0 truncate text-sm">
                          {t.merchant ?? t.description}
                          <span className="ml-2 hidden font-mono text-[9px] uppercase text-[#9a9a9a] sm:inline">{t.categoryName}</span>
                        </span>
                        <span className={`serif-amount text-sm ${t.amount > 0 ? "!text-[#1a5c2a]" : ""}`}>{formatMoney(t.amount)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {/* ── Right column ── */}
              <div className="mt-6 md:mt-0">
                {/* Accounts */}
               <section>
                  {spendingProfile && <SpendingProfileCard profile={spendingProfile} />}
                </section>
                <section className="mt-6">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="eyebrow">Accounts</p>
                    <span className="font-mono text-[9px] text-[#9a9a9a]">{accounts.length} connected</span>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {accounts.map((account) => {
                      const creditCard = account.type === "CREDITCARD";
                      const signed = creditCard ? -(account.currentBalance ?? 0) : (account.currentBalance ?? 0);
                      return (
                        <Link className="border border-[#c8bea8] bg-[#faf7f0] p-4 transition hover:border-[#b8922a]" href={`/accounts/${account.id}`} key={account.id}>
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-sm font-semibold leading-snug text-[#1c2b3a]">{account.displayName}</span>
                            <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.05em] text-[#7a7a7a]">{accountType(account.type)}</span>
                          </div>
                          <div className="mt-2 flex items-end justify-between gap-3">
                            <span className="font-mono text-[9px] text-[#9a9a9a]">{account.institution}{account.formattedAccount ? ` · ${account.formattedAccount}` : ""}</span>
                            <span className={`serif-amount text-base ${signed < 0 ? "!text-[#b43b31]" : ""}`}>{formatMoney(signed, account.currency ?? "NZD")}</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </section>

                {/* Goals */}
                <section className="mt-6">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="eyebrow">Goals</p>
                    <Link className="font-mono text-[10px] uppercase tracking-[0.05em] text-[#1a3a5c] hover:text-[#b8922a]" href="/settings">Edit →</Link>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-1">
                    {finance.goals.map((goal) => {
                      const progress = goal.target ? Math.min((goal.current / goal.target) * 100, 100) : 0;
                      const added = finance.monthlyContributions[goal.id] ?? 0;
                      return (
                        <div className="border border-[#c8bea8] bg-[#faf7f0] p-4" key={goal.id}>
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-sm font-semibold text-[#1c2b3a]">{goal.name}</p>
                            <span className="shrink-0 font-mono text-[9px] text-[#7a7a7a]">{progress.toFixed(0)}%</span>
                          </div>
                          <div className="mt-2 flex items-baseline justify-between gap-2">
                            <p className="serif-amount text-lg font-bold">{formatMoney(goal.current)}</p>
                            <p className="font-mono text-[9px] text-[#9a9a9a]">of {formatMoney(goal.target)}</p>
                          </div>
                          <div className="mt-2 h-1 bg-[#f0ebe0]">
                            <div className="h-full" style={{ width: `${progress}%`, backgroundColor: goal.color }} />
                          </div>
                          <p className="mt-2 font-mono text-[9px] text-[#7a7a7a]">
                            {added > 0 ? `+${formatMoney(added)} tracked this month` : `${formatMoney(goal.contribution)}/mo planned`}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Card debt */}
                <section className="mt-6">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="eyebrow">Card debt</p>
                    <span className="font-mono text-[9px] text-[#9a9a9a]">This month</span>
                  </div>
                  <div className="mt-3 grid gap-2">
                    <div className="border border-[#c8bea8] bg-[#faf7f0] p-4">
                      <p className="meta-label">Amount owing</p>
                      <p className="serif-amount mt-2 text-2xl font-bold !text-[#b43b31]">{formatMoney(amountOwing)}</p>
                    </div>
                    <div className="border border-[#c8bea8] bg-[#faf7f0] p-4">
                      <p className="meta-label">Repaid this month</p>
                      <p className="serif-amount mt-2 text-2xl font-bold">{formatMoney(finance.debtPayments)}</p>
                      <div className="mt-3 h-1 bg-[#f0ebe0]">
                        <div className="h-full bg-[#1a3a5c]" style={{ width: `${debtProgress}%` }} />
                      </div>
                    </div>
                    <div className="border border-[#c8bea8] bg-[#faf7f0] p-4">
                      <p className="meta-label">Net movement</p>
                      <p className={`serif-amount mt-2 text-2xl font-bold ${debtNet < 0 ? "!text-[#b43b31]" : ""}`}>{formatMoney(debtNet)}</p>
                      <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.05em] text-[#7a7a7a]">paid − new charges</p>
                    </div>
                  </div>
                </section>
              </div>

            </div>
          </>
        )}

        {!vaultError && tokens && finance && !finance.lastSync && (
          <section className="border-l-4 border-[#b8922a] bg-[#1c2b3a] p-5 text-white">
            <p className="font-serif text-lg font-bold">Build the local finance history</p>
            <p className="mt-2 text-sm text-white/70">Sync Akahu transactions into private SQLite to enable budgets, goals, rules, and review.</p>
            <form action={syncFinance}><button className="primary-button mt-4 min-h-11 px-5" type="submit">Start first sync</button></form>
          </section>
        )}

        {!vaultError && (!tokens || credentialError) && (
          <section className="border border-[#c8bea8] bg-[#faf7f0] p-5">
            <p className="font-serif text-lg font-bold text-[#1c2b3a]">Add personal app tokens</p>
            <p className="mt-2 text-sm text-[#4a4a4a]">The Akahu User Access Token and App ID Token are verified before encrypted local storage.</p>
            {credentialError && <p className="mt-3 text-sm text-[#b43b31]">{credentialError}</p>}
            <form action={saveCredentials} className="mt-4 grid gap-3">
              <label className="grid gap-2 text-sm text-[#4a4a4a]">User Access Token<input required autoComplete="off" className="field font-mono" name="userToken" spellCheck={false} type="password" /></label>
              <label className="grid gap-2 text-sm text-[#4a4a4a]">App ID Token<input required autoComplete="off" className="field font-mono" name="appToken" spellCheck={false} type="password" /></label>
              <button className="primary-button" type="submit">Verify and encrypt tokens</button>
            </form>
          </section>
        )}
      </div>
    </FinanceChrome>
  );
}
