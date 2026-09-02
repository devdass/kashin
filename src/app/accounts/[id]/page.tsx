import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FinanceChrome } from "@/components/finance-shell";
import { getAuthenticatedUserId, hasAccount } from "@/lib/auth";
import { getAkahuTokens } from "@/lib/credentials";
import { updateAccountNickname } from "@/app/finance-actions";
import { db } from "@/lib/db";
import { getAccountTransactions } from "@/lib/finance-data";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const NON_SPENDING = new Set(["TRANSFER", "CREDIT CARD", "LOAN"]);

type CachedAccountRow = {
  id: string;
  name: string;
  institution: string;
  type: string;
  status: string;
  formatted_account: string | null;
  currency: string | null;
  current_balance: number | null;
  available_balance: number | null;
  credit_limit: number | null;
  attributes_json: string;
  nickname: string | null;
};

function isSpending(transaction: { amount: number; type: string }) {
  return transaction.amount < 0 && !NON_SPENDING.has(transaction.type);
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(amount);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NZ", { day: "2-digit", month: "short", timeZone: "Pacific/Auckland" }).format(new Date(value));
}

function accountType(type: string) {
  const labels: Record<string, string> = {
    CHECKING: "Everyday account",
    SAVINGS: "Savings account",
    CREDITCARD: "Credit card",
    LOAN: "Loan",
    KIWISAVER: "KiwiSaver",
    INVESTMENT: "Investment",
    TERMDEPOSIT: "Term deposit",
    FOREIGN: "Foreign currency",
  };
  return labels[type] ?? type.toLowerCase();
}

function balanceSummary(account: CachedAccountRow) {
  const current = account.current_balance ?? 0;
  if (account.type !== "CREDITCARD") return { label: "Current balance", amount: current };
  if (current < 0) return { label: "In credit", amount: Math.abs(current) };
  return { label: "Amount owing", amount: current };
}

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  if (!hasAccount() || !(await getAuthenticatedUserId())) redirect("/");
  const { id } = await params;
  if (!getAkahuTokens()) redirect("/");

  // Cache-first: read account + balances from local SQLite rather than hitting
  // Akahu's live API on every request. Data freshness tracks the last sync.
  const account = db
    .prepare(
      `SELECT id, name, institution, type, status, formatted_account, currency,
        current_balance, available_balance, credit_limit, attributes_json, nickname
       FROM cached_accounts WHERE id = ?`,
    )
    .get(id) as CachedAccountRow | undefined;
  if (!account) notFound();

  const end = new Date();
  const start = new Date(end.getTime() - THIRTY_DAYS_MS);
  const attributes: string[] = (() => {
    try {
      const parsed = JSON.parse(account.attributes_json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();
  const supportsTransactions = attributes.includes("TRANSACTIONS");
  const cached = supportsTransactions ? getAccountTransactions(id, start, end) : [];
  const transactions: Array<{
    id: string;
    date: string;
    description: string;
    amount: number;
    type: string;
    merchant: string | null;
    category: string;
  }> = cached.map((transaction) => ({
    id: transaction.id,
    date: transaction.date,
    description: transaction.description,
    amount: transaction.amount,
    type: transaction.type,
    merchant: transaction.merchant,
    category: transaction.categoryName,
  }));
  const expenses = transactions.filter(isSpending);
  const credits = transactions.filter((transaction) => transaction.amount > 0);
  const totalSpent = expenses.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const totalCredits = credits.reduce((sum, transaction) => sum + transaction.amount, 0);
  const largest = expenses.reduce<typeof transactions[number] | null>((current, transaction) => !current || transaction.amount < current.amount ? transaction : current, null);
  const currency = account.currency ?? "NZD";
  const balance = balanceSummary(account);

  const categoryMap = new Map<string, { amount: number; count: number }>();
  const merchantMap = new Map<string, { amount: number; count: number }>();
  for (const transaction of expenses) {
    const category = transaction.category ?? "Uncategorised";
    const categoryValue = categoryMap.get(category) ?? { amount: 0, count: 0 };
    categoryValue.amount += Math.abs(transaction.amount);
    categoryValue.count += 1;
    categoryMap.set(category, categoryValue);
    if (transaction.merchant) {
      const merchantValue = merchantMap.get(transaction.merchant) ?? { amount: 0, count: 0 };
      merchantValue.amount += Math.abs(transaction.amount);
      merchantValue.count += 1;
      merchantMap.set(transaction.merchant, merchantValue);
    }
  }
  const categories = [...categoryMap.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.amount - a.amount);
  const merchants = [...merchantMap.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.amount - a.amount).slice(0, 5);

  return (
    <FinanceChrome>
      <div className="mx-auto w-full max-w-[720px] px-4 pb-24 pt-6 md:px-8 lg:pb-10 lg:pt-8">
        <Link className="font-mono text-[10px] uppercase tracking-[0.06em] text-[#1a3a5c] hover:text-[#b8922a]" href="/">← All balances</Link>
        <p className="eyebrow mt-6">{account.institution} · {accountType(account.type)}</p>
        <div className="flex items-start justify-between gap-4">
          <div><h1 className="mt-2 font-serif text-[28px] font-bold text-[#1c2b3a]">{account.nickname ?? account.name}</h1>{account.formatted_account && <p className="mt-1 font-mono text-[10px] text-[#7a7a7a]">{account.formatted_account}</p>}</div>
          <span className="border border-[#1c2b3a] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[#1c2b3a]">{account.status}</span>
        </div>
        <div className="double-rule mt-5" />

        {/* Nickname */}
        <form action={updateAccountNickname} className="mt-5 flex items-end gap-3">
          <input name="id" type="hidden" value={id} />
          <label className="flex-1">
            <p className="meta-label mb-1.5">Nickname</p>
            <input
              className="field min-h-10 w-full text-sm"
              defaultValue={account.nickname ?? ""}
              name="nickname"
              placeholder={account.name}
              type="text"
            />
          </label>
          <button className="min-h-10 border border-[#1c2b3a] px-5 font-mono text-[10px] font-semibold uppercase tracking-[0.07em] text-[#1c2b3a] transition hover:bg-[#1c2b3a] hover:text-white" type="submit">
            Save
          </button>
        </form>

        <section className="navy-panel mt-5 p-5">
          <p className="eyebrow">{balance.label}</p>
          <p className="mt-3 font-serif text-4xl font-bold leading-none">{formatMoney(balance.amount, currency)}</p>
          <div className="mt-4 flex flex-wrap gap-5 font-mono text-[10px] uppercase tracking-[0.05em] text-white/60">
            <span>Available <b className="font-medium text-white">{account.available_balance === null ? "Not provided" : formatMoney(account.available_balance, currency)}</b></span>
            <span>Limit <b className="font-medium text-white">{account.credit_limit === null ? "Not provided" : formatMoney(account.credit_limit, currency)}</b></span>
          </div>
        </section>

        {!supportsTransactions ? (
          <div className="mt-5 border-l-4 border-[#b8922a] bg-[#1c2b3a] p-4 text-white">Akahu does not provide transactions for this account.</div>
        ) : (
          <>
            <section className="mt-5 grid border border-[#c8bea8] sm:grid-cols-4">
              {[
                ["Spent", formatMoney(totalSpent, currency)],
                ["Credits", formatMoney(totalCredits, currency)],
                ["Daily average", formatMoney(totalSpent / 30, currency)],
                ["Largest purchase", largest ? formatMoney(Math.abs(largest.amount), currency) : formatMoney(0, currency)],
              ].map(([label, value]) => <div className="border-b border-[#c8bea8] bg-[#faf7f0] p-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0" key={label}><p className="meta-label">{label}</p><p className="serif-amount mt-2 text-base">{value}</p></div>)}
            </section>

            <div className="mt-6 grid gap-6 md:grid-cols-[1.4fr_0.6fr]">
              <section>
                <p className="eyebrow">Spending by category</p>
                <div className="mt-2 border-t border-[#c8bea8]">
                  {categories.length === 0 && <p className="border-b border-[#c8bea8]/55 py-3 text-sm text-[#7a7a7a]">No spending transactions in this period.</p>}
                  {categories.map((category) => <div className="border-b border-[#c8bea8]/55 py-2.5" key={category.name}><div className="flex justify-between gap-3 text-sm"><span>{category.name}<span className="ml-2 font-mono text-[9px] text-[#9a9a9a]">{category.count} txns</span></span><span className="serif-amount">{formatMoney(category.amount, currency)}</span></div><div className="mt-2 h-1 border border-[#c8bea8]/55 bg-[#f0ebe0]"><div className="h-full bg-[#1a3a5c]" style={{ width: `${totalSpent ? Math.max(category.amount / totalSpent * 100, 1) : 0}%` }} /></div></div>)}
                </div>
              </section>
              <section>
                <p className="eyebrow">Top merchants</p>
                <div className="mt-2 border-t border-[#c8bea8]">
                  {merchants.map((merchant) => <div className="flex justify-between gap-2 border-b border-[#c8bea8]/55 py-2.5 text-sm" key={merchant.name}><span className="truncate">{merchant.name}</span><span className="serif-amount shrink-0 text-xs">{formatMoney(merchant.amount, currency)}</span></div>)}
                </div>
              </section>
            </div>

            <div className="double-rule my-6" />
            <section>
              <div className="flex items-baseline justify-between gap-3"><p className="eyebrow">Settled transactions</p><span className="font-mono text-[9px] text-[#9a9a9a]">Rolling 30 days</span></div>
              <div className="mt-2 border-t border-[#c8bea8]">
                {transactions.map((transaction) => <div className="grid grid-cols-[3.5rem_1fr_auto] items-baseline gap-2 border-b border-[#c8bea8]/55 px-1 py-2.5" key={transaction.id}><span className="font-mono text-[9px] uppercase text-[#7a7a7a]">{formatDate(transaction.date)}</span><span className="min-w-0 truncate text-sm">{transaction.merchant ?? transaction.description}<span className="ml-2 hidden font-mono text-[9px] uppercase text-[#9a9a9a] sm:inline">{transaction.category}</span></span><span className={`serif-amount text-sm ${transaction.amount > 0 ? "!text-[#1a5c2a]" : ""}`}>{formatMoney(transaction.amount, currency)}</span></div>)}
              </div>
            </section>
          </>
        )}
      </div>
    </FinanceChrome>
  );
}
