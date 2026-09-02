import "server-only";

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

const dataDirectory = process.env.AKAHU_DATA_DIRECTORY
  ? path.resolve(process.env.AKAHU_DATA_DIRECTORY)
  : path.join(process.cwd(), "data");
const databasePath = path.join(dataDirectory, "app.db");

// On read-only filesystems (e.g. Vercel serverless, some container runtimes)
// SQLite cannot be created. The app then runs in "brochure mode": the marketing
// landing renders and data routes redirect to it, instead of crashing with 500.
export let dbUnavailable = false;

const globalForDatabase = globalThis as unknown as {
  akahuDatabase?: Database.Database;
};

export const db: Database.Database = (() => {
  try {
    if (globalForDatabase.akahuDatabase) return globalForDatabase.akahuDatabase;
    mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
    const instance = new Database(databasePath, { timeout: 5000 });
    globalForDatabase.akahuDatabase = instance;
    return instance;
  } catch (error) {
    console.error(
      "[kashin] SQLite unavailable (read-only filesystem?). Running in brochure mode.",
      error instanceof Error ? error.message : error,
    );
    dbUnavailable = true;
    // Throw a clear error if any caller actually tries to use the database,
    // so we surface the limitation loudly instead of silently misbehaving.
    return new Proxy({} as unknown as Database.Database, {
      get() {
        throw new Error(
          "Kashin database is unavailable in this environment (read-only filesystem). Run the app locally with a writable data directory.",
        );
      },
    });
  }
})();

if (!dbUnavailable) {
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    failed_logins INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS akahu_credentials (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    user_token_encrypted TEXT NOT NULL,
    app_token_encrypted TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
`);
}

const migrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        section TEXT NOT NULL CHECK (section IN ('PERSONAL', 'SEPARATE')),
        color TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE vendor_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendor TEXT NOT NULL,
        normalized_vendor TEXT NOT NULL UNIQUE,
        category_id TEXT NOT NULL REFERENCES categories(id),
        source TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.95,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE cached_accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        institution TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        formatted_account TEXT,
        currency TEXT,
        current_balance REAL,
        available_balance REAL,
        credit_limit REAL,
        attributes_json TEXT NOT NULL,
        balance_refreshed_at TEXT,
        synced_at TEXT NOT NULL
      );

      CREATE TABLE cached_transactions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        date TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        type TEXT NOT NULL,
        merchant TEXT,
        normalized_merchant TEXT NOT NULL,
        akahu_category TEXT,
        akahu_category_group TEXT,
        category_id TEXT REFERENCES categories(id),
        category_source TEXT NOT NULL,
        confidence REAL NOT NULL,
        reviewed INTEGER NOT NULL DEFAULT 0,
        synced_at TEXT NOT NULL
      );

      CREATE TABLE account_balance_snapshots (
        account_id TEXT NOT NULL,
        snapshot_date TEXT NOT NULL,
        current_balance REAL NOT NULL,
        currency TEXT NOT NULL,
        PRIMARY KEY (account_id, snapshot_date)
      );

      CREATE TABLE transaction_overrides (
        transaction_id TEXT PRIMARY KEY REFERENCES cached_transactions(id) ON DELETE CASCADE,
        category_id TEXT NOT NULL REFERENCES categories(id),
        apply_to_vendor INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE budgets (
        category_id TEXT PRIMARY KEY REFERENCES categories(id),
        monthly_limit REAL NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE goals (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        target_amount REAL NOT NULL,
        current_amount REAL NOT NULL DEFAULT 0,
        monthly_contribution REAL NOT NULL DEFAULT 0,
        color TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE finance_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE travel_windows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        starts_on TEXT NOT NULL,
        ends_on TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE sync_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT NOT NULL,
        account_count INTEGER NOT NULL DEFAULT 0,
        transaction_count INTEGER NOT NULL DEFAULT 0,
        message TEXT
      );

      CREATE INDEX cached_transactions_account_date
        ON cached_transactions(account_id, date DESC);
      CREATE INDEX cached_transactions_category_date
        ON cached_transactions(category_id, date DESC);
      CREATE INDEX cached_transactions_review
        ON cached_transactions(reviewed, confidence, date DESC);
      CREATE INDEX vendor_rules_category ON vendor_rules(category_id);
    `,
  },
  {
    version: 4,
    sql: `
      ALTER TABLE cached_transactions ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX cached_transactions_reviewed ON cached_transactions(reviewed);
      CREATE INDEX cached_transactions_hidden_date ON cached_transactions(is_hidden, date DESC);
    `,
  },
  {
    version: 5,
    sql: `
      ALTER TABLE categories ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE llm_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        enabled INTEGER NOT NULL DEFAULT 0,
        provider TEXT NOT NULL DEFAULT 'openai',
        model TEXT NOT NULL DEFAULT '',
        base_url TEXT,
        api_key_encrypted TEXT,
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 3,
    sql: `
      ALTER TABLE cached_accounts ADD COLUMN nickname TEXT;
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE classification_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mode TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT NOT NULL,
        items_total INTEGER NOT NULL DEFAULT 0,
        items_resolved INTEGER NOT NULL DEFAULT 0,
        items_deferred INTEGER NOT NULL DEFAULT 0,
        message TEXT
      );

      CREATE TABLE classification_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL REFERENCES classification_runs(id),
        transaction_id TEXT NOT NULL REFERENCES cached_transactions(id) ON DELETE CASCADE,
        category_id TEXT REFERENCES categories(id),
        resolved INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL,
        confidence REAL NOT NULL,
        reasoning TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (run_id, transaction_id)
      );

      CREATE INDEX classification_decisions_transaction
        ON classification_decisions(transaction_id);

      CREATE TABLE goal_contributions (
        transaction_id TEXT PRIMARY KEY REFERENCES cached_transactions(id) ON DELETE CASCADE,
        goal_id TEXT NOT NULL REFERENCES goals(id),
        amount REAL NOT NULL,
        matched_on TEXT NOT NULL,
        confidence REAL NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX goal_contributions_goal ON goal_contributions(goal_id);
    `,
  },
];

const applyMigration = db.transaction((version: number, sql: string) => {
  const applied = db
    .prepare("SELECT 1 FROM schema_migrations WHERE version = ?")
    .get(version);
  if (applied) return;
  db.exec(sql);
  db.prepare(
    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
  ).run(version, new Date().toISOString());
});

for (const migration of migrations) {
  if (dbUnavailable) break;
  applyMigration.immediate(migration.version, migration.sql);
}

if (process.env.NODE_ENV !== "production" && !dbUnavailable) {
  globalForDatabase.akahuDatabase = db;
}
