import "server-only";

import { db, dbUnavailable } from "@/lib/db";

/**
 * Determine whether first-run onboarding has been completed.
 * Only the explicit "finish" flag counts — a user is NOT considered onboarded
 * just because they have tokens + categories (they may be mid-wizard).
 */
export function isOnboardingComplete(): boolean {
  if (dbUnavailable) return true;
  const flag = db
    .prepare("SELECT value FROM finance_settings WHERE key = ?")
    .get("onboarding_complete") as { value?: string } | undefined;
  return flag?.value === "1";
}