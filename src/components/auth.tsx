import { login, setupAccount } from "@/app/actions";

const authNotices: Record<string, string> = {
  "account-created": "Your local account is ready. Sign in to continue.",
  "account-exists": "An account already exists. Sign in instead.",
  "login-failed": "The password was not accepted.",
  "login-locked": "Too many attempts. Login is locked for 15 minutes.",
  "password-length": "Use a password between 12 and 128 characters.",
  "password-mismatch": "The password confirmation did not match.",
};

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f0ebe0] px-4 py-8">
      <section className="w-full max-w-lg border border-[#c8bea8] bg-[#faf7f0]">
        <header className="flex items-center justify-between px-5 py-4">
          <p className="font-serif text-xl font-bold text-[#1c2b3a]">Kashin</p>
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#b8922a]">Private finance</span>
        </header>
        <div className="double-rule mx-5" />
        {children}
      </section>
    </main>
  );
}

export function AuthNotice({ value }: { value?: string }) {
  if (!value || !authNotices[value]) return null;
  const positive = ["account-created"].includes(value);
  return (
    <div className={`mb-6 border-l-4 px-4 py-3 text-sm ${positive ? "border-[#b8922a] bg-[#1c2b3a] text-white" : "border-[#b43b31] bg-[#faf7f0] text-[#b43b31]"}`}>
      {authNotices[value]}
    </div>
  );
}

export function VercelBanner() {
  if (!process.env.VERCEL) return null;
  return (
    <div className="mb-6 border-l-4 border-[#b8922a] bg-[#1c2b3a] p-4 text-sm text-white">
      You&apos;re viewing the hosted brochure — Kashin runs on your own machine. See the{" "}
      <a className="underline" href="https://github.com/devdass/kashin" target="_blank" rel="noreferrer">
        GitHub README
      </a>{" "}
      for quickstart instructions.
    </div>
  );
}

export function LoginForm({ notice }: { notice?: string }) {
  return (
    <AuthShell>
      <div className="px-5 py-7">
        <VercelBanner />
        <AuthNotice value={notice} />
        <p className="eyebrow">Welcome back</p>
        <h1 className="mt-3 font-serif text-3xl font-bold text-[#1c2b3a]">Unlock your dashboard.</h1>
        <form action={login} className="mt-5 grid gap-3">
          <label className="grid gap-2 text-sm text-[#4a4a4a]">
            Password
            <input required autoFocus autoComplete="current-password" className="field" name="password" type="password" />
          </label>
          <button className="primary-button" type="submit">Sign in</button>
        </form>
      </div>
    </AuthShell>
  );
}

export function SetupForm({ notice }: { notice?: string }) {
  return (
    <AuthShell>
      <div className="px-5 py-7">
        <VercelBanner />
        <AuthNotice value={notice} />
        <p className="eyebrow">First-time setup</p>
        <h1 className="mt-3 font-serif text-3xl font-bold text-[#1c2b3a]">Create your local login.</h1>
        <p className="mt-4 text-sm leading-6 text-[#4a4a4a]">This password protects the dashboard. It is hashed with Argon2id and is not an Akahu or bank password.</p>
        <form action={setupAccount} className="mt-5 grid gap-3">
          <label className="grid gap-2 text-sm text-[#4a4a4a]">Password<input required autoComplete="new-password" className="field" maxLength={128} minLength={12} name="password" type="password" /></label>
          <label className="grid gap-2 text-sm text-[#4a4a4a]">Confirm password<input required autoComplete="new-password" className="field" maxLength={128} minLength={12} name="passwordConfirmation" type="password" /></label>
          <button className="primary-button" type="submit">Create secure account</button>
        </form>
      </div>
    </AuthShell>
  );
}