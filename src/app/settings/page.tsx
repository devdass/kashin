import { logout } from "@/app/actions";
import {
  addGoal,
  addTravelWindow,
  archiveCategory,
  categorizeNow,
  clearLlmApiKey,
  createCategory,
  deleteGoal,
  deleteTravelWindow,
  disconnectAkahu,
  renameCategory,
  replaceAkahuTokens,
  resetLocalData,
  runLlmTest,
  saveBudgetAccounts,
  saveLlmSettings,
  savePreferences,
  syncFinance,
  updateGoal,
} from "@/app/finance-actions";
import { Collapsible } from "@/components/collapsible";
import { FinanceShell } from "@/components/finance-shell";
import { requireAuthenticatedUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { seedFinanceData } from "@/lib/finance";
import { getBudgetAccountSelection, getGoals, getReviewCount } from "@/lib/finance-data";
import { getLlmSettings } from "@/lib/llm";

const notices: Record<string, string> = {
  "llm-saved": "AI categorisation settings saved.",
  "llm-ok": "Connection test succeeded.",
  "llm-fail": "Connection test failed — check your provider, model, and key.",
  "reset-done": "Local data was reset. Sync your accounts to repopulate it.",
  "vault-invalid": "Configure the encryption key before storing tokens or keys.",
  "tokens-required": "Both Akahu tokens are required.",
  "tokens-invalid": "Akahu did not accept those tokens.",
};

function Notice({ value }: { value?: string }) {
  if (!value || !notices[value]) return null;
  return (
    <div className={`mb-6 border-l-4 px-4 py-3 text-sm ${["llm-saved", "llm-ok", "reset-done"].includes(value) ? "border-[#b8922a] bg-[#1c2b3a] text-white" : "border-[#b43b31] bg-[#faf7f0] text-[#b43b31]"}`}>
      {notices[value]}
    </div>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mt-8 first:mt-0">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-1 font-serif text-xl font-bold text-[#1c2b3a]">{title}</h2>
    </div>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  await requireAuthenticatedUser();
  const { notice } = await searchParams;
  seedFinanceData();

  const counts = {
    transactions: (db.prepare("SELECT COUNT(*) count FROM cached_transactions WHERE is_hidden = 0").get() as { count: number }).count,
    review: getReviewCount(),
  };
  const categories = db
    .prepare("SELECT id, name, section, color, archived FROM categories ORDER BY sort_order")
    .all() as Array<{ id: string; name: string; section: string; color: string; archived: number }>;
  const goals = getGoals();
  const travelWindows = db
    .prepare("SELECT id, name, starts_on, ends_on FROM travel_windows ORDER BY starts_on")
    .all() as Array<{ id: number; name: string; starts_on: string; ends_on: string }>;
  const settings = Object.fromEntries(
    (db.prepare("SELECT key, value FROM finance_settings").all() as Array<{ key: string; value: string }>).map((row) => [row.key, row.value]),
  );
  const { accounts, selectedIds } = getBudgetAccountSelection();
  const llm = getLlmSettings();
  const tokensConfigured = Boolean(db.prepare("SELECT 1 FROM akahu_credentials WHERE id = 1").get());

  return (
    <FinanceShell
      description="Connect your banks, tune categories and goals, and control optional AI categorisation. Everything lives in a local SQLite file."
      eyebrow="Preferences"
      title="Settings"
      wide
    >
      <Notice value={notice} />

      {/* ── Stats ── */}
      <div className="grid border border-[#c8bea8] sm:grid-cols-2">
        <div className="border-b border-[#c8bea8] bg-[#faf7f0] p-4 last:border-b-0 sm:border-b-0 sm:border-r">
          <p className="meta-label">Cached transactions</p>
          <p className="serif-amount mt-2 text-2xl">{counts.transactions}</p>
        </div>
        <div className="border-b border-[#c8bea8] bg-[#faf7f0] p-4 last:border-b-0 sm:border-b-0">
          <p className="meta-label">Needs review</p>
          <p className="serif-amount mt-2 text-2xl">{counts.review}</p>
        </div>
      </div>

      {/* ── Bank accounts ── */}
      <SectionTitle eyebrow="Connection" title="Bank accounts & tokens" />
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="border-l-4 border-[#b8922a] bg-[#1c2b3a] p-5 text-white">
          <h3 className="font-serif text-lg font-bold">Synchronise Akahu</h3>
          <p className="mt-2 text-sm leading-6 text-white/70">
            Pull account metadata and up to 370 days of settled transactions into local SQLite. This does not invoke Akahu&apos;s rate-limited bank refresh.
          </p>
          <form action={syncFinance}>
            <button className="primary-button mt-5 min-h-11 px-5" type="submit">Sync local data</button>
          </form>
        </div>

        <div className="border border-[#c8bea8] bg-[#faf7f0] p-5">
          <h3 className="font-serif text-lg font-bold text-[#1c2b3a]">Akahu tokens</h3>
          <p className="mt-2 text-sm leading-6 text-[#4a4a4a]">
            {tokensConfigured ? "Connected. Replace or disconnect your personal-app tokens here." : "Add your Akahu personal-app tokens to connect your banks."}
          </p>
          {tokensConfigured ? (
            <form action={disconnectAkahu} className="mt-4">
              <button className="min-h-10 w-full border border-[#b43b31] font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#b43b31] transition hover:bg-[#b43b31] hover:text-white" type="submit">
                Disconnect Akahu
              </button>
            </form>
          ) : null}
          <form action={replaceAkahuTokens} className="mt-3 grid gap-3">
            <label className="grid gap-1.5 text-sm text-[#4a4a4a]">
              User Access Token
              <input autoComplete="off" className="field font-mono" name="userToken" spellCheck={false} type="password" />
            </label>
            <label className="grid gap-1.5 text-sm text-[#4a4a4a]">
              App ID Token
              <input autoComplete="off" className="field font-mono" name="appToken" spellCheck={false} type="password" />
            </label>
            <button className="min-h-10 border border-[#1c2b3a] text-xs font-semibold text-[#1c2b3a] transition hover:bg-[#1c2b3a] hover:text-white" type="submit">
              {tokensConfigured ? "Verify & replace tokens" : "Verify & store tokens"}
            </button>
          </form>
        </div>
      </div>

      {/* ── Budget accounts ── */}
      <div className="mt-6 border border-[#c8bea8] bg-[#faf7f0] p-5">
        <h3 className="font-serif text-lg font-bold text-[#1c2b3a]">Balanced budget accounts</h3>
        <p className="mt-2 text-sm leading-6 text-[#4a4a4a]">
          Choose which accounts feed the main balanced budget on the home screen. Untick any you want to exclude (for example a joint card). Leave all unticked for no budget.
        </p>
        {accounts.length > 0 ? (
          <form action={saveBudgetAccounts} className="mt-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {accounts.map((account) => {
                const checked = selectedIds.includes(account.id);
                return (
                  <label className="flex cursor-pointer items-center gap-3 border border-[#c8bea8] bg-[#faf8f3] px-3 py-2.5" key={account.id}>
                    <input className="h-4 w-4 accent-[#1c2b3a]" defaultChecked={checked} name="account_id" type="checkbox" value={account.id} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-[#1a1a1a]">{account.displayName}</span>
                      <span className="block font-mono text-[9px] uppercase tracking-[0.05em] text-[#9a9a9a]">{account.institution} · {account.type}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="mt-4 flex justify-end">
              <button className="min-h-10 bg-[#1c2b3a] px-6 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-[#b8922a] hover:text-[#1c2b3a]" type="submit">
                Save budget accounts
              </button>
            </div>
          </form>
        ) : (
          <p className="mt-4 border-l-4 border-[#b8922a] bg-[#f0ebe0] px-4 py-3 text-sm text-[#4a4a4a]">
            No accounts synced yet. Use <strong>Sync local data</strong> above to pull in your Akahu accounts, then choose which ones feed your budget here.
          </p>
        )}
      </div>

      {/* ── AI categorisation ── */}
      <Collapsible eyebrow="Optional" title="AI categorisation" badge="off by default">
        <div className="border border-[#c8bea8] bg-[#faf7f0] p-5">
        <p className="text-sm leading-6 text-[#4a4a4a]">
          Use a bring-your-own LLM to help label transactions the local rules can&apos;t resolve. Off by default. When enabled, descriptions of unmatched
          transactions are sent to the provider you configure — never account numbers or tokens.
        </p>
        <form action={saveLlmSettings} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-3 text-sm text-[#1a1a1a]">
            <input className="h-4 w-4 accent-[#1c2b3a]" defaultChecked={llm.enabled} name="enabled" type="checkbox" value="1" />
            Enable AI categorisation
          </label>
          <label className="grid gap-1.5 text-sm text-[#4a4a4a]">
            Provider
            <select className="field" defaultValue={llm.provider} name="provider">
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="custom">OpenAI-compatible (custom)</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm text-[#4a4a4a]">
            Model
            <input className="field font-mono" defaultValue={llm.model} name="model" placeholder="e.g. gpt-4o-mini" type="text" />
          </label>
          <label className="grid gap-1.5 text-sm text-[#4a4a4a]">
            Base URL <span className="font-mono text-[10px] text-[#9a9a9a]">(custom only)</span>
            <input className="field font-mono" defaultValue={llm.baseUrl ?? ""} name="baseUrl" placeholder="https://api.openai.com/v1" type="text" />
          </label>
          <label className="grid gap-1.5 text-sm text-[#4a4a4a] sm:col-span-2">
            API key <span className="font-mono text-[10px] text-[#9a9a9a]">{llm.apiKey ? "(stored, leave blank to keep)" : "(not set)"}</span>
            <input autoComplete="off" className="field font-mono" name="apiKey" placeholder="sk-…" type="password" />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button className="min-h-10 bg-[#1c2b3a] px-6 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-[#b8922a] hover:text-[#1c2b3a]" type="submit">
              Save AI settings
            </button>
          </div>
        </form>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <form action={runLlmTest}>
            <button className="min-h-10 border border-[#1c2b3a] px-4 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#1a3a5c] transition hover:bg-[#1c2b3a] hover:text-white" type="submit">
              Test connection
            </button>
          </form>
          {llm.apiKey ? (
            <form action={clearLlmApiKey}>
              <button className="min-h-10 px-2 font-mono text-[10px] uppercase tracking-[0.07em] text-[#b43b31] hover:underline" type="submit">
                Clear key
              </button>
            </form>
          ) : null}
        </div>
        <div className="mt-4 border-t border-[#c8bea8]/60 pt-4">
          <p className="text-sm text-[#4a4a4a]">Run local rules plus AI over the review backlog now.</p>
          <form action={categorizeNow} className="mt-3">
            <button className="min-h-10 border border-[#1c2b3a] px-5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#1a3a5c] transition hover:bg-[#1c2b3a] hover:text-white" type="submit">
              Categorise now
            </button>
          </form>
        </div>
      </div>
      </Collapsible>

      {/* ── Categories ── */}
      <Collapsible eyebrow="Ledger" title="Spending categories" badge={`${categories.length}`}>
        <div className="border border-[#c8bea8]">
        {categories.map((category) => (
          <form action={renameCategory} className="flex items-center gap-3 border-b border-[#c8bea8]/50 bg-[#faf7f0] px-4 py-2.5 last:border-b-0" key={category.id}>
            <input name="id" type="hidden" value={category.id} />
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
            <input className="flex-1 border border-transparent bg-transparent text-sm text-[#1a1a1a] outline-none focus:border-[#c8bea8] focus:bg-[#faf8f3] focus:px-1.5" defaultValue={category.name} name="name" type="text" />
            <input className="h-7 w-9 cursor-pointer border border-[#c8bea8] bg-[#faf8f3]" name="color" title="Colour" type="color" defaultValue={category.color} />
            {category.archived ? (
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[#9a9a9a]">Archived</span>
            ) : (
              <button className="px-2 font-mono text-[10px] uppercase tracking-[0.07em] text-[#7a7a7a] hover:text-[#b43b31]" formAction={archiveCategory} type="submit">
                Archive
              </button>
            )}
            <button className="px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.07em] text-[#1a3a5c] hover:text-[#b8922a]" type="submit">
              Save
            </button>
          </form>
        ))}
      </div>
      <form action={createCategory} className="mt-3 flex gap-2">
        <input className="field min-h-10 flex-1 text-sm" name="name" placeholder="New category name" type="text" />
        <button className="min-h-10 border border-[#1c2b3a] px-5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#1a3a5c] transition hover:bg-[#1c2b3a] hover:text-white" type="submit">
          Add
        </button>
      </form>
      </Collapsible>

      {/* ── Goals ── */}
      <Collapsible eyebrow="Savings" title="Goals" badge={`${goals.length}`}>
        <div className="grid gap-3 sm:grid-cols-2">
        {goals.map((goal) => {
          const progress = goal.target ? Math.min((goal.current / goal.target) * 100, 100) : 0;
          return (
            <form action={updateGoal} className="border border-[#c8bea8] bg-[#faf7f0] p-4" key={goal.id}>
              <input name="id" type="hidden" value={goal.id} />
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[#1c2b3a]">{goal.name}</p>
                <span className="font-mono text-[9px] text-[#7a7a7a]">{progress.toFixed(0)}%</span>
              </div>
              <div className="mt-2 h-1 border border-[#c8bea8]/55 bg-[#f0ebe0]">
                <div className="h-full" style={{ width: `${progress}%`, backgroundColor: goal.color }} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                <label className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#7a7a7a]">
                  Current
                  <input className="mt-1 w-full border border-[#c8bea8] bg-[#faf8f3] px-0.5 py-1.5 text-right text-[10px] text-[#1a1a1a] outline-none focus:border-[#1c2b3a]" defaultValue={goal.current} min="0" name="current" step="1" type="number" />
                </label>
                <label className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#7a7a7a]">
                  Target
                  <input className="mt-1 w-full border border-[#c8bea8] bg-[#faf8f3] px-0.5 py-1.5 text-right text-[10px] text-[#1a1a1a] outline-none focus:border-[#1c2b3a]" defaultValue={goal.target} min="0" name="target" step="1" type="number" />
                </label>
                <label className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#7a7a7a]">
                  Monthly
                  <input className="mt-1 w-full border border-[#c8bea8] bg-[#faf8f3] px-0.5 py-1.5 text-right text-[10px] text-[#1a1a1a] outline-none focus:border-[#1c2b3a]" defaultValue={goal.contribution} min="0" name="contribution" step="1" type="number" />
                </label>
              </div>
              <div className="mt-3 flex gap-2">
                <button className="min-h-9 flex-1 border border-[#1c2b3a] text-xs font-semibold text-[#1c2b3a] transition hover:bg-[#1c2b3a] hover:text-white" type="submit">
                  Update goal
                </button>
                <button className="min-h-9 px-3 font-mono text-[10px] uppercase tracking-[0.07em] text-[#b43b31] hover:underline" formAction={deleteGoal} type="submit">
                  Delete
                </button>
              </div>
            </form>
          );
        })}
        <form action={addGoal} className="grid content-start gap-2 border border-dashed border-[#c8bea8] bg-[#faf7f0] p-4">
          <p className="text-sm font-semibold text-[#1c2b3a]">Add a goal</p>
          <input className="field text-sm" name="name" placeholder="Name (e.g. Holiday)" type="text" />
          <input className="field text-sm" name="target" placeholder="Target amount" type="number" min="0" step="1" />
          <input className="field text-sm" name="contribution" placeholder="Monthly contribution" type="number" min="0" step="1" />
          <button className="min-h-9 border border-[#1c2b3a] text-xs font-semibold text-[#1c2b3a] transition hover:bg-[#1c2b3a] hover:text-white" type="submit">
            Add goal
          </button>
        </form>
      </div>
      </Collapsible>

      {/* ── Travel windows ── */}
      <Collapsible eyebrow="Context" title="Travel windows" badge={`${travelWindows.length}`}>
        <p className="text-sm text-[#4a4a4a]">
          Transactions in these dates whose Akahu category is &quot;Travel&quot; are categorised as Travel.
        </p>
        <div className="mt-3 border border-[#c8bea8] bg-[#faf7f0]">
        {travelWindows.map((window) => (
          <form action={deleteTravelWindow} className="flex items-center justify-between gap-3 border-b border-[#c8bea8]/50 px-4 py-2.5 last:border-b-0" key={window.id}>
            <span className="text-sm text-[#1a1a1a]">{window.name}</span>
            <span className="font-mono text-[10px] text-[#7a7a7a]">{window.starts_on} → {window.ends_on}</span>
            <input name="id" type="hidden" value={window.id} />
            <button className="px-2 font-mono text-[10px] uppercase tracking-[0.07em] text-[#b43b31] hover:underline" type="submit">
              Remove
            </button>
          </form>
        ))}
      </div>
      <form action={addTravelWindow} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <input className="field min-h-10 text-sm" name="name" placeholder="Trip name" type="text" />
        <label className="sr-only" htmlFor="tw-start">Start</label>
        <input className="field min-h-10 text-sm" id="tw-start" name="startsOn" type="date" />
        <label className="sr-only" htmlFor="tw-end">End</label>
        <input className="field min-h-10 text-sm" id="tw-end" name="endsOn" type="date" />
        <button className="min-h-10 border border-[#1c2b3a] px-5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#1a3a5c] transition hover:bg-[#1c2b3a] hover:text-white" type="submit">
          Add
</button>
        </form>
      </Collapsible>

      {/* ── Preferences ── */}
      <SectionTitle eyebrow="Preferences" title="Budget & reporting figures" />
      <form action={savePreferences} className="mt-3 grid gap-3 border border-[#c8bea8] bg-[#faf7f0] p-5 sm:grid-cols-2">
        {[
          ["salary_monthly", "Monthly salary"],
          ["weekly_discretionary", "Weekly discretionary"],
          ["debt_baseline", "Debt baseline"],
          ["debt_monthly_target", "Debt monthly target"],
          ["debt_weekly_target", "Debt weekly target"],
          ["debt_apr_estimate", "Debt APR estimate (%)"],
        ].map(([key, label]) => (
          <label className="grid gap-1.5 text-sm text-[#4a4a4a]" key={key}>
            {label}
            <input className="field" defaultValue={settings[key] ?? "0"} name={key} type="number" min="0" step="1" />
          </label>
        ))}
        <label className="grid gap-1.5 text-sm text-[#4a4a4a] sm:col-span-2">
          Reporting timezone
          <input className="field font-mono" defaultValue={settings.reporting_timezone ?? "Pacific/Auckland"} name="reporting_timezone" type="text" />
        </label>
        <div className="flex justify-end sm:col-span-2">
          <button className="min-h-10 bg-[#1c2b3a] px-6 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-[#b8922a] hover:text-[#1c2b3a]" type="submit">
            Save figures
          </button>
        </div>
      </form>

      {/* ── Data ── */}
      <Collapsible eyebrow="Danger zone" title="Local data" badge="reset">
        <div className="border border-[#c8bea8] bg-[#faf7f0] p-5">
          <p className="text-sm leading-6 text-[#4a4a4a]">
            Reset all local data — transactions, budgets, goals, categories, and settings — and re-seed the default categories. Your Akahu tokens and login stay.
          </p>
          <form action={resetLocalData} className="mt-4">
            <button className="min-h-10 border border-[#b43b31] px-6 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#b43b31] transition hover:bg-[#b43b31] hover:text-white" type="submit">
              Reset local data
            </button>
          </form>
        </div>
      </Collapsible>

      <form action={logout} className="mt-6 md:hidden">
        <button className="min-h-11 w-full border border-[#1c2b3a] font-mono text-[10px] uppercase tracking-[0.08em] text-[#1c2b3a]" type="submit">Sign out</button>
      </form>
    </FinanceShell>
  );
}