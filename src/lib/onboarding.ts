import "server-only";

import { db, dbUnavailable } from "@/lib/db";
import { getAkahuTokens } from "@/lib/credentials";

/**
 * Determine whether first-run onboarding has been completed.
 * A user is considered onboarded if:
 *  - they explicitly completed/skipped the wizard, OR
 *  - they already have categories + Akahu tokens (e.g. upgraded from an older
 *    version that seeded defaults) — so they aren't forced back into the wizard.
 */
export function isOnboardingComplete(): boolean {
  if (dbUnavailable) return true;
  const flag = db
    .prepare("SELECT value FROM finance_settings WHERE key = ?")
    .get("onboarding_complete") as { value?: string } | undefined;
  if (flag?.value === "1") return true;

  const categoryCount = (db.prepare("SELECT COUNT(*) c FROM categories").get() as { c: number }).c;
  const hasTokens = Boolean(getAkahuTokens());
  if (categoryCount > 0 && hasTokens) return true;

  return false;
}