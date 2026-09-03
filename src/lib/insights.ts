import "server-only";

import { db, dbUnavailable } from "@/lib/db";
import { mapTransactionToSlug, normalizeVendor } from "@/lib/finance";
import { SUGGESTED_CATEGORIES } from "@/lib/suggestions";

export type DetectedCategory = {
  slug: string;
  name: string;
  count: number;
  spend: number;
};

export type IncomeCandidate = {
  merchant: string;
  medianAmount: number;
  cadence: "weekly" | "fortnightly" | "monthly";
  monthlyEquivalent: number;
  occurrences: number;
  lastDate: string;
};

type TxnRow = {
  date: string;
  description: string;
  amount: number;
  type: string;
  merchant: string | null;
  normalized_merchant: string;
  akahu_category: string | null;
  akahu_category_group: string | null;
};

const MONTHS_MS = 30 * 24 * 60 * 60 * 1000;
const CADENCE_WINDOWS: Record<IncomeCandidate["cadence"], [number, number]> = {
  weekly: [6, 8],
  fortnightly: [13, 15],
  monthly: [28, 32],
};

function cadenceMonthly(cadence: IncomeCandidate["cadence"], amount: number) {
  switch (cadence) {
    case "weekly":
      return amount * 52 / 12;
    case "fortnightly":
      return amount * 26 / 12;
    case "monthly":
      return amount;
  }
}

/**
 * Scan the last 12 months of transactions and aggregate count + spend per
 * suggested-category slug. Used by the onboarding "detected categories" step.
 */
export function detectCategoryUsage(): DetectedCategory[] {
  if (dbUnavailable) return [];
  const start = new Date(Date.now() - 365 * MONTHS_MS).toISOString();
  const rows = db
    .prepare(`
      SELECT date, description, amount, type, merchant, normalized_merchant,
        akahu_category, akahu_category_group
      FROM cached_transactions
      WHERE is_hidden = 0 AND date >= ?
    `)
    .all(start) as TxnRow[];

  const travelWindows = db
    .prepare("SELECT starts_on, ends_on FROM travel_windows")
    .all() as Array<{ starts_on: string; ends_on: string }>;

  const counts = new Map<string, number>();
  const spend = new Map<string, number>();
  for (const row of rows) {
    const slug = mapTransactionToSlug(
      {
        type: row.type,
        amount: row.amount,
        description: row.description,
        merchant: row.merchant,
        category: row.akahu_category,
        categoryGroup: row.akahu_category_group,
        date: row.date,
      },
      travelWindows,
    );
    if (!slug) continue;
    const abs = Math.abs(row.amount);
    if (abs <= 0) continue;
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
    spend.set(slug, (spend.get(slug) ?? 0) + abs);
  }

  return SUGGESTED_CATEGORIES.map((category) => ({
    slug: category.id,
    name: category.name,
    count: counts.get(category.id) ?? 0,
    spend: Math.round((spend.get(category.id) ?? 0) * 100) / 100,
  })).sort((a, b) => b.spend - a.spend || b.count - a.count);
}

/**
 * Detect a recurring income deposit: group positive transactions by normalized
 * merchant, look for a series with >=3 occurrences at a regular cadence
 * (weekly/fortnightly/monthly) and a stable amount. Returns the best candidate
 * or null.
 */
export function detectIncome(): IncomeCandidate | null {
  if (dbUnavailable) return null;
  const start = new Date(Date.now() - 12 * MONTHS_MS).toISOString();
  const rows = db
    .prepare(`
      SELECT date, description, amount, type, merchant, normalized_merchant,
        akahu_category, akahu_category_group
      FROM cached_transactions
      WHERE is_hidden = 0 AND amount > 0 AND date >= ?
      ORDER BY date ASC
    `)
    .all(start) as TxnRow[];

  const groups = new Map<string, TxnRow[]>();
  for (const row of rows) {
    if (row.type === "TRANSFER") continue;
    const key = row.normalized_merchant || normalizeVendor(row.description);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  let best: IncomeCandidate | null = null;
  for (const [merchant, list] of groups) {
    if (list.length < 3) continue;

    const amounts = list.map((r) => Math.abs(r.amount)).sort((a, b) => a - b);
    const medianAmount = amounts[Math.floor(amounts.length / 2)];
    if (medianAmount <= 0) continue;

    // Amount stability: coefficient of variation below 0.25.
    const mean = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
    const variance = amounts.reduce((sum, a) => sum + (a - mean) ** 2, 0) / amounts.length;
    const cv = Math.sqrt(variance) / mean;
    if (cv > 0.25) continue;

    // Cadence: median day gap between consecutive occurrences.
    const gaps: number[] = [];
    for (let i = 1; i < list.length; i += 1) {
      const gap =
        (new Date(list[i].date).getTime() - new Date(list[i - 1].date).getTime()) /
        (24 * 60 * 60 * 1000);
      if (gap > 0) gaps.push(gap);
    }
    if (gaps.length < 2) continue;
    const sortedGaps = [...gaps].sort((a, b) => a - b);
    const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)];

    let cadence: IncomeCandidate["cadence"] | null = null;
    for (const [key, [lo, hi]] of Object.entries(CADENCE_WINDOWS) as Array<[IncomeCandidate["cadence"], [number, number]]>) {
      if (medianGap >= lo && medianGap <= hi) {
        cadence = key;
        break;
      }
    }
    if (!cadence) continue;

    const candidate: IncomeCandidate = {
      merchant,
      medianAmount: Math.round(medianAmount * 100) / 100,
      cadence,
      monthlyEquivalent: Math.round(cadenceMonthly(cadence, medianAmount) * 100) / 100,
      occurrences: list.length,
      lastDate: list[list.length - 1].date,
    };

    if (!best || candidate.occurrences > best.occurrences) best = candidate;
  }

  return best;
}

export type SpendingProfile = {
  avgWeeklySpend: number;
  income: IncomeCandidate | null;
  salaryMonthly: number;
  spendVsIncomePct: number | null;
  topCategories: Array<{ name: string; color: string; spend: number; share: number }>;
  topMerchants: Array<{ name: string; count: number; spend: number }>;
  busiestWeekday: string | null;
  summary: string;
};

function weekdayName(dateIso: string) {
  return new Intl.DateTimeFormat("en-NZ", { weekday: "long", timeZone: "Pacific/Auckland" })
    .format(new Date(dateIso));
}

/**
 * Compact "your money at a glance" summary over the last 90 days, used by the
 * dashboard insight card.
 */
export function getSpendingProfile(): SpendingProfile {
  if (dbUnavailable) {
    return {
      avgWeeklySpend: 0,
      income: null,
      salaryMonthly: 0,
      spendVsIncomePct: null,
      topCategories: [],
      topMerchants: [],
      busiestWeekday: null,
      summary: "",
    };
  }

  const start90 = new Date(Date.now() - 90 * MONTHS_MS).toISOString();
  const travelWindows = db
    .prepare("SELECT starts_on, ends_on FROM travel_windows")
    .all() as Array<{ starts_on: string; ends_on: string }>;

  const rows = db
    .prepare(`
      SELECT date, description, amount, type, merchant, normalized_merchant,
        akahu_category, akahu_category_group
      FROM cached_transactions
      WHERE is_hidden = 0 AND date >= ?
    `)
    .all(start90) as TxnRow[];

  const days = Math.max((Date.now() - new Date(start90).getTime()) / (24 * 60 * 60 * 1000), 1);
  let spending = 0;
  let inflow = 0;
  const merchantAgg = new Map<string, { count: number; spend: number; name: string }>();
  const categorySpend = new Map<string, { spend: number; name: string; color: string }>();
  const weekdayCount = new Map<string, number>();

  for (const row of rows) {
    const abs = Math.abs(row.amount);
    if (abs <= 0) continue;
    if (row.amount < 0 || row.type === "PAYMENT" || row.type === "STANDING ORDER") {
      if (row.type === "PAYMENT" || row.type === "STANDING ORDER") continue;
      spending += abs;
      const slug = mapTransactionToSlug(
        { type: row.type, amount: row.amount, description: row.description, merchant: row.merchant, category: row.akahu_category, categoryGroup: row.akahu_category_group, date: row.date },
        travelWindows,
      );
      const cat = slug ? SUGGESTED_CATEGORIES.find((c) => c.id === slug) : undefined;
      if (cat) {
        const cur = categorySpend.get(cat.id) ?? { spend: 0, name: cat.name, color: cat.color };
        cur.spend += abs;
        categorySpend.set(cat.id, cur);
      }
      const name = row.merchant ?? row.description;
      const norm = normalizeVendor(name);
      if (norm.length >= 3) {
        const cur = merchantAgg.get(norm) ?? { count: 0, spend: 0, name };
        cur.count += 1;
        cur.spend += abs;
        merchantAgg.set(norm, cur);
      }
      const wd = weekdayName(row.date);
      weekdayCount.set(wd, (weekdayCount.get(wd) ?? 0) + 1);
    } else {
      inflow += abs;
    }
  }

  const avgWeeklySpend = Math.round((spending / days) * 7 * 100) / 100;
  const income = detectIncome();
  const salaryMonthly =
    Number((db.prepare("SELECT value FROM finance_settings WHERE key = ?").get("salary_monthly") as { value?: string } | undefined)?.value ?? 0) || 0;

  const topCategories = [...categorySpend.entries()]
    .map(([, v]) => v)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 3)
    .map((v) => ({ ...v, spend: Math.round(v.spend * 100) / 100, share: spending > 0 ? Math.round((v.spend / spending) * 100) : 0 }));

  const topMerchants = [...merchantAgg.entries()]
    .map(([, v]) => v)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 3)
    .map((v) => ({ ...v, spend: Math.round(v.spend * 100) / 100 }));

  const busiestWeekday =
    [...weekdayCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const monthlySpend = Math.round((spending / days) * 30);
  const incomeMonthly = income?.monthlyEquivalent ?? salaryMonthly;
  const spendVsIncomePct =
    incomeMonthly > 0 ? Math.round((monthlySpend / incomeMonthly) * 100) : null;

  let summary: string;
  if (topCategories.length === 0) {
    summary = "Sync your transactions to see a snapshot of your spending.";
  } else {
    const topCat = topCategories[0];
    summary = `Your biggest spending area is ${topCat.name} (${topCat.share}% of the last 90 days).`;
    if (topMerchants[0]) summary += ` Most spending happens at ${topMerchants[0].name}.`;
    if (busiestWeekday) summary += ` ${busiestWeekday} is your busiest spending day.`;
  }

  return {
    avgWeeklySpend,
    income,
    salaryMonthly,
    spendVsIncomePct,
    topCategories,
    topMerchants,
    busiestWeekday,
    summary,
  };
}