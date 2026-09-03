"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/lib/auth";
import { verifyAkahuTokens } from "@/lib/akahu";
import { getAkahuTokens, saveAkahuTokens } from "@/lib/credentials";
import { db } from "@/lib/db";
import { classifyBacklog, classifyUnreviewedWithLlm, slugify } from "@/lib/finance";
import { syncFinanceData } from "@/lib/finance-sync";
import {
  getLlmSettings,
  saveLlmSettings as persistLlmSettings,
  testLlmConnection,
  type LlmProvider,
} from "@/lib/llm";
import { getVaultConfigurationError } from "@/lib/vault";

async function requireUser() {
  if (!(await getAuthenticatedUserId())) redirect("/");
}

function numberValue(formData: FormData, name: string) {
  const raw = formData.get(name);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export async function syncFinance() {
  await requireUser();
  const tokens = getAkahuTokens();
  if (!tokens) redirect("/?notice=tokens-required");
  const result = await syncFinanceData(tokens);
  revalidatePath("/", "layout");
  redirect(
    result.status === "success"
      ? "/?notice=sync-success"
      : "/?notice=sync-failed",
  );
}

export async function updateGoal(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const current = numberValue(formData, "current");
  const target = numberValue(formData, "target");
  const contribution = numberValue(formData, "contribution");
  if (!id || current === null || target === null || contribution === null) return;

  db.prepare(`
    UPDATE goals SET current_amount = ?, target_amount = ?,
      monthly_contribution = ?, updated_at = ? WHERE id = ?
  `).run(current, target, contribution, new Date().toISOString(), id);
  revalidatePath("/goals");
  revalidatePath("/");
}

export async function updateBudget(formData: FormData) {
  await requireUser();
  const categoryId = String(formData.get("categoryId") ?? "");
  const limit = numberValue(formData, "limit");
  if (!categoryId || limit === null) return;
  db.prepare(`
    INSERT INTO budgets (category_id, monthly_limit, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(category_id) DO UPDATE SET
      monthly_limit = excluded.monthly_limit,
      updated_at = excluded.updated_at
  `).run(categoryId, limit, new Date().toISOString());
  revalidatePath("/budget");
  revalidatePath("/");
}

export async function updateBudgets(formData: FormData) {
  await requireUser();
  const now = new Date().toISOString();
  const save = db.transaction(() => {
    const statement = db.prepare(`
      INSERT INTO budgets (category_id, monthly_limit, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(category_id) DO UPDATE SET
        monthly_limit = excluded.monthly_limit,
        updated_at = excluded.updated_at
    `);
    for (const [key, raw] of formData.entries()) {
      if (!key.startsWith("limit_")) continue;
      const categoryId = key.slice("limit_".length);
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) continue;
      statement.run(categoryId, value, now);
    }
  });
  save();
  revalidatePath("/budget");
  revalidatePath("/");
}

export async function saveReviewSelections(formData: FormData) {
  await requireUser();
  const now = new Date().toISOString();
  const entries = [...formData.entries()];
  const selected = entries
    .filter(([key]) => key.startsWith("selected_"))
    .map(([key]) => key.slice("selected_".length));
  if (selected.length === 0) return;

  const categories = new Map<string, string>();
  const learn = new Set<string>();
  let learnAll = false;
  for (const [key, value] of entries) {
    if (key.startsWith("category_")) {
      categories.set(key.slice("category_".length), String(value));
    }
    if (key.startsWith("learn_") && key !== "learn_all") {
      learn.add(key.slice("learn_".length));
    }
    if (key === "learn_all") learnAll = true;
  }

  const lookup = db.prepare(`
    SELECT normalized_merchant, merchant, description
    FROM cached_transactions WHERE id = ?
  `);
  const override = db.prepare(`
    INSERT INTO transaction_overrides
      (transaction_id, category_id, apply_to_vendor, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(transaction_id) DO UPDATE SET
      category_id = excluded.category_id,
      apply_to_vendor = excluded.apply_to_vendor,
      updated_at = excluded.updated_at
  `);
  const setCategory = db.prepare(`
    UPDATE cached_transactions SET category_id = ?, category_source = 'MANUAL',
      confidence = 1, reviewed = 1 WHERE id = ?
  `);
  const upsertRule = db.prepare(`
    INSERT INTO vendor_rules
      (vendor, normalized_vendor, category_id, source, confidence, created_at, updated_at)
    VALUES (?, ?, ?, 'MANUAL', 1, ?, ?)
    ON CONFLICT(normalized_vendor) DO UPDATE SET
      category_id = excluded.category_id,
      source = 'MANUAL', confidence = 1, updated_at = excluded.updated_at
  `);
  const applyRule = db.prepare(`
    UPDATE cached_transactions SET category_id = ?, category_source = 'VENDOR',
      confidence = 1, reviewed = 1
    WHERE normalized_merchant = ? AND id <> ?
      AND id NOT IN (SELECT transaction_id FROM transaction_overrides)
  `);

  const save = db.transaction(() => {
    for (const transactionId of selected) {
      const categoryId = categories.get(transactionId);
      if (!categoryId) continue;
      const transaction = lookup.get(transactionId) as
        | { normalized_merchant: string; merchant: string | null; description: string }
        | undefined;
      if (!transaction) continue;
      override.run(transactionId, categoryId, learnAll || learn.has(transactionId) ? 1 : 0, now, now);
      setCategory.run(categoryId, transactionId);
      if ((learnAll || learn.has(transactionId)) && transaction.normalized_merchant) {
        upsertRule.run(
          transaction.merchant ?? transaction.description,
          transaction.normalized_merchant,
          categoryId,
          now,
          now,
        );
        applyRule.run(categoryId, transaction.normalized_merchant, transactionId);
      }
    }
  });
  save();
  revalidatePath("/", "layout");
  revalidatePath("/activity");
}

export async function saveBudgetAccounts(formData: FormData) {
  await requireUser();
  const ids = formData
    .getAll("account_id")
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0);
  db.prepare(`
    INSERT INTO finance_settings (key, value, updated_at)
    VALUES ('budget_account_ids', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(JSON.stringify(ids), new Date().toISOString());
  revalidatePath("/", "layout");
  revalidatePath("/budget");
  revalidatePath("/settings");
}

export async function toggleGoalAutoTrack(formData: FormData) {
  await requireUser();
  const value = formData.get("enabled") === "1" ? "1" : "0";
  db.prepare(`
    INSERT INTO finance_settings (key, value, updated_at)
    VALUES ('goal_auto_track', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(value, new Date().toISOString());
  revalidatePath("/settings");
  revalidatePath("/");
}

export async function classifyBacklogNow() {
  await requireUser();
  classifyBacklog();
  revalidatePath("/", "layout");
  redirect("/settings");
}

export async function updateAccountNickname(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "").trim();
  const nickname = String(formData.get("nickname") ?? "").trim();
  if (!id) return;
  db.prepare("UPDATE cached_accounts SET nickname = ? WHERE id = ?").run(nickname || null, id);
  revalidatePath("/", "layout");
  revalidatePath(`/accounts/${id}`);
}

export async function undoReviewSelections(
  items: Array<{ id: string; categoryId: string; source: string; confidence: number; reviewed: boolean }>,
) {
  await requireUser();
  if (items.length === 0) return;
  db.transaction(() => {
    for (const { id, categoryId, source, confidence, reviewed } of items) {
      db.prepare(`
        UPDATE cached_transactions SET category_id = ?, category_source = ?,
          confidence = ?, reviewed = ? WHERE id = ?
      `).run(categoryId, source, confidence, reviewed ? 1 : 0, id);
      db.prepare("DELETE FROM transaction_overrides WHERE transaction_id = ?").run(id);
    }
  })();
  revalidatePath("/", "layout");
  revalidatePath("/activity");
}

export async function createCategory(formData: FormData) {
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const existing = db.prepare("SELECT id FROM categories WHERE name = ?").get(name);
  if (existing) {
    revalidatePath("/settings");
    return;
  }
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `cat-${Date.now()}`;
  const maxOrder = (db.prepare("SELECT COALESCE(MAX(sort_order), 0) m FROM categories").get() as { m: number }).m;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO categories (id, name, section, color, sort_order, created_at, updated_at)
    VALUES (?, ?, 'PERSONAL', ?, ?, ?, ?)
  `).run(id, name, "#9a9a93", maxOrder + 1, now, now);
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

export async function renameCategory(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
  if (!id || (!name && !color)) return;
  db.prepare("UPDATE categories SET name = COALESCE(?, name), color = COALESCE(?, color), updated_at = ? WHERE id = ?")
    .run(name || null, color || null, new Date().toISOString(), id);
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

export async function archiveCategory(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const usage = (db.prepare("SELECT COUNT(*) c FROM cached_transactions WHERE category_id = ? AND is_hidden = 0").get(id) as { c: number }).c;
  if (usage > 0) {
    revalidatePath("/settings");
    return;
  }
  db.prepare("UPDATE categories SET archived = 1, updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  db.prepare("DELETE FROM budgets WHERE category_id = ?").run(id);
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

export async function createCategoriesFromWizard(formData: FormData) {
  await requireUser();
  const now = new Date().toISOString();
  const existing = new Set<string>((db.prepare("SELECT id FROM categories").all() as Array<{ id: string }>).map((r) => r.id));
  let maxOrder = (db.prepare("SELECT COALESCE(MAX(sort_order), 0) m FROM categories").get() as { m: number }).m;
  const seen = new Set<string>();
  const insert = db.prepare(`
    INSERT INTO categories (id, name, section, color, sort_order, created_at, updated_at)
    VALUES (?, ?, 'PERSONAL', ?, ?, ?, ?)
  `);

  const addOne = (nameRaw: string, colorRaw: string) => {
    const name = nameRaw.trim();
    if (!name) return;
    const normalizedName = name.toLowerCase();
    if (seen.has(normalizedName)) return;
    seen.add(normalizedName);
    let id = slugify(name);
    if (!id) id = `cat-${Date.now()}-${maxOrder}`;
    while (existing.has(id)) {
      id = `${id}-${maxOrder}`;
      maxOrder += 1;
    }
    existing.add(id);
    maxOrder += 1;
    insert.run(id, name, colorRaw || "#9a9a93", maxOrder, now, now);
  };

  // Read checkbox selections: name_<slug> and color_<slug>
  const selected = formData.getAll("selected").map(String);
  for (const slug of selected) {
    const name = String(formData.get(`name_${slug}`) ?? "").trim();
    const color = String(formData.get(`color_${slug}`) ?? "").trim();
    if (name) addOne(name, color);
  }

  // Ensure an "Other" catch-all exists so uncategorised transactions have a home.
  const otherExists = [...existing].some((id) => id === "other") ||
    Boolean(db.prepare("SELECT 1 FROM categories WHERE name = 'Other'").get());
  if (!otherExists) {
    let id = "other";
    while (existing.has(id)) id = `other-${maxOrder}`;
    existing.add(id);
    maxOrder += 1;
    insert.run(id, "Other", "#9a9a93", maxOrder, now, now);
  }

  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

export async function completeOnboarding() {
  await requireUser();
  db.prepare(`
    INSERT INTO finance_settings (key, value, updated_at) VALUES ('onboarding_complete', '1', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(new Date().toISOString());
  revalidatePath("/", "layout");
  revalidatePath("/welcome");
  redirect("/");
}

export async function skipOnboarding() {
  await requireUser();
  // Ensure an "Other" category exists so uncategorised transactions have a home.
  const otherExists = Boolean(db.prepare("SELECT 1 FROM categories WHERE name = 'Other'").get());
  if (!otherExists) {
    const now = new Date().toISOString();
    const maxOrder = (db.prepare("SELECT COALESCE(MAX(sort_order), 0) m FROM categories").get() as { m: number }).m;
    db.prepare("INSERT INTO categories (id, name, section, color, sort_order, created_at, updated_at) VALUES ('other', 'Other', 'PERSONAL', '#9a9a93', ?, ?, ?)").run(maxOrder + 1, now, now);
  }
  db.prepare(`
    INSERT INTO finance_settings (key, value, updated_at) VALUES ('onboarding_complete', '1', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(new Date().toISOString());
  revalidatePath("/", "layout");
  revalidatePath("/welcome");
  redirect("/");
}

export async function addGoal(formData: FormData) {
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const target = numberValue(formData, "target");
  const contribution = numberValue(formData, "contribution") ?? 0;
  if (!name || target === null) return;
  const id = `goal-${Date.now()}`;
  const maxOrder = (db.prepare("SELECT COALESCE(MAX(sort_order), 0) m FROM goals").get() as { m: number }).m;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO goals (id, name, target_amount, current_amount, monthly_contribution, color, sort_order, updated_at)
    VALUES (?, ?, ?, 0, ?, ?, ?, ?)
  `).run(id, name, target, contribution, "#4f8de7", maxOrder + 1, now);
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

export async function deleteGoal(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  db.prepare("DELETE FROM goal_contributions WHERE goal_id = ?").run(id);
  db.prepare("DELETE FROM goals WHERE id = ?").run(id);
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

export async function addTravelWindow(formData: FormData) {
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const start = String(formData.get("startsOn") ?? "").trim();
  const end = String(formData.get("endsOn") ?? "").trim();
  if (!name || !start || !end) return;
  db.prepare(`
    INSERT INTO travel_windows (name, starts_on, ends_on, created_at)
    VALUES (?, ?, ?, ?)
  `).run(name, start, end, new Date().toISOString());
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

export async function deleteTravelWindow(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  db.prepare("DELETE FROM travel_windows WHERE id = ?").run(id);
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

export async function savePreferences(formData: FormData) {
  await requireUser();
  const now = new Date().toISOString();
  const defaults: Record<string, string> = {
    salary_monthly: "0",
    weekly_discretionary: "0",
    debt_baseline: "0",
    debt_monthly_target: "0",
    debt_weekly_target: "0",
    debt_apr_estimate: "0",
    reporting_timezone: "Pacific/Auckland",
  };
  const statement = db.prepare(`
    INSERT INTO finance_settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  for (const key of Object.keys(defaults)) {
    const raw = formData.get(key);
    if (typeof raw !== "string") continue;
    statement.run(key, raw.trim() === "" ? defaults[key] : raw.trim(), now);
  }
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

export async function saveLlmSettings(formData: FormData) {
  await requireUser();
  if (getVaultConfigurationError()) redirect("/settings?notice=vault-invalid");
  const enabled = formData.get("enabled") === "1";
  const provider = (["openai", "anthropic", "custom", "surplus"].includes(String(formData.get("provider")))
    ? String(formData.get("provider"))
    : "openai") as LlmProvider;
  const model = String(formData.get("model") ?? "").trim();
  const baseUrl = String(formData.get("baseUrl") ?? "").trim() || null;
  const rawKey = String(formData.get("apiKey") ?? "").trim();
  persistLlmSettings({
    enabled,
    provider,
    model,
    baseUrl,
    apiKey: rawKey === "" ? null : rawKey,
  });
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  redirect("/settings?notice=llm-saved");
}

export async function clearLlmApiKey() {
  await requireUser();
  const current = getLlmSettings();
  persistLlmSettings({
    enabled: false,
    provider: current.provider,
    model: current.model,
    baseUrl: current.baseUrl,
    apiKey: null,
  });
  revalidatePath("/settings");
}

export async function runLlmTest() {
  await requireUser();
  const result = await testLlmConnection();
  revalidatePath("/settings");
  redirect(`/settings?notice=${result.ok ? "llm-ok" : "llm-fail"}`);
}

export async function categorizeNow() {
  await requireUser();
  await classifyUnreviewedWithLlm();
  revalidatePath("/", "layout");
  revalidatePath("/activity");
  revalidatePath("/settings");
}

export async function replaceAkahuTokens(formData: FormData) {
  if (!(await getAuthenticatedUserId())) redirect("/?notice=session-expired");
  if (getVaultConfigurationError()) redirect("/?notice=vault-invalid");
  const userToken = String(formData.get("userToken") ?? "").trim();
  const appToken = String(formData.get("appToken") ?? "").trim();
  if (!userToken || !appToken) redirect("/settings?notice=tokens-required");
  const result = await verifyAkahuTokens({ userToken, appToken });
  if (result.status !== "connected") redirect("/settings?notice=tokens-invalid");
  saveAkahuTokens({ userToken, appToken });
  redirect("/?notice=tokens-saved");
}

export async function disconnectAkahu() {
  await requireUser();
  db.prepare("DELETE FROM akahu_credentials WHERE id = 1").run();
  revalidatePath("/", "layout");
  revalidatePath("/settings");
}

export async function resetLocalData() {
  await requireUser();
  const tables = [
    "transaction_overrides",
    "goal_contributions",
    "classification_decisions",
    "classification_runs",
    "cached_transactions",
    "cached_accounts",
    "account_balance_snapshots",
    "budgets",
    "goals",
    "travel_windows",
    "vendor_rules",
    "finance_settings",
    "sync_runs",
  ];
  db.transaction(() => {
    for (const table of tables) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
  })();
  const { seedFinanceData } = await import("@/lib/finance");
  seedFinanceData();
  revalidatePath("/", "layout");
  revalidatePath("/settings");
  redirect("/settings?notice=reset-done");
}

export type WizardActionResult = { ok: boolean; message?: string };

export async function wizardSaveTokens(formData: FormData): Promise<WizardActionResult> {
  if (!(await getAuthenticatedUserId())) return { ok: false, message: "Not signed in." };
  if (getVaultConfigurationError()) return { ok: false, message: "Encryption key not configured." };
  const userToken = String(formData.get("userToken") ?? "").trim();
  const appToken = String(formData.get("appToken") ?? "").trim();
  if (!userToken || !appToken) return { ok: false, message: "Both Akahu tokens are required." };
  const result = await verifyAkahuTokens({ userToken, appToken });
  if (result.status !== "connected") {
    return { ok: false, message: result.status === "error" ? result.message : "Akahu did not accept those tokens." };
  }
  saveAkahuTokens({ userToken, appToken });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function wizardSync(): Promise<WizardActionResult> {
  if (!(await getAuthenticatedUserId())) return { ok: false, message: "Not signed in." };
  const tokens = getAkahuTokens();
  if (!tokens) return { ok: false, message: "Akahu tokens are not configured yet." };
  const result = await syncFinanceData(tokens);
  revalidatePath("/", "layout");
  revalidatePath("/activity");
  if (result.status !== "success") return { ok: false, message: result.message };
  return { ok: true };
}

export async function finishOnboarding(): Promise<WizardActionResult> {
  if (!(await getAuthenticatedUserId())) return { ok: false, message: "Not signed in." };
  const otherExists = Boolean(db.prepare("SELECT 1 FROM categories WHERE name = 'Other'").get());
  if (!otherExists) {
    const now = new Date().toISOString();
    const maxOrder = (db.prepare("SELECT COALESCE(MAX(sort_order), 0) m FROM categories").get() as { m: number }).m;
    db.prepare("INSERT INTO categories (id, name, section, color, sort_order, created_at, updated_at) VALUES ('other', 'Other', 'PERSONAL', '#9a9a93', ?, ?, ?)").run(maxOrder + 1, now, now);
  }
  db.prepare(`
    INSERT INTO finance_settings (key, value, updated_at) VALUES ('onboarding_complete', '1', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(new Date().toISOString());
  // Re-categorise the synced backlog using the user's newly built categories so the
  // dashboard isn't a wall of "Uncategorised" right after onboarding.
  await classifyUnreviewedWithLlm();
  revalidatePath("/", "layout");
  revalidatePath("/welcome");
  return { ok: true };
}

export async function wizardSaveLlmSettings(formData: FormData): Promise<WizardActionResult> {
  if (!(await getAuthenticatedUserId())) return { ok: false, message: "Not signed in." };
  if (getVaultConfigurationError()) return { ok: false, message: "Encryption key not configured." };
  const enabled = formData.get("enabled") === "1";
  const provider = (["openai", "anthropic", "custom", "surplus"].includes(String(formData.get("provider")))
    ? String(formData.get("provider"))
    : "openai") as LlmProvider;
  const model = String(formData.get("model") ?? "").trim();
  const baseUrl = String(formData.get("baseUrl") ?? "").trim() || null;
  const rawKey = String(formData.get("apiKey") ?? "").trim();
  persistLlmSettings({ enabled, provider, model, baseUrl, apiKey: rawKey === "" ? null : rawKey });
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true };
}
