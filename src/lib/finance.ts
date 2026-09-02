import "server-only";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import type { AkahuTransaction } from "@/lib/akahu";

type VendorRuleSeed = { vendor: string; category: string };

function loadPrivateVendorRules(): VendorRuleSeed[] {
  const file = path.join(process.cwd(), "src", "data", "vendor-rules.json");
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, "utf8")) as VendorRuleSeed[];
  } catch {
    return [];
  }
}

const vendorRules = loadPrivateVendorRules();

export type FinanceCategory = {
  id: string;
  name: string;
  section: "PERSONAL" | "SEPARATE";
  color: string;
  sortOrder: number;
};

export const categories: FinanceCategory[] = [
  { id: "groceries", name: "Groceries", section: "PERSONAL", color: "#78c091", sortOrder: 1 },
  { id: "eating-out", name: "Eating out", section: "PERSONAL", color: "#f28c52", sortOrder: 2 },
  { id: "alcohol", name: "Alcohol", section: "PERSONAL", color: "#ad7cc4", sortOrder: 3 },
  { id: "entertainment", name: "Entertainment", section: "PERSONAL", color: "#e86862", sortOrder: 4 },
  { id: "transport", name: "Transport", section: "PERSONAL", color: "#e7aa18", sortOrder: 5 },
  { id: "travel", name: "Travel", section: "PERSONAL", color: "#4f8de7", sortOrder: 6 },
  { id: "shopping", name: "Shopping", section: "PERSONAL", color: "#dc82ac", sortOrder: 7 },
  { id: "subscriptions-software", name: "Subscriptions & software", section: "PERSONAL", color: "#34b38a", sortOrder: 8 },
  { id: "bills", name: "Bills", section: "PERSONAL", color: "#e9637f", sortOrder: 9 },
  { id: "health", name: "Health", section: "PERSONAL", color: "#8a6fa8", sortOrder: 10 },
  { id: "cash", name: "Cash", section: "PERSONAL", color: "#6757bf", sortOrder: 11 },
  { id: "other", name: "Other", section: "PERSONAL", color: "#9a9a93", sortOrder: 12 },
  { id: "investments", name: "Investments", section: "SEPARATE", color: "#46966f", sortOrder: 13 },
  { id: "housing", name: "Housing", section: "SEPARATE", color: "#f1b323", sortOrder: 14 },
  { id: "business", name: "Business", section: "SEPARATE", color: "#a66bb0", sortOrder: 15 },
  { id: "income", name: "Income", section: "SEPARATE", color: "#2f8f5b", sortOrder: 16 },
  { id: "transfers-other", name: "Transfers & other", section: "SEPARATE", color: "#536b8f", sortOrder: 17 },
];

// Budgets start at 0 for every personal category so the budget editor lists them
// for the user to set their own targets. No pre-set amounts are assumed.
const budgetDefaults: Record<string, number> = Object.fromEntries(
  categories
    .filter((category) => category.section === "PERSONAL")
    .map((category) => [category.id, 0]),
);

// No goal defaults — users define their own savings goals.
const goalDefaults: Array<{
  id: string;
  name: string;
  target: number;
  contribution: number;
  color: string;
  order: number;
}> = [];

const settingDefaults: Record<string, string> = {
  debt_baseline: "0",
  debt_monthly_target: "0",
  debt_weekly_target: "0",
  debt_apr_estimate: "0",
  salary_monthly: "0",
  weekly_discretionary: "0",
  goal_auto_track: "0",
  reporting_timezone: "Pacific/Auckland",
};

// No travel windows by default — users define their own.
const travelWindowDefaults: Array<{ name: string; start: string; end: string }> = [];

export function normalizeVendor(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\\/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b\d{2} \d{2}(?: \d{2,4})?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let financeSeeded = false;

export function seedFinanceData() {
  if (financeSeeded) return;
  financeSeeded = true;
  const now = new Date().toISOString();
  const seed = db.transaction(() => {
    const categoryStatement = db.prepare(`
      INSERT OR IGNORE INTO categories
        (id, name, section, color, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const category of categories) {
      categoryStatement.run(
        category.id,
        category.name,
        category.section,
        category.color,
        category.sortOrder,
        now,
        now,
      );
    }

    const ruleStatement = db.prepare(`
      INSERT OR IGNORE INTO vendor_rules
        (vendor, normalized_vendor, category_id, source, confidence, created_at, updated_at)
      VALUES (?, ?, ?, 'DOCUMENT', 0.95, ?, ?)
    `);
    for (const rule of vendorRules) {
      const normalized = normalizeVendor(rule.vendor);
      if (normalized.length >= 3) {
        ruleStatement.run(rule.vendor, normalized, rule.category, now, now);
      }
    }

    const budgetStatement = db.prepare(`
      INSERT OR IGNORE INTO budgets (category_id, monthly_limit, updated_at)
      VALUES (?, ?, ?)
    `);
    for (const [categoryId, limit] of Object.entries(budgetDefaults)) {
      budgetStatement.run(categoryId, limit, now);
    }

    const goalStatement = db.prepare(`
      INSERT OR IGNORE INTO goals
        (id, name, target_amount, current_amount, monthly_contribution, color, sort_order, updated_at)
      VALUES (?, ?, ?, 0, ?, ?, ?, ?)
    `);
    for (const goal of goalDefaults) {
      goalStatement.run(
        goal.id,
        goal.name,
        goal.target,
        goal.contribution,
        goal.color,
        goal.order,
        now,
      );
    }

    const settingStatement = db.prepare(`
      INSERT OR IGNORE INTO finance_settings (key, value, updated_at)
      VALUES (?, ?, ?)
    `);
    for (const [key, value] of Object.entries(settingDefaults)) {
      settingStatement.run(key, value, now);
    }

    const windowStatement = db.prepare(`
      INSERT INTO travel_windows (name, starts_on, ends_on, created_at)
      SELECT ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM travel_windows WHERE name = ? AND starts_on = ? AND ends_on = ?
      )
    `);
    for (const window of travelWindowDefaults) {
      windowStatement.run(
        window.name,
        window.start,
        window.end,
        now,
        window.name,
        window.start,
        window.end,
      );
    }
  });
  seed();
}

type RuleRow = {
  normalized_vendor: string;
  category_id: string;
  confidence: number;
};

type TravelWindowRow = { starts_on: string; ends_on: string };

export type CategoryDecision = {
  categoryId: string;
  source: "VENDOR" | "SPECIAL_RULE" | "AKAHU" | "UNCATEGORISED";
  confidence: number;
  reviewed: boolean;
};

const akahuCategoryMappings: Array<[RegExp, string]> = [
  [/bakery|meat|confectionary|ice cream|specialty food|grocer|supermarket|convenience|butcher/i, "groceries"],
  [/restaurant|cafe|takeaway|fast food|food delivery|coffee/i, "eating-out"],
  [/alcohol|liquor|bottle shop|wine/i, "alcohol"],
  [/gambling|casino|lottery|betting|bar|pub|nightclub|cinema|movie|concert|event|entertainment/i, "entertainment"],
  [/electricity|utility|water|sanitation|waste|telecommunication|internet|insurance|gas|postal|government|council|rates|tax payments/i, "bills"],
  [/2degrees|spark|vodafone|skinny|slingshot|now nz|one nz|telecom/i, "bills"],
  [/watercare|water and care|wastewater|stormwater|rates/i, "bills"],
  [/broker|managed funds|securities|exchange|investment|saving/i, "investments"],
  [/fuel|gas station|parking|taxi|rideshare|transport|vehicle|auto|car rental|bus|train|toll|ferry/i, "transport"],
  [/airline|airport|accommodation|hotel|lodging|travel/i, "travel"],
  [/medical|dental|pharmacy|fitness|gym|personal care|hospital|optical|health/i, "health"],
  [/les mills|cityfitness|snap fitness|anytime fitness|invictus|f45|bodybuilding|gym/i, "health"],
  [/subscription|software|digital service|streaming|cloud/i, "subscriptions-software"],
  [/cash|atm/i, "cash"],
  [/housing|mortgage|property|real estate/i, "housing"],
  [/architect|engineering|surveying|consulting|legal|accounting/i, "business"],
  [/shopping|retail|clothing|apparel|electronics|homeware|household|furnish|hardware|building supplies|supplies|variety|shoe|footwear|department|gift|toy|book|stationery|office supplies|duty free|photography|repair|courier|sports equipment/i, "shopping"],
  [/welfare|charity|smoking|cigarette|vape/i, "other"],
  [/transfer|loan repayment|fee/i, "transfers-other"],
];

// Merchant-name hints shipped with the app (NZ-focused, matches Akahu's market).
// Users can add their own via the review queue's "Remember merchant", which writes
// exact vendor rules; these hints provide high-signal name matches on top.
type MerchantHint = { pattern: string; category: string };
const descriptionCategoryMappings: Array<[RegExp, string]> = (() => {
  try {
    const hints = JSON.parse(
      readFileSync(path.join(process.cwd(), "src", "data", "merchant-hints.json"), "utf8"),
    ) as MerchantHint[];
    return hints.map((hint) => [new RegExp(hint.pattern, "i"), hint.category]);
  } catch {
    return [];
  }
})();

export function buildCategorizer() {
  const rules = db
    .prepare(
      "SELECT normalized_vendor, category_id, confidence FROM vendor_rules ORDER BY LENGTH(normalized_vendor) DESC",
    )
    .all() as RuleRow[];
  const travelWindows = db
    .prepare("SELECT starts_on, ends_on FROM travel_windows")
    .all() as TravelWindowRow[];

  return (transaction: AkahuTransaction): CategoryDecision => {
    if (transaction.type === "ATM") {
      return { categoryId: "cash", source: "SPECIAL_RULE", confidence: 1, reviewed: true };
    }

    if (["TRANSFER", "CREDIT CARD", "LOAN"].includes(transaction.type)) {
      return {
        categoryId: "transfers-other",
        source: "SPECIAL_RULE",
        confidence: 0.9,
        reviewed: true,
      };
    }

    const lowerDescription = transaction.description.toLowerCase();
    if (/^(to|frm) \d/.test(lowerDescription)) {
      return {
        categoryId: "transfers-other",
        source: "SPECIAL_RULE",
        confidence: 0.95,
        reviewed: true,
      };
    }

    const normalized = normalizeVendor(
      transaction.merchant ?? transaction.description,
    );
    const vendorRule = rules.find(
      (rule) =>
        normalized === rule.normalized_vendor ||
        (rule.normalized_vendor.length >= 6 &&
          normalized.includes(rule.normalized_vendor)),
    );
    if (vendorRule) {
      return {
        categoryId: vendorRule.category_id,
        source: "VENDOR",
        confidence: vendorRule.confidence,
        reviewed: vendorRule.confidence >= 0.9,
      };
    }

    if (transaction.type === "DIRECT CREDIT" && transaction.amount > 0) {
      return {
        categoryId: "income",
        source: "SPECIAL_RULE",
        confidence: 0.95,
        reviewed: true,
      };
    }

    // High-confidence vendor-name matches against the description/merchant text.
    // These cover NZ merchants where the Akahu category is generic/missing but
    // the raw statement clearly names the vendor.
    const merchantText = `${transaction.merchant ?? ""} ${transaction.description}`.toLowerCase();
    for (const [pattern, categoryId] of descriptionCategoryMappings) {
      if (pattern.test(merchantText)) {
        return { categoryId, source: "AKAHU", confidence: 0.85, reviewed: false };
      }
    }

    const date = transaction.date.slice(0, 10);
    const inTravelWindow = travelWindows.some(
      (window) => date >= window.starts_on && date <= window.ends_on,
    );
    if (inTravelWindow && transaction.categoryGroup === "Travel") {
      return { categoryId: "travel", source: "SPECIAL_RULE", confidence: 0.9, reviewed: true };
    }

    const upstream = `${transaction.category ?? ""} ${transaction.categoryGroup ?? ""}`;
    for (const [pattern, categoryId] of akahuCategoryMappings) {
      if (pattern.test(upstream)) {
        return { categoryId, source: "AKAHU", confidence: 0.7, reviewed: false };
      }
    }

    return {
      categoryId: "other",
      source: "UNCATEGORISED",
      confidence: 0.25,
      reviewed: false,
    };
  };
}

const BACKLOG_CLASSIFIED_FLAG = "backlog_classified";

export function backlogClassified(): boolean {
  const row = db
    .prepare("SELECT value FROM finance_settings WHERE key = ?")
    .get(BACKLOG_CLASSIFIED_FLAG) as { value: string } | undefined;
  return row?.value === "1";
}

function promotionCategory(transaction: AkahuTransaction): string | null {
  if (transaction.type === "ATM") return "cash";
  if (["TRANSFER", "CREDIT CARD", "LOAN"].includes(transaction.type)) return "transfers-other";
  const merchantText = `${transaction.merchant ?? ""} ${transaction.description}`.toLowerCase();
  for (const [pattern, categoryId] of descriptionCategoryMappings) {
    if (pattern.test(merchantText)) return categoryId;
  }
  const upstream = `${transaction.category ?? ""} ${transaction.categoryGroup ?? ""}`;
  for (const [pattern, categoryId] of akahuCategoryMappings) {
    if (pattern.test(upstream)) return categoryId;
  }
  return null;
}

export function classifyUnreviewed(limit = 500): { total: number; resolved: number; deferred: number } {
  seedFinanceData();

  const now = new Date().toISOString();
  const categorizer = buildCategorizer();
  const run = db
    .prepare("INSERT INTO classification_runs (mode, started_at, status) VALUES (?, ?, 'RUNNING')")
    .run("LOCAL", now);
  const runId = Number(run.lastInsertRowid);

  const unreviewed = db
    .prepare(`
      SELECT id, date, description, amount, type, merchant,
        akahu_category AS category, akahu_category_group AS categoryGroup,
        normalized_merchant
      FROM cached_transactions WHERE reviewed = 0 AND is_hidden = 0 LIMIT ${limit}
    `)
    .all() as Array<{
    id: string;
    date: string;
    description: string;
    amount: number;
    type: string;
    merchant: string | null;
    category: string | null;
    categoryGroup: string | null;
    normalized_merchant: string;
  }>;

  const occurrenceCounts = new Map<string, number>(
    (
      db
        .prepare("SELECT normalized_merchant, COUNT(*) c FROM cached_transactions WHERE normalized_merchant <> '' AND is_hidden = 0 GROUP BY normalized_merchant")
        .all() as Array<{ normalized_merchant: string; c: number }>
    ).map((row) => [row.normalized_merchant, row.c]),
  );

  let resolved = 0;
  const save = db.transaction(() => {
    const upsertRule = db.prepare(`
      INSERT INTO vendor_rules
        (vendor, normalized_vendor, category_id, source, confidence, created_at, updated_at)
      VALUES (?, ?, ?, 'ASSISTED', 0.95, ?, ?)
      ON CONFLICT(normalized_vendor) DO UPDATE SET
        category_id = excluded.category_id,
        source = 'ASSISTED', confidence = 0.95, updated_at = excluded.updated_at
    `);
    const decision = db.prepare(`
      INSERT INTO classification_decisions
        (run_id, transaction_id, category_id, resolved, source, confidence, reasoning, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const setResolved = db.prepare(`
      UPDATE cached_transactions SET category_id = ?, category_source = ?, confidence = ?, reviewed = 1
      WHERE id = ?
    `);

    for (const transaction of unreviewed) {
      const description = transaction.description.toLowerCase();
      let categoryId: string | null = null;
      let source = "ASSISTED" as "ASSISTED" | "VENDOR" | "SPECIAL_RULE";
      let confidence = 0.95;
      let reasoning = "";

      if (description.startsWith("loan repayment")) {
        categoryId = "housing";
        confidence = 1;
        reasoning = "Recurring loan repayment described as such";
      } else if (
        transaction.amount > 0 &&
        ["PAYMENT", "STANDING ORDER"].includes(transaction.type) &&
        (occurrenceCounts.get(transaction.normalized_merchant) ?? 0) >= 2
      ) {
        categoryId = "income";
        reasoning = "Recurring household inflow (board, rent, or contributions)";
      } else {
        const decision = categorizer(transaction as unknown as AkahuTransaction);
        if (decision.source !== "UNCATEGORISED" && decision.source !== "AKAHU") {
          categoryId = decision.categoryId;
          confidence = decision.confidence;
          source = decision.source;
          reasoning = "Existing vendor or special rule";
        } else if (decision.source === "AKAHU") {
          categoryId = decision.categoryId;
          reasoning = "Promoted Akahu suggestion to a confirmed vendor rule";
        } else {
          const promoted = promotionCategory(transaction as unknown as AkahuTransaction);
          if (promoted) {
            categoryId = promoted;
            reasoning = "Akahu category promoted to confirmed vendor rule";
          }
        }
      }

      if (!categoryId) {
        decision.run(runId, transaction.id, null, 0, "ASSISTED", 0, "Deferred to manual review", now);
        continue;
      }

      if (
        transaction.normalized_merchant &&
        transaction.normalized_merchant.length >= 3
      ) {
        upsertRule.run(
          transaction.merchant ?? transaction.description,
          transaction.normalized_merchant,
          categoryId,
          now,
          now,
        );
      }
      setResolved.run(categoryId, source, confidence, transaction.id);
      decision.run(runId, transaction.id, categoryId, 1, source, confidence, reasoning, now);
      resolved += 1;
    }
  });
  save();

  db.prepare(`
    UPDATE classification_runs SET completed_at = ?, status = 'SUCCESS',
      items_total = ?, items_resolved = ?, items_deferred = ?
    WHERE id = ?
  `).run(now, unreviewed.length, resolved, unreviewed.length - resolved, runId);

  return { total: unreviewed.length, resolved, deferred: unreviewed.length - resolved };
}

export function classifyBacklog(): { total: number; resolved: number; deferred: number } {
  return classifyUnreviewed();
}

/**
 * Rule-based pass followed by an optional AI pass over the rows the rules could
 * not confidently categorise. AI suggestions are written with `reviewed = 0` and
 * source `LLM` so the user confirms them in the review queue (nothing is auto-
 * committed silently). Returns combined totals.
 */
export async function classifyUnreviewedWithLlm(
  limit = 500,
): Promise<{ total: number; resolved: number; deferred: number; llm: number }> {
  const rulesResult = classifyUnreviewed(limit);

  const settings = (await import("@/lib/llm")).getLlmSettings();
  if (!settings.enabled) {
    return { ...rulesResult, llm: 0 };
  }

  const categoryNames = (db
    .prepare("SELECT name FROM categories WHERE archived = 0 ORDER BY sort_order")
    .all() as Array<{ name: string }>).map((row) => row.name);

  const remaining = db
    .prepare(`
      SELECT id, date, description, merchant, amount, type
      FROM cached_transactions
      WHERE reviewed = 0 AND is_hidden = 0 AND category_source = 'UNCATEGORISED'
      LIMIT ${limit}
    `)
    .all() as Array<{
    id: string;
    date: string;
    description: string;
    merchant: string | null;
    amount: number;
    type: string;
  }>;

  if (remaining.length === 0) return { ...rulesResult, llm: 0 };

  const { categorizeWithLlm } = await import("@/lib/llm");
  let llm = 0;
  try {
    const results = await categorizeWithLlm(remaining, categoryNames);
    const now = new Date().toISOString();
    const run = db
      .prepare("INSERT INTO classification_runs (mode, started_at, status) VALUES (?, ?, 'RUNNING')")
      .run("LLM", now);
    const runId = Number(run.lastInsertRowid);

    const setSuggestion = db.prepare(`
      UPDATE cached_transactions SET category_id = ?, category_source = 'LLM',
        confidence = ?, reviewed = 0
      WHERE id = ? AND reviewed = 0
    `);
    const decision = db.prepare(`
      INSERT INTO classification_decisions
        (run_id, transaction_id, category_id, resolved, source, confidence, reasoning, created_at)
      VALUES (?, ?, ?, 0, 'LLM', ?, ?, ?)
    `);
    db.transaction(() => {
      for (const result of results) {
        if (result.confidence < 0.5) continue;
        setSuggestion.run(result.categoryId, result.confidence, result.id);
        decision.run(runId, result.id, result.categoryId, result.confidence, result.reasoning, now);
        llm += 1;
      }
    })();
    db.prepare(`
      UPDATE classification_runs SET completed_at = ?, status = 'SUCCESS',
        items_total = ?, items_resolved = ?, items_deferred = ?
      WHERE id = ?
    `).run(now, remaining.length, 0, remaining.length, runId);
  } catch {
    // LLM failures are non-fatal; the rules result stands.
  }

  return { ...rulesResult, llm };
}

type GoalReferenceMatch = { goalId: string; confidence: number } | null;

export function resolveGoalReference(description: string): GoalReferenceMatch {
  const normalized = description.toLowerCase();
  // Derive word-boundary patterns from the user's own goal names so the matcher
  // stays in sync with whatever goals they define (e.g. "Emergency fund" matches
  // "emergency", "Holiday" matches "holiday").
  const goals = db
    .prepare("SELECT id, name FROM goals")
    .all() as Array<{ id: string; name: string }>;
  const patterns: Array<[RegExp, string]> = goals
    .map((goal) => {
      const tokens = goal.name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .trim()
        .split(/\s+/)
        .filter((token) => token.length >= 3);
      if (tokens.length === 0) return null;
      return [new RegExp(`\\b${tokens.join("|")}\\b`), goal.id] as [RegExp, string];
    })
    .filter((pattern): pattern is [RegExp, string] => pattern !== null);
  const matches = patterns
    .filter(([pattern]) => pattern.test(normalized))
    .map(([, goalId]) => goalId);
  if (matches.length !== 1) return null;
  return { goalId: matches[0], confidence: 0.85 };
}

export function processGoalContributions(): { matched: number; ignored: number } {
  const goals = db
    .prepare("SELECT id FROM goals")
    .all() as Array<{ id: string }>;
  const goalIds = new Set(goals.map((goal) => goal.id));
  if (goalIds.size === 0) return { matched: 0, ignored: 0 };
  const now = new Date().toISOString();

  const setting = db
    .prepare("SELECT value FROM finance_settings WHERE key = ?")
    .get("goal_auto_track") as { value: string } | undefined;
  const autoTrack = setting?.value === "1";

  let matched = 0;
  if (autoTrack) {
    const candidates = db
      .prepare(`
        SELECT t.id, t.description, t.amount
        FROM cached_transactions t
        LEFT JOIN goal_contributions g ON g.transaction_id = t.id
        WHERE g.transaction_id IS NULL
          AND t.amount > 0
          AND t.is_hidden = 0
          AND t.account_id IN (SELECT id FROM cached_accounts WHERE type = 'CREDITCARD')
      `)
      .all() as Array<{ id: string; description: string; amount: number }>;

    const save = db.transaction(() => {
      const upsert = db.prepare(`
        INSERT INTO goal_contributions
          (transaction_id, goal_id, amount, matched_on, confidence, created_at, updated_at)
        VALUES (?, ?, ?, 'RULE', ?, ?, ?)
        ON CONFLICT(transaction_id) DO UPDATE SET
          goal_id = excluded.goal_id, amount = excluded.amount,
          matched_on = 'RULE', confidence = excluded.confidence,
          updated_at = excluded.updated_at
      `);
      for (const candidate of candidates) {
        const match = resolveGoalReference(candidate.description);
        if (!match) continue;
        upsert.run(
          candidate.id,
          match.goalId,
          candidate.amount,
          match.confidence,
          now,
          now,
        );
        matched += 1;
      }
    });
    save();
  }

  // Always reconcile goal current_amount to the sum of recorded contributions.
  // This makes the figure derived rather than a blind running total, so phantom
  // balances cannot accumulate and manual edits on the settings page win.
  db.transaction(() => {
    const recompute = db.prepare(`
      UPDATE goals SET current_amount = COALESCE((
        SELECT SUM(g.amount) FROM goal_contributions g WHERE g.goal_id = goals.id
      ), 0), updated_at = ? WHERE id = ?
    `);
    for (const goal of goals) {
      recompute.run(now, goal.id);
    }
  })();

  return { matched, ignored: 0 };
}
