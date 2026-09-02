import "server-only";

import { hash, verify } from "@node-rs/argon2";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, dbUnavailable } from "@/lib/db";

export const SESSION_COOKIE = "akahu_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

type UserRow = {
  id: number;
  password_hash: string;
  failed_logins: number;
  locked_until: string | null;
};
type SessionRow = { user_id: number; expires_at: string };

function digestSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hasAccount() {
  if (dbUnavailable) return false;
  return Boolean(db.prepare("SELECT id FROM users WHERE id = 1").get());
}

export async function createAccount(password: string) {
  const passwordHash = await hash(password, {
    algorithm: 2,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  db.prepare(
    "INSERT INTO users (id, password_hash, created_at) VALUES (1, ?, ?)",
  ).run(passwordHash, new Date().toISOString());
}

export async function verifyPassword(password: string) {
  const user = db
    .prepare(
      "SELECT id, password_hash, failed_logins, locked_until FROM users WHERE id = 1",
    )
    .get() as UserRow | undefined;

  if (!user) return { valid: false, locked: false };
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return { valid: false, locked: true };
  }

  const valid = await verify(user.password_hash, password);

  if (valid) {
    db.prepare(
      "UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = 1",
    ).run();
    return { valid: true, locked: false };
  }

  const failedLogins = user.failed_logins + 1;
  const lockedUntil =
    failedLogins >= 5
      ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
      : null;
  db.prepare(
    "UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = 1",
  ).run(lockedUntil ? 0 : failedLogins, lockedUntil);

  return { valid: false, locked: Boolean(lockedUntil) };
}

export function createSession() {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000);

  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
     VALUES (?, 1, ?, ?)`,
  ).run(
    digestSessionToken(token),
    expiresAt.toISOString(),
    new Date().toISOString(),
  );

  return { token, expiresAt };
}

export async function getAuthenticatedUserId() {
  if (dbUnavailable) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(
    new Date().toISOString(),
  );
  const session = db
    .prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?")
    .get(digestSessionToken(token)) as SessionRow | undefined;

  return session ? session.user_id : null;
}

export async function deleteCurrentSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(
      digestSessionToken(token),
    );
  }
}

export async function requireAuthenticatedUser() {
  if (!hasAccount() || !(await getAuthenticatedUserId())) redirect("/");
}

export const sessionCookieOptions = (expires: Date) => ({
  httpOnly: true,
  sameSite: "strict" as const,
  secure:
    process.env.NODE_ENV === "production" &&
    process.env.AKAHU_ALLOW_INSECURE_HTTP !== "true",
  path: "/",
  expires,
  priority: "high" as const,
});
