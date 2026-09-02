import "server-only";

import { db, dbUnavailable } from "@/lib/db";
import { seedFinanceData } from "@/lib/finance";

export type CategorySpend = {
  id: string;
  name: string;
  color: string;
  amount: number;
  budget: number | null;
  budgetSpent: number;
};

export type CategoryTopSpend = {
  id: string;
  date: string;
  label: string;
  accountName: string;
  amount: number;
};

export type Goal = {
  id: string;
  name: string;
  target: number;
  current: number;
  contribution: number;
  color: string;
};

export type AccountCard = {
  id: string;
  displayName: string;
  formattedAccount: string | null;
  type: string;
  institution: string;
  currentBalance: number | null;
  currency: string | null;
};

export type CachedTransaction = {
  id: string;
  accountId: string;
  accountName: string;
  date: string;
  description: string;
  amount: number;
  type: string;
  merchant: string | null;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  source: string;
  confidence: number;
  reviewed: boolean;
};

type SettingRow = { key: string; value: string };

function getReportingTimeZone(): string {
  if (dbUnavailable) return "Pacific/Auckland";
  const row = db
    .prepare("SELECT value FROM finance_settings WHERE key = ?")
    .get("reporting_timezone") as { value?: string } | undefined;
  return row?.value || "Pacific/Auckland";
}

const reportingTimeZone = getReportingTimeZone();

function zonedMidnight(year: number, month: number) {
  const guess = new Date(Date.UTC(year, month, 1));
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-NZ", {
      timeZone: reportingTimeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(guess)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const localGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return new Date(guess.getTime() - (localGuess - guess.getTime()));
}

function monthRange(offset = 0) {
  const localParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-NZ", {
      timeZone: reportingTimeZone,
      year: "numeric",
      month: "numeric",
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const month = new Date(Date.UTC(localParts.year, localParts.month - 1 + offset, 1));
  const year = month.getUTCFullYear();
  const monthIndex = month.getUTCMonth();
  return {
    start: zonedMidnight(year, monthIndex).toISOString(),
    end: zonedMidnight(year, monthIndex + 1).toISOString(),
    month: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
  };
}

function weekRange() {
  const nowParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-NZ", {
      timeZone: reportingTimeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "long",
    })
      .formatToParts(new Date())
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  );
  const weekdayOffset: Record<string, number> = {
    Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3,
    Friday: 4, Saturday: 5, Sunday: 6,
  };
  const daysFromMonday = weekdayOffset[nowParts.weekday] ?? 0;
  const y = Number(nowParts.year);
  const m = Number(nowParts.month) - 1; // 0-based
  const d = Number(nowParts.day);
  const mondayUTC = new Date(Date.UTC(y, m, d - daysFromMonday));
  const nextMondayUTC = new Date(Date.UTC(y, m, d - daysFromMonday + 7));
  function zonedDayStart(dt: Date) {
    const guess = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-NZ", {
        timeZone: reportingTimeZone,
        year: "numeric", month: "numeric", day: "numeric",
        hour: "numeric", minute: "numeric", second: "numeric",
        hourCycle: "h23",
      })
        .formatToParts(guess)
        .filter((p) => p.type !== "literal")
        .map((p) => [p.type, Number(p.value)]),
    );
    const localGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return new Date(guess.getTime() - (localGuess - guess.getTime()));
  }
  return {
    start: zonedDayStart(mondayUTC).toISOString(),
    end: zonedDayStart(nextMondayUTC).toISOString(),
  };
}

/**
 * Resolve the set of accounts that should feed the "balanced budget" on the
 * home screen. When the user has explicitly chosen accounts (stored in
 * `budget_account_ids` as a JSON array of account ids) those are used; an empty
 * selection yields no accounts (budget is $0). If the setting is absent, all
 * ACTIVE NZD accounts are used (the original behaviour).
 */
function getBudgetAccountFilter(alias: "t" | "a") {
  const row = db
    .prepare("SELECT value FROM finance_settings WHERE key = ?")
    .get("budget_account_ids") as { value?: string } | undefined;

  let ids: string[];
  if (row?.value !== undefined) {
    try {
      const parsed = JSON.parse(row.value);
      ids = Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
    } catch {
      ids = [];
    }
  } else {
    ids = (db
      .prepare("SELECT id FROM cached_accounts WHERE currency = 'NZD' AND status = 'ACTIVE'")
      .all() as Array<{ id: string }>).map((account) => account.id);
  }

  if (ids.length === 0) return { sql: "1 = 0", params: [] as string[] };
  const placeholders = ids.map(() => "?").join(", ");
  return { sql: `${alias}.account_id IN (${placeholders})`, params: ids };
}

export function getBudgetAccountSelection() {
  const row = db
    .prepare("SELECT value FROM finance_settings WHERE key = ?")
    .get("budget_account_ids") as { value?: string } | undefined;
  let selectedIds: string[] = [];
  if (row?.value !== undefined) {
    try {
      const parsed = JSON.parse(row.value);
      selectedIds = Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
    } catch {
      selectedIds = [];
    }
  } else {
    selectedIds = (db
      .prepare("SELECT id FROM cached_accounts WHERE currency = 'NZD' AND status = 'ACTIVE'")
      .all() as Array<{ id: string }>).map((account) => account.id);
  }
  return { accounts: getAccounts(), selectedIds };
}

export function getDashboardData(options?: {
  period?: "week" | "month";
  selectedCategoryId?: string;
}) {
  seedFinanceData();
  const period = options?.period === "month" ? "month" : "week";
  const current = period === "month" ? monthRange() : weekRange();
  const budgetPeriod = monthRange();
  const previous = monthRange(-1);
  const accountFilter = getBudgetAccountFilter("t");
  const settings = Object.fromEntries(
    (db.prepare("SELECT key, value FROM finance_settings").all() as SettingRow[]).map(
      (row) => [row.key, Number(row.value)],
    ),
  );
  const categorySpendStatement = db.prepare(`
      SELECT c.id, c.name, c.color,
        MAX(COALESCE(SUM(CASE
          WHEN t.amount < 0 THEN ABS(t.amount)
          WHEN t.amount > 0 AND t.merchant IS NOT NULL THEN -t.amount
          ELSE 0 END), 0), 0) amount,
        b.monthly_limit budget
      FROM categories c
      LEFT JOIN cached_transactions t ON t.category_id = c.id
        AND t.date >= ? AND t.date < ?
        AND t.is_hidden = 0
        AND t.type NOT IN ('TRANSFER', 'CREDIT CARD', 'LOAN')
        AND ${accountFilter.sql}
      LEFT JOIN budgets b ON b.category_id = c.id
      WHERE c.section = 'PERSONAL' AND c.archived = 0
      GROUP BY c.id
      ORDER BY amount DESC, c.sort_order
    `);
  const periodCategories = categorySpendStatement.all(
    current.start,
    current.end,
    ...accountFilter.params,
  ) as Array<{
    id: string;
    name: string;
    color: string;
    amount: number;
    budget: number | null;
  }>;
  const monthlySpendByCategory = period === "month"
    ? new Map(periodCategories.map((category) => [category.id, category.amount]))
    : new Map(
        (
          categorySpendStatement.all(
            budgetPeriod.start,
            budgetPeriod.end,
            ...accountFilter.params,
          ) as Array<{ id: string; amount: number }>
        ).map((category) => [category.id, category.amount]),
      );
  const categories: CategorySpend[] = periodCategories.map((category) => ({
    ...category,
    budgetSpent: monthlySpendByCategory.get(category.id) ?? 0,
  }));
  const selectedCategory = options?.selectedCategoryId
    ? categories.find((category) => category.id === options.selectedCategoryId) ?? null
    : null;
  const selectedCategorySpends = selectedCategory
    ? (db
        .prepare(`
          SELECT t.id, t.date, COALESCE(t.merchant, t.description) label,
            COALESCE(a.nickname, a.name) accountName, ABS(t.amount) amount
          FROM cached_transactions t
          JOIN cached_accounts a ON a.id = t.account_id
          WHERE t.category_id = ?
            AND t.date >= ? AND t.date < ?
            AND t.amount < 0
            AND t.is_hidden = 0
            AND t.type NOT IN ('TRANSFER', 'CREDIT CARD', 'LOAN')
            AND ${accountFilter.sql}
          ORDER BY ABS(t.amount) DESC, t.date DESC
          LIMIT 5
        `)
        .all(selectedCategory.id, current.start, current.end, ...accountFilter.params) as CategoryTopSpend[])
    : [];
  const previousSpent = (
    db
      .prepare(`
        SELECT MAX(COALESCE(SUM(CASE
          WHEN t.amount < 0 THEN ABS(t.amount)
          WHEN t.amount > 0 AND t.merchant IS NOT NULL THEN -t.amount
          ELSE 0 END), 0), 0) total
        FROM cached_transactions t
        JOIN categories c ON c.id = t.category_id
        JOIN cached_accounts a ON a.id = t.account_id
        WHERE c.section = 'PERSONAL' AND c.archived = 0
          AND t.type NOT IN ('TRANSFER', 'CREDIT CARD', 'LOAN')
          AND t.is_hidden = 0
          AND ${accountFilter.sql}
          AND t.date >= ? AND t.date < ?
      `)
      .get(previous.start, previous.end, ...accountFilter.params) as { total: number }
  ).total;
  const debtAccount = db
    .prepare(`
      SELECT id, name, institution, formatted_account, currency,
        current_balance, credit_limit
      FROM cached_accounts
      WHERE type = 'CREDITCARD' AND status = 'ACTIVE' AND currency = 'NZD'
      ORDER BY current_balance ASC LIMIT 1
    `)
    .get() as
    | {
        id: string;
        name: string;
        institution: string;
        formatted_account: string | null;
        currency: string | null;
        current_balance: number | null;
        credit_limit: number | null;
      }
    | undefined;
  const debtPayments = debtAccount
    ? (
        db
          .prepare(`
            SELECT COALESCE(SUM(amount), 0) total FROM cached_transactions
            WHERE account_id = ? AND amount > 0 AND type = 'CREDIT CARD'
              AND date >= ? AND date < ?
          `)
          .get(debtAccount.id, current.start, current.end) as { total: number }
      ).total
    : 0;
  const debtCharges = debtAccount
    ? (
        db
          .prepare(`
            SELECT COALESCE(SUM(ABS(amount)), 0) total FROM cached_transactions
            WHERE account_id = ? AND amount < 0
              AND type NOT IN ('TRANSFER', 'CREDIT CARD', 'LOAN')
              AND is_hidden = 0
              AND date >= ? AND date < ?
          `)
          .get(debtAccount.id, current.start, current.end) as { total: number }
      ).total
    : 0;
  const goals = db
    .prepare(`
      SELECT id, name, target_amount target, current_amount current,
        monthly_contribution contribution, color
      FROM goals ORDER BY sort_order
    `)
    .all() as Goal[];
  const monthlyContributions = Object.fromEntries(
    (
      db
        .prepare(`
          SELECT g.goal_id goalId, COALESCE(SUM(g.amount), 0) amount
          FROM goal_contributions g
          JOIN cached_transactions t ON t.id = g.transaction_id
          WHERE t.date >= ? AND t.date < ? AND t.is_hidden = 0
          GROUP BY g.goal_id
        `)
        .all(current.start, current.end) as Array<{ goalId: string; amount: number }>
    ).map((row) => [row.goalId, row.amount]),
  );
  const reviewCount = (
    db
      .prepare("SELECT COUNT(*) count FROM cached_transactions WHERE reviewed = 0 AND is_hidden = 0")
      .get() as { count: number }
  ).count;
  const trendStatement = db.prepare(`
      SELECT MAX(COALESCE(SUM(CASE
        WHEN t.amount < 0 THEN ABS(t.amount)
        WHEN t.amount > 0 AND t.merchant IS NOT NULL THEN -t.amount
        ELSE 0 END), 0), 0) amount
      FROM cached_transactions t
      JOIN categories c ON c.id = t.category_id
      JOIN cached_accounts a ON a.id = t.account_id
      WHERE c.section = 'PERSONAL' AND c.archived = 0
        AND t.type NOT IN ('TRANSFER', 'CREDIT CARD', 'LOAN')
        AND t.is_hidden = 0
        AND ${accountFilter.sql}
        AND t.date >= ? AND t.date < ?
    `);
  const monthlyTrend = Array.from({ length: 6 }, (_, index) => {
    const range = monthRange(index - 5);
    const result = trendStatement.get(range.start, range.end, ...accountFilter.params) as { amount: number };
    return { month: range.month, amount: result.amount };
  });
  const lastSync = db
    .prepare(`
      SELECT completed_at, account_count, transaction_count, status, message
      FROM sync_runs ORDER BY id DESC LIMIT 1
    `)
    .get() as
    | {
        completed_at: string | null;
        account_count: number;
        transaction_count: number;
        status: string;
        message: string | null;
      }
    | undefined;
  const recentTransactions = getTransactions({ limit: 8 });

  return {
    settings,
    categories,
    selectedCategory,
    selectedCategorySpends,
    previousSpent,
    debtAccount,
    debtPayments,
    debtCharges,
    goals,
    monthlyContributions,
    reviewCount,
    monthlyTrend,
    lastSync,
    recentTransactions,
    currentMonth: current.start,
  };
}

export function getTransactions(options?: {
  limit?: number;
  onlyReview?: boolean;
  categoryId?: string;
}) {
  seedFinanceData();
  const clauses = ["t.is_hidden = 0"];
  const parameters: Array<string | number> = [];
  if (options?.onlyReview) clauses.push("t.reviewed = 0");
  if (options?.categoryId) {
    clauses.push("t.category_id = ?");
    parameters.push(options.categoryId);
  }
  parameters.push(options?.limit ?? 100);

  return db
    .prepare(`
      SELECT t.id, t.account_id accountId, COALESCE(a.nickname, a.name) accountName, t.date,
        t.description, t.amount, t.type, t.merchant, t.category_id categoryId,
        c.name categoryName, c.color categoryColor, t.category_source source,
        t.confidence, t.reviewed
      FROM cached_transactions t
      JOIN cached_accounts a ON a.id = t.account_id
      JOIN categories c ON c.id = t.category_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY t.date DESC LIMIT ?
    `)
    .all(...parameters)
    .map((row) => ({
      ...(row as Omit<CachedTransaction, "reviewed"> & { reviewed: number }),
      reviewed: Boolean((row as { reviewed: number }).reviewed),
    })) as CachedTransaction[];
}

export function getAccountTransactions(
  accountId: string,
  start: Date,
  end: Date,
) {
  seedFinanceData();
  return db
    .prepare(`
      SELECT t.id, t.account_id accountId, COALESCE(a.nickname, a.name) accountName, t.date,
        t.description, t.amount, t.type, t.merchant,
        t.category_id categoryId, c.name categoryName,
        c.color categoryColor, t.category_source source,
        t.confidence, t.reviewed
      FROM cached_transactions t
      JOIN cached_accounts a ON a.id = t.account_id
      JOIN categories c ON c.id = t.category_id
      WHERE t.account_id = ? AND t.date >= ? AND t.date <= ? AND t.is_hidden = 0
      ORDER BY t.date DESC
    `)
    .all(accountId, start.toISOString(), end.toISOString())
    .map((row) => ({
      ...(row as Omit<CachedTransaction, "reviewed"> & { reviewed: number }),
      reviewed: Boolean((row as { reviewed: number }).reviewed),
    })) as CachedTransaction[];
}

export function getBudgetData() {
  const dashboard = getDashboardData({ period: "month" });
  return {
    categories: dashboard.categories,
    totalSpent: dashboard.categories.reduce((sum, category) => sum + category.amount, 0),
    totalBudget: dashboard.categories.reduce(
      (sum, category) => sum + (category.budget ?? 0),
      0,
    ),
    previousSpent: dashboard.previousSpent,
  };
}

export function getGoals() {
  seedFinanceData();
  return db
    .prepare(`
      SELECT id, name, target_amount target, current_amount current,
        monthly_contribution contribution, color
      FROM goals ORDER BY sort_order
    `)
    .all() as Goal[];
}

export function getReviewCount() {
  seedFinanceData();
  return (
    db
      .prepare("SELECT COUNT(*) count FROM cached_transactions WHERE reviewed = 0 AND is_hidden = 0")
      .get() as { count: number }
  ).count;
}

export function getCategories() {
  seedFinanceData();
  return db
    .prepare("SELECT id, name, section, color FROM categories WHERE archived = 0 ORDER BY sort_order")
    .all() as Array<{
    id: string;
    name: string;
    section: "PERSONAL" | "SEPARATE";
    color: string;
  }>;
}

export function getAccounts(): AccountCard[] {
  return db
    .prepare(`
      SELECT id, COALESCE(nickname, name) displayName, formatted_account formattedAccount,
        type, institution, current_balance currentBalance, currency
      FROM cached_accounts
      WHERE status = 'ACTIVE'
      ORDER BY type, name
    `)
    .all() as AccountCard[];
}
