import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { getAuthenticatedUserId, hasAccount } from "@/lib/auth";
import { getBudgetAccountSelection } from "@/lib/finance-data";
import { isOnboardingComplete } from "@/lib/onboarding";
import { getLlmSettings } from "@/lib/llm";

export default async function WelcomePage() {
  if (!hasAccount() || !(await getAuthenticatedUserId())) redirect("/");
  if (isOnboardingComplete()) redirect("/");

  const { accounts } = getBudgetAccountSelection();
  const llm = getLlmSettings();

  return (
    <main className="grid min-h-screen place-items-center bg-[#f0ebe0] px-4 py-10">
      <OnboardingWizard accounts={accounts} llm={llm} />
    </main>
  );
}