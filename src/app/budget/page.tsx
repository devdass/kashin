import { updateBudgets } from "@/app/finance-actions";
import { FinanceShell } from "@/components/finance-shell";
import { requireAuthenticatedUser } from "@/lib/auth";
import { getBudgetData } from "@/lib/finance-data";
import { formatMoney } from "@/lib/format";

export default async function BudgetPage() {
  await requireAuthenticatedUser();
  const data = getBudgetData();
  const percentage = data.totalBudget
    ? Math.min((data.totalSpent / data.totalBudget) * 100, 100)
    : 0;

  const budgeted = data.categories.filter((c) => c.budget !== null);

  return (
    <FinanceShell eyebrow="Current month" title="Balanced budget">

      {/* ── First-run guidance ── */}
      {data.totalBudget === 0 ? (
        <div className="border-l-4 border-[#b8922a] bg-[#1c2b3a] p-5 text-white">
          <p className="font-serif text-lg font-bold">Set your monthly targets to get started.</p>
          <p className="mt-2 text-sm leading-6 text-white/70">
            Enter a target for each category below, then hit <strong>Save targets</strong>.
            Your spending this month will be measured against these amounts.
          </p>
        </div>
      ) : null}

      {/* ── Summary panel ── */}
      <div className="grid border border-[#c8bea8] sm:grid-cols-3">
        <div className="bg-[#1c2b3a] p-6 text-white sm:col-span-2">
          <p className="eyebrow">Personal spending</p>
          <p className="mt-3 font-serif text-4xl font-bold leading-none">
            {formatMoney(data.totalSpent)}
          </p>
          <div className="mt-4 h-2 bg-white/15">
            <div className="h-full bg-[#b8922a] transition-all" style={{ width: `${percentage}%` }} />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-white/55">
              {formatMoney(Math.max(data.totalBudget - data.totalSpent, 0))} remaining
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-white/55">
              of {formatMoney(data.totalBudget)}
            </p>
          </div>
        </div>
        <div className="border-t border-[#c8bea8] bg-[#faf7f0] p-6 sm:border-l sm:border-t-0">
          <p className="meta-label">Previous month</p>
          <p className="serif-amount mt-3 text-2xl">{formatMoney(data.previousSpent)}</p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[#9a9a9a]">
            Personal categories
          </p>
        </div>
      </div>

      {/* ── Category rows ── */}
      <form action={updateBudgets} className="mt-6">
        <div className="border border-[#c8bea8]">
          {budgeted.map((category) => {
            const limit = category.budget ?? 0;
            const pct = limit ? Math.min((category.amount / limit) * 100, 100) : 0;
            const over = category.amount > limit;

            return (
              <div
                className="border-b border-[#c8bea8]/50 bg-[#faf7f0] px-5 py-4 last:border-b-0"
                key={category.id}
              >
                {/* Name row + inline spent / target input */}
                <div className="flex items-center gap-4">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                  <p className="flex-1 text-sm font-semibold text-[#1c2b3a]">
                    {category.name}
                  </p>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <p className={`serif-amount text-sm ${over ? "!text-[#b43b31]" : ""}`}>
                      {formatMoney(category.amount)}
                    </p>
                    <span className="font-mono text-[10px] text-[#c8bea8]">of</span>
                    <input
                      className="w-24 border border-[#c8bea8] bg-[#faf8f3] px-2.5 py-1.5 text-right font-mono text-xs text-[#1a1a1a] outline-none transition focus:border-[#b8922a]"
                      defaultValue={limit || ""}
                      min="0"
                      name={`limit_${category.id}`}
                      placeholder="0"
                      step="1"
                      type="number"
                    />
                  </div>
                </div>

                {/* Progress bar + percentage (hidden until a target is set) */}
                {limit > 0 ? (
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-1.5 flex-1 bg-[#f0ebe0]">
                      <div
                        className={`h-full transition-all ${over ? "bg-[#b43b31]" : "bg-[#1a3a5c]"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className={`w-8 text-right font-mono text-[9px] uppercase tracking-[0.06em] ${over ? "text-[#b43b31]" : "text-[#9a9a9a]"}`}>
                      {pct.toFixed(0)}%
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.05em] text-[#b8b0a0]">
                    No target set
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-[#c8bea8] bg-[#faf7f0] px-5 py-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.05em] text-[#9a9a9a]">Targets are applied to this month&apos;s balanced budget.</p>
          <button
            className="min-h-10 bg-[#1c2b3a] px-8 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-[#b8922a] hover:text-[#1c2b3a]"
            type="submit"
          >
            Save targets
          </button>
        </div>
      </form>

    </FinanceShell>
  );
}
