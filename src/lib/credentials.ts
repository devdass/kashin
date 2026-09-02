import "server-only";

import { db } from "@/lib/db";
import type { AkahuTokens } from "@/lib/akahu";
import { decryptSecret, encryptSecret } from "@/lib/vault";

type CredentialRow = {
  user_token_encrypted: string;
  app_token_encrypted: string;
};

export function saveAkahuTokens(tokens: AkahuTokens) {
  db.prepare(
    `INSERT INTO akahu_credentials
      (id, user_token_encrypted, app_token_encrypted, updated_at)
     VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      user_token_encrypted = excluded.user_token_encrypted,
      app_token_encrypted = excluded.app_token_encrypted,
      updated_at = excluded.updated_at`,
  ).run(
    encryptSecret(tokens.userToken),
    encryptSecret(tokens.appToken),
    new Date().toISOString(),
  );
}

export function getAkahuTokens(): AkahuTokens | null {
  const row = db
    .prepare(
      `SELECT user_token_encrypted, app_token_encrypted
       FROM akahu_credentials WHERE id = 1`,
    )
    .get() as CredentialRow | undefined;

  if (!row) return null;

  return {
    userToken: decryptSecret(row.user_token_encrypted),
    appToken: decryptSecret(row.app_token_encrypted),
  };
}
