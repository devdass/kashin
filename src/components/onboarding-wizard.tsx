"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCategoriesFromWizard,
  finishOnboarding,
  saveBudgetAccounts,
  wizardSaveLlmSettings,
  wizardSaveTokens,
  wizardSync,
} from "@/app/finance-actions";
import { SUGGESTED_CATEGORIES } from "@/lib/suggestions";
import type { AccountCard } from "@/lib/finance-data";
import type { LlmSettings } from "@/lib/llm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STEPS = [
  "Welcome",
  "Connect Akahu",
  "Your accounts",
  "Categories",
  "Goals",
  "Budgets",
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
          selected: ["groceries", "eating-out", "bills", "transport", "shopping", "health", "income", "other"].includes(c.id),
        },
      ]),
    ),
  );
  const [customCategory, setCustomCategory] = useState("");
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  // Step 4: goal
  const [goal, setGoal] = useState({ name: "", target: "", contribution: "" });
  const [goalAdded, setGoalAdded] = useState(false);
  // Step 5: budgets
  const [budgets, setBudgets] = useState<Record<string, string>>({});
  // Step 6: AI
  const [aiEnabled, setAiEnabled] = useState(llm.enabled);
  const [aiProvider, setAiProvider] = useState<string>(llm.provider || "surplus");
  const [aiModel, setAiModel] = useState(llm.model || "");
  const [aiBaseUrl, setAiBaseUrl] = useState(llm.baseUrl || "");
  const [aiKey, setAiKey] = useState("");

  // Default-select all synced accounts for the budget once they arrive (they may
  // not exist at first mount, before the user syncs). Only fills in if nothing is
  // selected yet, so it never overrides an explicit choice.
  useEffect(() => {
    if (selectedAccounts.length === 0 && accounts.length > 0) {
      setSelectedAccounts(accounts.map((a) => a.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  const goTo = (next: number) => {
    setError(null);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    const ok = await run(() => wizardSaveTokens(form));
    if (ok) {
      setTokensSaved(true);
      goTo(2);
    }
  };

  const submitAccounts = async () => {
    const form = new FormData();
    for (const id of selectedAccounts) form.append("account_id", id);
    const ok = await run(() => saveBudgetAccounts(form));
    if (ok) goTo(3);
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
    goTo(4);
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
                <Input autoComplete="off" id="userToken" name="userToken" spellCheck={false} type="password" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="appToken">Akahu App ID Token</Label>
                <Input autoComplete="off" id="appToken" name="appToken" spellCheck={false} type="password" />
              </div>
              <div className="flex items-center justify-between gap-3 pt-2">
                <Button onClick={() => goTo(0)} type="button" variant="ghost">Back</Button>
                <div className="flex items-center gap-3">
                  <Button onClick={() => goTo(2)} type="button" variant="outline">Skip for now</Button>
                  <Button disabled={pending} type="submit" variant="primary">Verify & continue</Button>
                </div>
              </div>
            </form>
            {tokensSaved && <p className="text-sm text-[#1a5c2a]">✓ Tokens verified and saved.</p>}
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
              Build your own spending categories. Tick the ones you want, rename them, pick a colour, or add your own.
              “Other” is kept as the fallback for anything unclassified.
            </p>
            <div className="grid gap-2">
              {Object.entries(categorySelection).map(([slug, item]) => (
                <div className="flex items-center gap-3 border border-[#c8bea8] bg-[#faf8f3] px-3 py-2" key={slug}>
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
                  <input
                    className="ml-auto h-7 w-9 cursor-pointer border border-[#c8bea8] bg-[#faf8f3]"
                    type="color"
                    value={item.color}
                    onChange={(e) => setCategorySelection((prev) => ({ ...prev, [slug]: { ...prev[slug], color: e.target.value } }))}
                    disabled={!item.selected}
                  />
                </div>
              ))}
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

        {/* STEP 4: Goals */}
        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-[#4a4a4a]">
              Optional: create your own savings goals (e.g. “Holiday”, “New car”). You can add more anytime in Settings.
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
            <div className="flex items-center justify-between gap-3">
              <Button onClick={() => goTo(3)} type="button" variant="ghost">Back</Button>
              <Button disabled={pending} onClick={() => goTo(5)} variant="primary">Continue</Button>
            </div>
            {stepError}
          </div>
        )}

        {/* STEP 5: Budgets */}
        {step === 5 && (
          <div className="space-y-4">
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
            <div className="flex items-center justify-between gap-3">
              <Button onClick={() => goTo(4)} type="button" variant="ghost">Back</Button>
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
                  if (ok) goTo(6);
                }}
                variant="primary"
              >
                Save budgets & continue
              </Button>
            </div>
            {stepError}
          </div>
        )}

        {/* STEP 6: AI */}
        {step === 6 && (
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
            <div className="flex items-center justify-between gap-3">
              <Button onClick={() => goTo(5)} type="button" variant="ghost">Back</Button>
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
                      goTo(7);
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

        {/* STEP 7: Done */}
        {step === 7 && (
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