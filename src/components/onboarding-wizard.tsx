"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  confirmDetectedIncome,
  createCategoriesFromWizard,
  finishOnboarding,
  saveBudgetAccounts,
  wizardDetectCategories,
  wizardDetectIncome,
  wizardSaveLlmSettings,
  wizardSaveTokens,
  wizardSync,
  wizardTestLlm,
} from "@/app/finance-actions";
import { ConnectionBanner, type ConnectionState } from "@/components/connection-banner";
import { SUGGESTED_CATEGORIES } from "@/lib/suggestions";
import type { AccountCard } from "@/lib/finance-data";
import type { LlmSettings } from "@/lib/llm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DetectedCategory = { slug: string; name: string; count: number; spend: number };
type IncomeCandidate = { merchant: string; cadence: string; monthlyEquivalent: number };

const STEPS = [
  "Welcome",
  "Connect Akahu",
  "Your accounts",
  "Categories",
  "Budgets & goals",
  "AI (optional)",
  "Done",
];

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            className={`flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.05em] ${
              done || active ? "text-[#b8922a]" : "text-[#c8bea8]"
            }`}
            key={step}
          >
            <span
              className={`grid h-5 w-5 place-items-center rounded-full border text-[10px] ${
                done ? "border-[#b8922a] bg-[#b8922a] text-white" : active ? "border-[#b8922a] text-[#b8922a]" : "border-[#c8bea8] text-[#c8bea8]"
              }`}
            >
              {done ? "✓" : index + 1}
            </span>
            <span className={active ? "font-semibold" : ""}>{step}</span>
            {index < STEPS.length - 1 && <span className="mx-0.5 h-px w-3 bg-[#c8bea8]" />}
          </li>
        );
      })}
    </ol>
  );
}

export function OnboardingWizard({
  accounts,
  llm,
}: {
  accounts: AccountCard[];
  llm: LlmSettings;
}) {
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Step 1: Akahu tokens
  const [tokensSaved, setTokensSaved] = useState(false);
  const [userToken, setUserToken] = useState("");
  const [appToken, setAppToken] = useState("");
  const [tokenState, setTokenState] = useState<ConnectionState>({ status: "idle" });
  const tokensSwapped =
    /^app_token_/i.test(userToken) || /^user_token_/i.test(appToken);
  // Step 2: accounts
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(
    accounts.map((a) => a.id),
  );  // Step 3: categories — pre-check the common defaults so the user gets a useful
  // baseline they can uncheck, rename, or add to. "Other" is always kept.
  const [categorySelection, setCategorySelection] = useState<Record<string, { name: string; color: string; selected: boolean }>>(
    Object.fromEntries(
      SUGGESTED_CATEGORIES.map((c) => [
        c.id,
        {
          name: c.name,
          color: c.color,
            selected: c.id === "other",
        },
      ]),
    ),
  );
  const [detectedCategories, setDetectedCategories] = useState<DetectedCategory[] | null>(null);
  const [customCategory, setCustomCategory] = useState("");
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  // Step 4: goal (collapsed on budgets step) + income
  const [goal, setGoal] = useState({ name: "", target: "", contribution: "" });
  const [goalAdded, setGoalAdded] = useState(false);
  const [showGoals, setShowGoals] = useState(false);
  const [income, setIncome] = useState<IncomeCandidate | null>(null);
  const [incomeConfirmed, setIncomeConfirmed] = useState(false);
  const [incomeError, setIncomeError] = useState<string | null>(null);
  // Step 5: budgets
  const [budgets, setBudgets] = useState<Record<string, string>>({});
  // Step 6: AI
  const [aiEnabled, setAiEnabled] = useState(llm.enabled);
  const [aiProvider, setAiProvider] = useState<string>(llm.provider || "surplus");
  const [aiModel, setAiModel] = useState(llm.model || "");
  const [aiBaseUrl, setAiBaseUrl] = useState(llm.baseUrl || "");
  const [aiKey, setAiKey] = useState("");
  const [aiTestState, setAiTestState] = useState<ConnectionState>({ status: "idle" });
  const aiFormValues = () => {
    const form = new FormData();
    form.append("enabled", aiEnabled ? "1" : "0");
    form.append("provider", aiProvider);
    form.append("model", aiModel);
    form.append("baseUrl", aiBaseUrl);
    form.append("apiKey", aiKey);
    return form;
  };

  const goTo = (next: number) => {
    setError(null);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const enterCategories = async () => {
    setStep(3);
    if (detectedCategories === null) {
      startTransition(async () => {
        try {
          const detected = await wizardDetectCategories();
          setDetectedCategories(detected);
          if (detected.some((d) => d.count > 0)) {
            setCategorySelection((prev) =>
              Object.fromEntries(
                SUGGESTED_CATEGORIES.map((c) => {
                  const det = detected.find((d) => d.slug === c.id);
                  const detectedNow = (det?.count ?? 0) > 0;
                  const prevItem = prev[c.id] ?? { name: c.name, color: c.color, selected: false };
                  return [
                    c.id,
                    {
                      name: prevItem.name,
                      color: prevItem.color,
                      selected: detectedNow || c.id === "other",
                    },
                  ];
                }),
              ),
            );
          }
        } catch {
          // Non-fatal — fall back to the default category selection.
        }
      });
    }
  };

  const enterBudgets = async () => {
    setStep(4);
    if (income === null && !incomeConfirmed) {
      startTransition(async () => {
        try {
          const result = await wizardDetectIncome();
          setIncome(result);
        } catch {
          setIncome(null);
        }
      });
    }
  };

  const run = (fn: () => Promise<{ ok: boolean; message?: string } | void>) =>
    new Promise<boolean>((resolve) => {
      startTransition(async () => {
        try {
          const result = await fn();
          if (result && result.ok === false) {
            setError(result.message || "Something went wrong.");
            resolve(false);
          } else {
            setError(null);
            resolve(true);
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Something went wrong.");
          resolve(false);
        }
      });
    });

  const submitTokens = async (form: FormData) => {
    setTokenState({ status: "testing", message: "Testing your Akahu connection…" });
    const ok = await run(() => wizardSaveTokens(form));
    if (ok) {
      setTokensSaved(true);
      setTokenState({
        status: "ok",
        message: "Tokens verified and encrypted.",
      });
      setTimeout(() => goTo(2), 900);
    } else {
      const base = error ?? "Akahu did not accept those tokens.";
      setTokenState({
        status: "fail",
        message: tokensSwapped
          ? "Those two tokens look swapped — the User Access Token (user_token_…) goes on top, the App ID Token (app_token_…) below."
          : base,
      });
    }
  };

  const submitAccounts = async () => {
    // Default to all accounts if the user hasn't made an explicit selection (e.g.
    // accounts arrived after first mount via sync).
    const ids = selectedAccounts.length > 0 ? selectedAccounts : accounts.map((a) => a.id);
    const form = new FormData();
    for (const id of ids) form.append("account_id", id);
    const ok = await run(() => saveBudgetAccounts(form));
    if (ok) enterCategories();
  };

  const submitCategories = async () => {
    const form = new FormData();
    for (const [slug, item] of Object.entries(categorySelection)) {
      if (item.selected) {
        form.append("selected", slug);
        form.append(`name_${slug}`, item.name);
        form.append(`color_${slug}`, item.color);
      }
    }
    for (const name of customCategories) {
      form.append("selected", `custom-${name}`);
      form.append(`name_custom-${name}`, name);
      form.append(`color_custom-${name}`, "#4f8de7");
    }
    await run(() => createCategoriesFromWizard(form));
    enterBudgets();
  };

  const testAiConnection = async () => {
    setAiTestState({ status: "testing", message: "Testing your AI connection…" });
    const result = await wizardTestLlm(aiFormValues());
    if (result.ok) {
      setAiTestState({ status: "ok", message: "Connection test succeeded." });
    } else {
      setAiTestState({ status: "fail", message: result.message ?? "Connection failed." });
    }
  };

  const confirmIncome = async () => {
    if (!income) return;
    setIncomeError(null);
    const form = new FormData();
    form.append("confirm", "1");
    const result = await confirmDetectedIncome(form);
    if (result.ok) {
      setIncomeConfirmed(true);
    } else {
      setIncomeError(result.message ?? "Could not save income.");
    }
  };

  const finish = async () => {
    const ok = await run(() => finishOnboarding());
    if (ok) router.push("/");
  };

  const stepError = pending ? (
    <p className="text-sm text-[#7a7a7a]">Working…</p>
  ) : error ? (
    <p className="text-sm text-[#b43b31]" role="alert">{error}</p>
  ) : null;

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Welcome to Kashin</CardTitle>
        <CardDescription>
          A few quick steps to connect your banks and set up your own categories, goals, and budgets. Everything stays on your machine.
        </CardDescription>
        <div className="pt-2">
          <Stepper current={step} />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* STEP 0: Welcome */}
        {step === 0 && (
          <div className="space-y-5">
            <p className="text-sm leading-6 text-[#4a4a4a]">
              Kashin connects to your New Zealand banks through <strong>Akahu</strong>, stores everything in a local file,
              and helps you budget and review your spending. Nothing is sent to a cloud you don&apos;t control.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Private by default", "All data stays in a local SQLite file on this machine."],
                ["Built on Akahu", "Connect your own banks through your free Akahu personal app."],
                ["Your categories", "Build your own spending categories — nothing is pre-set for you."],
                ["Optional AI", "Bring your own LLM key to help label tricky transactions."],
              ].map(([title, body]) => (
                <div className="border border-[#c8bea8] bg-[#faf8f3] p-4" key={title}>
                  <p className="text-sm font-semibold text-[#1c2b3a]">{title}</p>
                  <p className="mt-1 text-sm leading-5 text-[#7a7a7a]">{body}</p>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => goTo(1)} size="lg">Get started</Button>
            </div>
          </div>
        )}

        {/* STEP 1: Connect Akahu */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-[#4a4a4a]">
              Get your free personal-app tokens from <a className="underline" href="https://my.akahu.nz" target="_blank" rel="noreferrer">my.akahu.nz</a>.
              Kashin only requests read-only access and never stores bank passwords.
            </p>
            <form action={submitTokens} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="userToken">Akahu User Access Token</Label>
                <Input autoComplete="off" id="userToken" name="userToken" onChange={(e) => setUserToken(e.target.value)} placeholder="user_token_…" spellCheck={false} type="password" value={userToken} />
                <p className="font-mono text-[10px] text-[#9a9a9a]">Starts with <span className="text-[#7a7a7a]">user_token_</span></p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="appToken">Akahu App ID Token</Label>
                <Input autoComplete="off" id="appToken" name="appToken" onChange={(e) => setAppToken(e.target.value)} placeholder="app_token_…" spellCheck={false} type="password" value={appToken} />
                <p className="font-mono text-[10px] text-[#9a9a9a]">Starts with <span className="text-[#7a7a7a]">app_token_</span></p>
              </div>
              {tokensSwapped && !tokensSaved && (
                <ConnectionBanner
                  state={{ status: "warn", message: "These look swapped — the User Access Token goes in the top field, the App ID Token in the bottom." }}
                />
              )}
              <div className="flex items-center justify-between gap-3 pt-2">
                <Button onClick={() => goTo(0)} type="button" variant="ghost">Back</Button>
                <div className="flex items-center gap-3">
                  <Button onClick={() => goTo(2)} type="button" variant="outline">Skip for now</Button>
                  <Button disabled={pending} type="submit" variant="primary">
                    {pending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Testing…
                      </>
                    ) : (
                      "Verify & continue"
                    )}
                  </Button>
                </div>
              </div>
            </form>
            <ConnectionBanner state={tokenState} />
            {stepError}
          </div>
        )}

        {/* STEP 2: Accounts */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-[#4a4a4a]">
              {accounts.length === 0
                ? "No accounts synced yet. Sync to pull in your Akahu accounts."
                : "Choose which accounts feed your main balanced budget. Untick any you want to exclude."}
            </p>
            {accounts.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {accounts.map((account) => (
                  <label className="flex cursor-pointer items-center gap-3 border border-[#c8bea8] bg-[#faf8f3] px-3 py-2.5" key={account.id}>
                    <Checkbox
                      checked={selectedAccounts.includes(account.id)}
                      onCheckedChange={(checked) =>
                        setSelectedAccounts((prev) =>
                          checked ? [...prev, account.id] : prev.filter((id) => id !== account.id),
                        )
                      }
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-[#1a1a1a]">{account.displayName}</span>
                      <span className="block font-mono text-[9px] uppercase tracking-[0.05em] text-[#9a9a9a]">{account.institution} · {account.type}{account.formattedAccount ? ` · ${account.formattedAccount}` : ""}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <Button onClick={() => goTo(1)} type="button" variant="ghost">Back</Button>
              <div className="flex items-center gap-3">
                {accounts.length === 0 ? (
                  <Button disabled={pending} onClick={async () => { await run(() => wizardSync()); router.refresh(); }} type="button">
                    Sync now
                  </Button>
                ) : null}
                <Button disabled={pending} onClick={submitAccounts} variant="primary">Continue</Button>
              </div>
            </div>
            {stepError}
          </div>
        )}

        {/* STEP 3: Categories */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-[#4a4a4a]">
              We found these categories in your transactions and pre-ticked them. Rename, recolor, untick, or add your own.
              “Other” stays as the fallback for anything unclassified.
            </p>
            {detectedCategories === null && <p className="text-sm text-[#7a7a7a]">Analysing your transactions…</p>}
            <div className="grid gap-2">
              {Object.entries(categorySelection).map(([slug, item]) => {
                const det = detectedCategories?.find((d) => d.slug === slug);
                const detectedNow = (det?.count ?? 0) > 0;
                const isOther = slug === "other";
                return (
                  <div
                    className={`flex items-center gap-3 border border-[#c8bea8] bg-[#faf8f3] px-3 py-2 ${!detectedNow && !isOther ? "opacity-70" : ""}`}
                    key={slug}
                  >
                    <Checkbox
                      checked={item.selected}
                      onCheckedChange={(checked) =>
                        setCategorySelection((prev) => ({ ...prev, [slug]: { ...prev[slug], selected: !!checked } }))
                      }
                    />
                    <input
                      className="w-40 border border-transparent bg-transparent px-1 py-0.5 text-sm text-[#1a1a1a] outline-none focus:border-[#c8bea8]"
                      value={item.name}
                      onChange={(e) => setCategorySelection((prev) => ({ ...prev, [slug]: { ...prev[slug], name: e.target.value } }))}
                      disabled={!item.selected}
                    />
                    {det && (
                      <span className="text-xs text-[#9a9a9a]">
                        {det.count} txn{det.count === 1 ? "" : "s"}
                        {det.spend ? ` · $${det.spend.toFixed(0)} last 12 mo` : ""}
                      </span>
                    )}
                    <input
                      className="ml-auto h-7 w-9 cursor-pointer border border-[#c8bea8] bg-[#faf8f3]"
                      type="color"
                      value={item.color}
                      onChange={(e) => setCategorySelection((prev) => ({ ...prev, [slug]: { ...prev[slug], color: e.target.value } }))}
                      disabled={!item.selected}
                    />
                  </div>
                );
              })}
              {customCategories.map((name) => (
                <div className="flex items-center gap-3 border border-[#c8bea8] bg-[#faf8f3] px-3 py-2" key={name}>
                  <span className="h-4 w-4 rounded-full" style={{ backgroundColor: "#4f8de7" }} />
                  <span className="text-sm text-[#1a1a1a]">{name}</span>
                  <Button className="ml-auto" onClick={() => setCustomCategories((prev) => prev.filter((n) => n !== name))} size="sm" type="button" variant="ghost">
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const name = customCategory.trim();
                if (name && !customCategories.includes(name)) setCustomCategories((prev) => [...prev, name]);
                setCustomCategory("");
              }}
            >
              <Input className="flex-1" onChange={(e) => setCustomCategory(e.target.value)} placeholder="Add your own category" value={customCategory} />
              <Button type="submit" variant="outline">Add</Button>
            </form>
            <div className="flex items-center justify-between gap-3">
              <Button onClick={() => goTo(2)} type="button" variant="ghost">Back</Button>
              <Button disabled={pending} onClick={submitCategories} variant="primary">Save categories & continue</Button>
            </div>
            {stepError}
          </div>
        )}

        {/* STEP 4: Budgets & goals */}
        {step === 4 && (
          <div className="space-y-4">
            {income && !incomeConfirmed && (
              <div className="border border-[#c8bea8] bg-[#faf8f3] p-4">
                <p className="text-sm font-semibold text-[#1c2b3a]">We detected your income</p>
                <p className="mt-1 text-sm leading-5 text-[#4a4a4a]">
                  About <span className="font-semibold text-[#1c2b3a]">${income.monthlyEquivalent.toFixed(0)}/mo</span>
                  {income.cadence ? ` (${income.cadence})` : ""} — looks like {income.merchant}. Confirm to enable income-aware budgeting.
                </p>
                {incomeError && <p className="mt-2 text-sm text-[#a33d2e]">{incomeError}</p>}
                <div className="mt-3 flex gap-2">
                  <Button onClick={confirmIncome} size="sm" type="button" variant="primary">That&apos;s right</Button>
                  <Button onClick={() => setIncomeConfirmed(true)} size="sm" type="button" variant="ghost">Skip</Button>
                </div>
              </div>
            )}
            <p className="text-sm leading-6 text-[#4a4a4a]">
              Optional: set a monthly target for each category you chose. You can change these anytime on the Budget page.
            </p>
            {Object.entries(categorySelection)
              .filter(([, item]) => item.selected)
              .map(([slug, item]) => (
                <div className="flex items-center justify-between gap-3 border border-[#c8bea8] bg-[#faf8f3] px-3 py-2.5" key={slug}>
                  <span className="flex items-center gap-2 text-sm text-[#1a1a1a]">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    {item.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-[#9a9a9a]">$</span>
                    <Input
                      className="w-28"
                      min="0"
                      onChange={(e) => setBudgets((b) => ({ ...b, [slug]: e.target.value }))}
                      placeholder="0"
                      type="number"
                      value={budgets[slug] ?? ""}
                    />
                  </div>
                </div>
              ))}
            <div className="border-t border-[#e6e0d2] pt-4">
              <button
                className="flex items-center gap-2 text-sm font-semibold text-[#1c2b3a]"
                onClick={() => setShowGoals((s) => !s)}
                type="button"
              >
                <span className={`inline-block transition-transform ${showGoals ? "rotate-90" : ""}`}>▸</span>
                Goals {goalAdded && <span className="font-normal text-[#1a5c2a]">· added</span>}
              </button>
              {showGoals && (
                <div className="mt-3 space-y-3">
                  <p className="text-sm leading-5 text-[#7a7a7a]">
                    Optional: create your own savings goals (e.g. “Holiday”). You can add more anytime in Settings.
                  </p>
                  {goalAdded && (
                    <div className="flex items-center justify-between border border-[#c8bea8] bg-[#faf8f3] px-3 py-2.5">
                      <span className="text-sm text-[#1a1a1a]">{goal.name}</span>
                      <span className="font-mono text-[10px] text-[#7a7a7a]">target ${goal.target}</span>
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="goalName">Name</Label>
                      <Input id="goalName" onChange={(e) => setGoal((g) => ({ ...g, name: e.target.value }))} placeholder="e.g. Holiday" value={goal.name} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="goalTarget">Target ($)</Label>
                      <Input id="goalTarget" min="0" onChange={(e) => setGoal((g) => ({ ...g, target: e.target.value }))} type="number" value={goal.target} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="goalContribution">Monthly ($)</Label>
                      <Input id="goalContribution" min="0" onChange={(e) => setGoal((g) => ({ ...g, contribution: e.target.value }))} type="number" value={goal.contribution} />
                    </div>
                  </div>
                  <Button
                    disabled={pending || !goal.name || !goal.target}
                    onClick={async () => {
                      const form = new FormData();
                      form.append("name", goal.name);
                      form.append("target", goal.target);
                      form.append("contribution", goal.contribution || "0");
                      const ok = await run(async () => {
                        const { addGoal } = await import("@/app/finance-actions");
                        await addGoal(form);
                        return { ok: true };
                      });
                      if (ok) setGoalAdded(true);
                    }}
                    type="button"
                    variant="outline"
                  >
                    Add goal
                  </Button>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <Button onClick={() => goTo(3)} type="button" variant="ghost">Back</Button>
              <Button
                disabled={pending}
                onClick={async () => {
                  const form = new FormData();
                  for (const [slug, value] of Object.entries(budgets)) {
                    if (value !== "") form.append(`limit_${slug}`, value);
                  }
                  const ok = await run(async () => {
                    const { updateBudgets } = await import("@/app/finance-actions");
                    await updateBudgets(form);
                    return { ok: true };
                  });
                  if (ok) goTo(5);
                }}
                variant="primary"
              >
                Save budgets & continue
              </Button>
            </div>
            {stepError}
          </div>
        )}

        {/* STEP 5: AI */}
        {step === 5 && (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-[#4a4a4a]">
              Optional: use a bring-your-own LLM to help label transactions. Off by default. When on, descriptions of unmatched
              transactions go to the provider you choose — never account numbers or tokens.
            </p>
            <label className="flex cursor-pointer items-center gap-3 text-sm text-[#1a1a1a]">
              <Checkbox checked={aiEnabled} onCheckedChange={(checked) => setAiEnabled(!!checked)} />
              Enable AI categorisation
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="aiProvider">Provider</Label>
                <select className="field" id="aiProvider" onChange={(e) => setAiProvider(e.target.value)} value={aiProvider}>
                  <option value="surplus">Surplus Intelligence</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="custom">OpenAI-compatible (custom)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aiModel">Model</Label>
                <Input id="aiModel" onChange={(e) => setAiModel(e.target.value)} placeholder="deepseek-v4-flash-0731-fast" value={aiModel} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="aiBaseUrl">Base URL <span className="font-mono text-[10px] text-[#9a9a9a]">(custom only)</span></Label>
                <Input id="aiBaseUrl" onChange={(e) => setAiBaseUrl(e.target.value)} placeholder="https://api.surplusintelligence.ai/v1" value={aiBaseUrl} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="aiKey">API key</Label>
                <Input autoComplete="off" id="aiKey" onChange={(e) => setAiKey(e.target.value)} placeholder="sk-…" type="password" value={aiKey} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button disabled={pending} onClick={testAiConnection} type="button" variant="outline">
                Test connection
              </Button>
              <ConnectionBanner state={aiTestState} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Button onClick={() => goTo(4)} type="button" variant="ghost">Back</Button>
              <div className="flex items-center gap-3">
                <Button
                  disabled={pending}
                  onClick={async () => {
                    const form = new FormData();
                    form.append("enabled", aiEnabled ? "1" : "0");
                    form.append("provider", aiProvider);
                    form.append("model", aiModel);
                    form.append("baseUrl", aiBaseUrl);
                    form.append("apiKey", aiKey);
                    const ok = await run(() => wizardSaveLlmSettings(form));
                    if (ok) {
                      goTo(6);
                    }
                  }}
                  type="button"
                  variant="primary"
                >
                  Save & continue
                </Button>
              </div>
            </div>
            {stepError}
          </div>
        )}

        {/* STEP 6: Done */}
        {step === 6 && (
          <div className="space-y-5">
            <p className="text-sm leading-6 text-[#4a4a4a]">
              You&apos;re all set! Sync your transactions to start budgeting and reviewing. You can always adjust categories,
              goals, and budgets later in Settings.
            </p>
            <div className="flex justify-end gap-3">
              <Button disabled={pending} onClick={async () => { await run(() => wizardSync()); router.refresh(); }} variant="outline">
                Sync now
              </Button>
              <Button disabled={pending} onClick={finish} variant="primary">Go to dashboard</Button>
            </div>
            {stepError}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
