import "server-only";

import { db } from "@/lib/db";
import {
  getAkahuAccounts,
  getAkahuAccountTransactions,
  triggerAkahuRefresh,
  type AkahuAccount,
  type AkahuTransaction,
  type AkahuTokens,
} from "@/lib/akahu";
import { buildCategorizer, classifyUnreviewedWithLlm, normalizeVendor, processGoalContributions, seedFinanceData } from "@/lib/finance";

export type SyncResult =
  | { status: "success"; accounts: number; transactions: number }
  | { status: "error"; message: string };

export async function syncFinanceData(tokens: AkahuTokens): Promise<SyncResult> {
  seedFinanceData();
  const startedAt = new Date().toISOString();
  const run = db
    .prepare(
      "INSERT INTO sync_runs (started_at, status) VALUES (?, 'RUNNING')",
    )
    .run(startedAt);
  const runId = Number(run.lastInsertRowid);

  try {
    // Ask Akahu to fetch fresh data from the bank. Silently ignored if within 5-min cooldown.
    await triggerAkahuRefresh(tokens);

    const accountResult = await getAkahuAccounts(tokens);
    if (accountResult.status === "error") throw new Error(accountResult.message);

    const now = new Date();
    const start = new Date(now.getTime() - 370 * 24 * 60 * 60 * 1000);
    const categorizer = buildCategorizer();
    const categoryIds = new Set<string>(
      (db.prepare("SELECT id FROM categories").all() as Array<{ id: string }>).map((row) => row.id),
    );
    const transactionSets: Array<{
      account: AkahuAccount;
      transactions: AkahuTransaction[];
    }> = [];
    for (const account of accountResult.accounts) {
      if (!account.attributes.includes("TRANSACTIONS")) {
        transactionSets.push({ account, transactions: [] });
        continue;
      }
      const result = await getAkahuAccountTransactions(
        tokens,
        account.id,
        start,
        now,
      );
      if (result.status === "error") {
        throw new Error(`${account.name}: ${result.message}`);
      }
      transactionSets.push({ account, transactions: result.transactions });
    }

    const upsertAccount = db.prepare(`
      INSERT INTO cached_accounts (
        id, name, institution, type, status, formatted_account, currency,
        current_balance, available_balance, credit_limit, attributes_json,
        balance_refreshed_at, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        institution = excluded.institution,
        type = excluded.type,
        status = excluded.status,
        formatted_account = excluded.formatted_account,
        currency = excluded.currency,
        current_balance = excluded.current_balance,
        available_balance = excluded.available_balance,
        credit_limit = excluded.credit_limit,
        attributes_json = excluded.attributes_json,
        balance_refreshed_at = excluded.balance_refreshed_at,
        synced_at = excluded.synced_at
    `);
    const upsertSnapshot = db.prepare(`
      INSERT INTO account_balance_snapshots
        (account_id, snapshot_date, current_balance, currency)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(account_id, snapshot_date) DO UPDATE SET
        current_balance = excluded.current_balance,
        currency = excluded.currency
    `);
    const upsertTransaction = db.prepare(`
      INSERT INTO cached_transactions (
        id, account_id, date, description, amount, type, merchant,
        normalized_merchant, akahu_category, akahu_category_group,
        category_id, category_source, confidence, reviewed, is_hidden, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      ON CONFLICT(id) DO UPDATE SET
        account_id = excluded.account_id,
        date = excluded.date,
        description = excluded.description,
        amount = excluded.amount,
        type = excluded.type,
        merchant = excluded.merchant,
        normalized_merchant = excluded.normalized_merchant,
        akahu_category = excluded.akahu_category,
        akahu_category_group = excluded.akahu_category_group,
        category_id = CASE
          WHEN EXISTS (
            SELECT 1 FROM transaction_overrides WHERE transaction_id = excluded.id
          ) THEN cached_transactions.category_id
          WHEN cached_transactions.category_id IS NULL
            OR cached_transactions.category_source = 'UNCATEGORISED'
          THEN excluded.category_id
          ELSE cached_transactions.category_id
        END,
        category_source = CASE
          WHEN EXISTS (
            SELECT 1 FROM transaction_overrides WHERE transaction_id = excluded.id
          ) THEN 'MANUAL'
          WHEN cached_transactions.category_id IS NULL
            OR cached_transactions.category_source = 'UNCATEGORISED'
          THEN excluded.category_source
          ELSE cached_transactions.category_source
        END,
        confidence = CASE
          WHEN EXISTS (
            SELECT 1 FROM transaction_overrides WHERE transaction_id = excluded.id
          ) THEN 1
          WHEN cached_transactions.category_id IS NULL
            OR cached_transactions.category_source = 'UNCATEGORISED'
          THEN excluded.confidence
          ELSE cached_transactions.confidence
        END,
        reviewed = CASE
          WHEN EXISTS (
            SELECT 1 FROM transaction_overrides WHERE transaction_id = excluded.id
          ) THEN 1
          WHEN cached_transactions.category_id IS NULL
            OR cached_transactions.category_source = 'UNCATEGORISED'
          THEN excluded.reviewed
          ELSE cached_transactions.reviewed
        END,
        is_hidden = excluded.is_hidden,
        synced_at = excluded.synced_at
    `);

    const syncedAt = new Date().toISOString();
    const snapshotDate = syncedAt.slice(0, 10);
    const transactionCount = transactionSets.reduce(
      (count, set) => count + set.transactions.length,
      0,
    );
    const saveSync = db.transaction(() => {
      for (const { account, transactions } of transactionSets) {
        upsertAccount.run(
          account.id,
          account.name,
          account.institution,
          account.type,
          account.status,
          account.formattedAccount ?? null,
          account.balance?.currency ?? null,
          account.balance?.current ?? null,
          account.balance?.available ?? null,
          account.balance?.limit ?? null,
          JSON.stringify(account.attributes),
          account.balanceRefreshedAt ?? null,
          syncedAt,
        );
        if (account.balance) {
          upsertSnapshot.run(
            account.id,
            snapshotDate,
            account.balance.current,
            account.balance.currency,
          );
        }
        for (const transaction of transactions) {
          const decision = categorizer(transaction);
          // The categoriser may resolve a hint to a category the user hasn't created
          // yet (or has since renamed/removed). If so, store the transaction as
          // uncategorised rather than violating the foreign key.
          const categoryId = decision.categoryId && categoryIds.has(decision.categoryId)
            ? decision.categoryId
            : null;
          const isUncategorised = categoryId === null;
          upsertTransaction.run(
            transaction.id,
            account.id,
            transaction.date,
            transaction.description,
            transaction.amount,
            transaction.type,
            transaction.merchant ?? null,
            normalizeVendor(transaction.merchant ?? transaction.description),
            transaction.category ?? null,
            transaction.categoryGroup ?? null,
            categoryId,
            isUncategorised ? "UNCATEGORISED" : decision.source,
            isUncategorised ? 0.25 : decision.confidence,
            isUncategorised ? 0 : decision.reviewed ? 1 : 0,
            syncedAt,
          );
        }
        if (account.attributes.includes("TRANSACTIONS")) {
          db.prepare(`
            UPDATE cached_transactions
            SET is_hidden = 1
            WHERE account_id = ? AND date >= ? AND date <= ? AND synced_at <> ?
              AND id NOT IN (SELECT transaction_id FROM transaction_overrides)
          `).run(account.id, start.toISOString(), now.toISOString(), syncedAt);
        }
      }

      const currentAccountIds = new Set(accountResult.accounts.map((account) => account.id));
      const cachedAccountIds = db
        .prepare("SELECT id FROM cached_accounts")
        .all() as Array<{ id: string }>;
      for (const { id } of cachedAccountIds) {
        if (currentAccountIds.has(id)) continue;
        db.prepare("UPDATE cached_transactions SET is_hidden = 1 WHERE account_id = ?").run(id);
        db.prepare("DELETE FROM account_balance_snapshots WHERE account_id = ?").run(id);
        db.prepare("DELETE FROM cached_accounts WHERE id = ?").run(id);
      }

      db.prepare(`
        UPDATE sync_runs SET completed_at = ?, status = 'SUCCESS',
          account_count = ?, transaction_count = ? WHERE id = ?
      `).run(
        new Date().toISOString(),
        accountResult.accounts.length,
        transactionCount,
        runId,
      );
    });
    saveSync();
    processGoalContributions();
    await classifyUnreviewedWithLlm();
    return {
      status: "success",
      accounts: accountResult.accounts.length,
      transactions: transactionCount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    db.prepare(`
      UPDATE sync_runs SET completed_at = ?, status = 'ERROR', message = ?
      WHERE id = ?
    `).run(new Date().toISOString(), message, runId);
    return { status: "error", message };
  }
}
