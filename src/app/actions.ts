"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createAccount,
  createSession,
  deleteCurrentSession,
  getAuthenticatedUserId,
  hasAccount,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";
import { verifyAkahuTokens } from "@/lib/akahu";
import { saveAkahuTokens } from "@/lib/credentials";
import { getVaultConfigurationError } from "@/lib/vault";

function getString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function setNewSessionCookie() {
  const session = createSession();
  (await cookies()).set(
    SESSION_COOKIE,
    session.token,
    sessionCookieOptions(session.expiresAt),
  );
}

export async function setupAccount(formData: FormData) {
  if (hasAccount()) redirect("/?notice=account-exists");

  const password = getString(formData, "password");
  const confirmation = getString(formData, "passwordConfirmation");

  if (password.length < 12 || password.length > 128) {
    redirect("/?notice=password-length");
  }
  if (password !== confirmation) redirect("/?notice=password-mismatch");

  await createAccount(password);
  await setNewSessionCookie();
  redirect("/?notice=account-created");
}

export async function login(formData: FormData) {
  const password = getString(formData, "password");
  const result = await verifyPassword(password);

  if (!result.valid) {
    redirect(`/?notice=${result.locked ? "login-locked" : "login-failed"}`);
  }

  await setNewSessionCookie();
  redirect("/");
}

export async function logout() {
  await deleteCurrentSession();
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}

export async function saveCredentials(formData: FormData) {
  if (!(await getAuthenticatedUserId())) redirect("/?notice=session-expired");
  if (getVaultConfigurationError()) redirect("/?notice=vault-invalid");

  const userToken = getString(formData, "userToken").trim();
  const appToken = getString(formData, "appToken").trim();
  if (!userToken || !appToken) redirect("/?notice=tokens-required");

  const result = await verifyAkahuTokens({ userToken, appToken });
  if (result.status !== "connected") redirect("/?notice=tokens-invalid");

  saveAkahuTokens({ userToken, appToken });
  redirect("/?notice=tokens-saved");
}
