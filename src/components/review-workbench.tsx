"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { saveReviewSelections, undoReviewSelections } from "@/app/finance-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AccountCard, CachedTransaction } from "@/lib/finance-data";
import { formatDate, formatMoney } from "@/lib/format";

type UndoItem = {
  id: string;
  categoryId: string;
  source: string;
  confidence: number;
  reviewed: boolean;
};

type SortOrder = "newest" | "oldest" | "largest";

const INITIAL_VISIBLE_COUNT = 60;

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CHECKING: "Everyday",
  SAVINGS: "Savings",
  CREDITCARD: "Credit card",
  LOAN: "Loan",
  KIWISAVER: "KiwiSaver",
  INVESTMENT: "Investment",
  TERMDEPOSIT: "Term deposit",
};

const SOURCE_LABELS: Record<string, string> = {
  AKAHU: "Akahu suggestion",
  MANUAL: "Manual",
  SPECIAL_RULE: "Automatic rule",
  UNCATEGORISED: "Uncategorised",
  VENDOR: "Learned rule",
};

function accountSuffix(account: AccountCard) {
  if (!account.formattedAccount) return ACCOUNT_TYPE_LABELS[account.type] ?? account.type;
  const parts = account.formattedAccount.split("-");
  return parts.length >= 3
    ? `·${parts.slice(-2).join("-")}`
    : `·${account.formattedAccount.slice(-6)}`;
}

export function ReviewWorkbench({
  transactions,
  categories,
  accounts,
  onlyReview,
  reviewCount,
}: {
  transactions: CachedTransaction[];
  categories: Array<{ id: string; name: string }>;
  accounts: AccountCard[];
  onlyReview: boolean;
  reviewCount: number;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [localCategories, setLocalCategories] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const [confirmSelectAll, setConfirmSelectAll] = useState(false);
  const [undoItems, setUndoItems] = useState<UndoItem[] | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [learnAll, setLearnAll] = useState(true);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const deferredQuery = useDeferredValue(query);

  const transactionById = useMemo(
    () => new Map(transactions.map((transaction) => [transaction.id, transaction])),
    [transactions],
  );
  const categoryNameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const accountCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const transaction of transactions) {
      counts.set(transaction.accountId, (counts.get(transaction.accountId) ?? 0) + 1);
    }
    return counts;
  }, [transactions]);

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    const matching = transactions.filter((transaction) => {
      if (accountFilter && transaction.accountId !== accountFilter) return false;
      const effectiveCategory = localCategories[transaction.id] ?? transaction.categoryId;
      if (categoryFilter && effectiveCategory !== categoryFilter) return false;
      if (!needle) return true;
      const categoryName = categoryNameById.get(effectiveCategory) ?? transaction.categoryName;
      return [
        transaction.merchant,
        transaction.description,
        transaction.accountName,
        categoryName,
        String(Math.abs(transaction.amount)),
      ].some((value) => value?.toLowerCase().includes(needle));
    });

    return matching.sort((a, b) => {
      if (sortOrder === "oldest") return a.date.localeCompare(b.date);
      if (sortOrder === "largest") return Math.abs(b.amount) - Math.abs(a.amount) || b.date.localeCompare(a.date);
      return b.date.localeCompare(a.date);
    });
  }, [
    transactions,
    deferredQuery,
    categoryFilter,
    accountFilter,
    localCategories,
    categoryNameById,
    sortOrder,
  ]);

  const visibleTransactions = filtered.slice(0, visibleCount);
  const visibleIds = new Set(visibleTransactions.map((transaction) => transaction.id));
  const allVisibleSelected = visibleIds.size > 0 && [...visibleIds].every((id) => selected.has(id));
  const someVisibleSelected = !allVisibleSelected && [...visibleIds].some((id) => selected.has(id));
  const selectedCount = selected.size;
  const activeFilterCount = Number(Boolean(query)) + Number(Boolean(categoryFilter)) + Number(Boolean(accountFilter));
  const totals = useMemo(
    () =>
      filtered.reduce(
        (result, transaction) => {
          if (transaction.amount < 0) result.outflow += Math.abs(transaction.amount);
          if (transaction.amount > 0) result.inflow += transaction.amount;
          if (!transaction.reviewed) result.needsReview += 1;
          return result;
        },
        { outflow: 0, inflow: 0, needsReview: 0 },
      ),
    [filtered],
  );

  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleCategoryChange = (id: string, categoryId: string) => {
    setLocalCategories((previous) => ({ ...previous, [id]: categoryId }));
    setSelected((previous) => new Set([...previous, id]));
  };

  const handleToggleAll = () => {
    if (allVisibleSelected) {
      setSelected((previous) => {
        const next = new Set(previous);
        for (const id of visibleIds) next.delete(id);
        return next;
      });
      setConfirmSelectAll(false);
    } else if (!confirmSelectAll && visibleIds.size > 25) {
      setConfirmSelectAll(true);
    } else {
      setSelected((previous) => new Set([...previous, ...visibleIds]));
      setConfirmSelectAll(false);
    }
  };

  const clearSelection = () => {
    setSelected(new Set());
    setConfirmSelectAll(false);
  };

  const resetFilters = () => {
    setQuery("");
    setCategoryFilter("");
    setAccountFilter("");
    setSortOrder("newest");
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  };

  const handleSave = () => {
    const undo = [...selected].flatMap((id) => {
      const transaction = transactionById.get(id);
      return transaction
        ? [{
            id,
            categoryId: transaction.categoryId,
            source: transaction.source,
            confidence: transaction.confidence,
            reviewed: transaction.reviewed,
          }]
        : [];
    });

    const formData = new FormData();
    for (const id of selected) {
      formData.append(`selected_${id}`, "on");
      const categoryId = localCategories[id] ?? transactionById.get(id)?.categoryId ?? "";
      if (categoryId) formData.append(`category_${id}`, categoryId);
    }
    if (learnAll) formData.append("learn_all", "on");

    startTransition(async () => {
      setMutationError(null);
      try {
        await saveReviewSelections(formData);
        setUndoItems(undo);
        setSelected(new Set());
        setLocalCategories({});
        router.refresh();
      } catch {
        setMutationError("Changes could not be saved. Check the connection and try again.");
      }
    });
  };

  const handleUndo = () => {
    if (!undoItems) return;
    const items = undoItems;
    startTransition(async () => {
      setMutationError(null);
      try {
        await undoReviewSelections(items);
        setUndoItems(null);
        setLocalCategories({});
        router.refresh();
      } catch {
        setMutationError("The previous save could not be undone. Try again.");
      }
    });
  };

  return (
    <div>
      {transactions.length > 0 ? (
      <>
      <section aria-label="Activity summary" className="grid grid-cols-2 border border-[#c8bea8] bg-[#faf7f0] md:grid-cols-4">
        <div className="border-b border-r border-[#c8bea8]/60 p-4 md:border-b-0">
          <p className="meta-label">Results</p>
          <p className="serif-amount mt-2 text-2xl font-bold">{filtered.length}</p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.05em] text-[#9a9a9a]">of {transactions.length} loaded</p>
        </div>
        <div className="border-b border-[#c8bea8]/60 p-4 md:border-b-0 md:border-r">
          <p className="meta-label">Needs review</p>
          <p className={`serif-amount mt-2 text-2xl font-bold ${totals.needsReview > 0 ? "!text-[#b8922a]" : ""}`}>{totals.needsReview}</p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.05em] text-[#9a9a9a]">in these results</p>
        </div>
        <div className="border-r border-[#c8bea8]/60 p-4">
          <p className="meta-label">Money out</p>
          <p className="serif-amount mt-2 text-xl font-bold">{formatMoney(totals.outflow)}</p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.05em] text-[#9a9a9a]">filtered total</p>
        </div>
        <div className="p-4">
          <p className="meta-label">Money in</p>
          <p className="serif-amount mt-2 text-xl font-bold !text-[#1a5c2a]">{formatMoney(totals.inflow)}</p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.05em] text-[#9a9a9a]">filtered total</p>
        </div>
      </section>

      <div className="z-20 mt-4 border border-[#c8bea8] bg-[#faf7f0] shadow-[0_3px_12px_rgb(28_43_58_/_0.06)] md:sticky md:top-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-[#c8bea8]/60 p-3">
          <nav aria-label="Activity views" className="flex shrink-0 border border-[#1c2b3a]">
            <Link
              aria-current={!onlyReview ? "page" : undefined}
              className={`flex min-h-10 items-center px-4 font-mono text-[10px] uppercase tracking-[0.07em] transition ${
                !onlyReview ? "bg-[#1c2b3a] text-white" : "text-[#1a3a5c] hover:bg-[#1c2b3a]/5"
              }`}
              href="/activity"
            >
              All activity
            </Link>
            <Link
              aria-current={onlyReview ? "page" : undefined}
              className={`flex min-h-10 items-center border-l border-[#1c2b3a] px-4 font-mono text-[10px] uppercase tracking-[0.07em] transition ${
                onlyReview ? "bg-[#1c2b3a] text-white" : "text-[#1a3a5c] hover:bg-[#1c2b3a]/5"
              }`}
              href="/activity?view=review"
            >
              Review queue{reviewCount > 0 ? ` · ${reviewCount}` : ""}
            </Link>
          </nav>

          <label className="relative min-w-[14rem] flex-1">
            <span className="sr-only">Search transactions</span>
            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#9a9a9a]">⌕</span>
            <input
              className="field min-h-10 pl-8 text-sm"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Merchant, account, category or amount"
              type="search"
              value={query}
            />
          </label>
        </div>

        <div className="grid gap-2 border-b border-[#c8bea8]/60 p-3 sm:grid-cols-2 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_10rem_auto_auto]">
          <label>
            <span className="sr-only">Filter by account</span>
            <Select onValueChange={setAccountFilter} value={accountFilter}>
              <SelectTrigger className="min-h-10 text-sm">
                <SelectValue placeholder="All accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All accounts · {transactions.length}</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.displayName} {accountSuffix(account)} · {accountCounts.get(account.id) ?? 0}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label>
            <span className="sr-only">Filter by category</span>
            <Select onValueChange={setCategoryFilter} value={categoryFilter}>
              <SelectTrigger className="min-h-10 text-sm">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label>
            <span className="sr-only">Sort transactions</span>
            <Select onValueChange={(value) => setSortOrder(value as SortOrder)} value={sortOrder}>
              <SelectTrigger className="min-h-10 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="largest">Largest amount</SelectItem>
              </SelectContent>
            </Select>
          </label>

          {accountFilter ? (
            <Link className="grid min-h-10 place-items-center px-2 font-mono text-[9px] uppercase tracking-[0.07em] text-[#1a3a5c] hover:text-[#b8922a]" href={`/accounts/${accountFilter}`}>
              Account detail →
            </Link>
          ) : <span />}

          <button
            className="min-h-10 px-2 font-mono text-[9px] uppercase tracking-[0.07em] text-[#7a7a7a] hover:text-[#b43b31] disabled:cursor-not-allowed disabled:opacity-35"
            disabled={activeFilterCount === 0 && sortOrder === "newest"}
            onClick={resetFilters}
            type="button"
          >
            Reset{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-3 py-2.5">
          <button
            className="flex min-h-8 items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.07em] text-[#1a3a5c] hover:text-[#b8922a] disabled:opacity-40"
            disabled={visibleTransactions.length === 0}
            onClick={handleToggleAll}
            type="button"
          >
            <Checkbox
              aria-checked={someVisibleSelected ? "mixed" : allVisibleSelected}
              checked={allVisibleSelected}
              onClick={(event) => event.stopPropagation()}
            />
            Select shown
          </button>

          <span aria-live="polite" className="font-mono text-[10px] uppercase tracking-[0.07em] text-[#7a7a7a]">
            {selectedCount > 0 ? `${selectedCount} selected` : `${visibleTransactions.length} of ${filtered.length} shown`}
          </span>

          {selectedCount > 0 ? (
            <button className="font-mono text-[10px] uppercase tracking-[0.07em] text-[#9a9a9a] hover:text-[#b43b31]" onClick={clearSelection} type="button">
              Clear selection
            </button>
          ) : null}

          <div className="ml-auto flex items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 font-mono text-[10px] uppercase tracking-[0.07em] text-[#4a4a4a]" title="Apply the selected category to future transactions from the same merchant">
              <Checkbox checked={learnAll} onCheckedChange={(checked) => setLearnAll(Boolean(checked))} />
              Remember merchant
            </label>
            <button
              className="min-h-9 bg-[#1c2b3a] px-5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-[#b8922a] hover:text-[#1c2b3a] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={selectedCount === 0 || isPending}
              onClick={handleSave}
              type="button"
            >
              {isPending ? "Saving…" : selectedCount > 0 ? `Save ${selectedCount}` : "Save changes"}
            </button>
          </div>
        </div>

        <AlertDialog open={confirmSelectAll} onOpenChange={(open) => setConfirmSelectAll(open)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Select all {visibleIds.size} shown transactions?</AlertDialogTitle>
              <AlertDialogDescription>
                This selects every transaction currently visible in the list for saving.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmSelectAll(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => {
                setSelected((previous) => new Set([...previous, ...visibleIds]));
                setConfirmSelectAll(false);
              }}>Confirm</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {undoItems && !isPending ? (
          <div className="flex items-center gap-4 border-t border-[#c8bea8] bg-[#f0ebe0] px-3 py-3">
            <p className="flex-1 text-sm text-[#4a4a4a]">Saved {undoItems.length} transaction{undoItems.length !== 1 ? "s" : ""}.</p>
            <button className="font-mono text-[10px] font-semibold uppercase tracking-[0.07em] text-[#1c2b3a] hover:text-[#b8922a]" onClick={handleUndo} type="button">Undo</button>
            <button className="font-mono text-[10px] uppercase tracking-[0.07em] text-[#7a7a7a] hover:text-[#b43b31]" onClick={() => setUndoItems(null)} type="button">Dismiss</button>
          </div>
        ) : null}

        {mutationError ? (
          <div className="flex items-center gap-4 border-t border-[#b43b31]/40 bg-[#fff4f1] px-3 py-3" role="alert">
            <p className="flex-1 text-sm text-[#b43b31]">{mutationError}</p>
            <button className="font-mono text-[10px] uppercase tracking-[0.07em] text-[#7a7a7a] hover:text-[#b43b31]" onClick={() => setMutationError(null)} type="button">Dismiss</button>
          </div>
        ) : null}
      </div>
      </>
      ) : null}

      {filtered.length === 0 ? (
        <div className="mt-5 border border-[#c8bea8] bg-[#faf7f0] p-8 text-center">
          <p className="font-serif text-lg font-bold text-[#1c2b3a]">
            {transactions.length === 0 ? (onlyReview ? "Review queue cleared." : "No transactions yet.") : "No matching transactions."}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-5 text-[#7a7a7a]">
            {transactions.length === 0
              ? onlyReview ? "Everything loaded has been reviewed." : "Sync an account to populate your activity ledger."
              : "Try a different search or reset the active filters."}
          </p>
          {transactions.length > 0 ? (
            <button className="mt-4 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#1a3a5c] hover:text-[#b8922a]" onClick={resetFilters} type="button">Reset filters</button>
          ) : onlyReview ? null : (
            <div className="mt-4">
              <Link className="inline-flex min-h-9 items-center bg-[#1c2b3a] px-5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-[#b8922a] hover:text-[#1c2b3a]" href="/settings">
                Sync an account
              </Link>
            </div>
          )}
        </div>
      ) : (
        <section aria-label="Transactions" className="mt-5 border border-[#c8bea8]">
          <div className="hidden border-b border-[#c8bea8] bg-[#f0ebe0] px-4 py-2.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#7a7a7a] md:grid md:grid-cols-[1.25rem_5.25rem_minmax(0,1fr)_6rem_10.5rem_5.75rem] md:items-center md:gap-x-4">
            <span />
            <span>Date</span>
            <span>Transaction</span>
            <span>Status</span>
            <span>Category</span>
            <span className="text-right">Amount</span>
          </div>

          {visibleTransactions.map((transaction) => {
            const isSelected = selected.has(transaction.id);
            const effectiveCategory = localCategories[transaction.id] ?? transaction.categoryId;
            const isDirty = localCategories[transaction.id] !== undefined && localCategories[transaction.id] !== transaction.categoryId;
            const status = isDirty ? "Changed" : transaction.reviewed ? "Reviewed" : "Review";
            const statusColor = isDirty ? "bg-[#1a3a5c]" : transaction.reviewed ? "bg-[#4caf50]" : "bg-[#b8922a]";

            return (
              <article className={`border-b border-[#c8bea8]/40 px-4 last:border-b-0 transition ${isSelected ? "bg-[#f2ede0]" : "bg-[#faf7f0] hover:bg-[#faf8f3]"}`} key={transaction.id}>
                <div className="hidden items-center gap-x-4 py-3 md:grid md:grid-cols-[1.25rem_5.25rem_minmax(0,1fr)_6rem_10.5rem_5.75rem]">
                  <Checkbox aria-label={`Select ${transaction.merchant ?? transaction.description}`} checked={isSelected} onCheckedChange={() => toggle(transaction.id)} />
                  <p className="font-mono text-[10px] uppercase leading-none text-[#7a7a7a]">{formatDate(transaction.date, { short: true })}</p>
                  <div className="min-w-0">
                    <p className="truncate text-[0.8125rem] leading-snug text-[#1a1a1a]">{transaction.merchant ?? transaction.description}</p>
                    <p className="mt-0.5 truncate font-mono text-[9px] uppercase leading-none tracking-[0.06em] text-[#9a9a9a]">
                      {transaction.accountName} · {SOURCE_LABELS[transaction.source] ?? transaction.source}
                    </p>
                  </div>
                  <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.05em] text-[#7a7a7a]">
                    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${statusColor}`} />{status}
                  </span>
                  <Select aria-label={`Category for ${transaction.merchant ?? transaction.description}`} onValueChange={(value) => handleCategoryChange(transaction.id, value)} value={effectiveCategory}>
                    <SelectTrigger className={`min-h-9 text-xs ${isDirty ? "border-[#1c2b3a]" : !transaction.reviewed ? "border-[#b8922a]" : "border-[#c8bea8]"}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className={`serif-amount text-right text-sm ${transaction.amount > 0 ? "!text-[#1a5c2a]" : ""}`}>{formatMoney(transaction.amount)}</p>
                </div>

                <div className="py-3 md:hidden">
                  <div className="flex items-start gap-3">
                    <Checkbox aria-label={`Select ${transaction.merchant ?? transaction.description}`} checked={isSelected} className="mt-px shrink-0" onCheckedChange={() => toggle(transaction.id)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.8125rem] leading-snug text-[#1a1a1a]">{transaction.merchant ?? transaction.description}</p>
                      <p className="mt-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.05em] text-[#9a9a9a]">
                        {formatDate(transaction.date, { short: true })} · {transaction.accountName}
                      </p>
                    </div>
                    <p className={`serif-amount shrink-0 text-right text-sm leading-snug ${transaction.amount > 0 ? "!text-[#1a5c2a]" : ""}`}>{formatMoney(transaction.amount)}</p>
                  </div>
                  <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 pl-[27px]">
                    <Select aria-label={`Category for ${transaction.merchant ?? transaction.description}`} onValueChange={(value) => handleCategoryChange(transaction.id, value)} value={effectiveCategory}>
                      <SelectTrigger className={`min-h-9 text-xs ${isDirty ? "border-[#1c2b3a]" : !transaction.reviewed ? "border-[#b8922a]" : "border-[#c8bea8]"}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.05em] text-[#7a7a7a]">
                      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${statusColor}`} />{status}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {visibleTransactions.length < filtered.length ? (
        <div className="mt-4 flex items-center justify-center gap-4">
          <span className="font-mono text-[9px] uppercase tracking-[0.07em] text-[#9a9a9a]">Showing {visibleTransactions.length} of {filtered.length}</span>
          <button className="min-h-9 border border-[#1c2b3a] px-5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#1a3a5c] transition hover:bg-[#1c2b3a] hover:text-white" onClick={() => setVisibleCount((count) => count + INITIAL_VISIBLE_COUNT)} type="button">
            Show {Math.min(INITIAL_VISIBLE_COUNT, filtered.length - visibleTransactions.length)} more
          </button>
        </div>
      ) : null}
    </div>
  );
}
