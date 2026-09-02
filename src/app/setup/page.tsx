import { redirect } from "next/navigation";
import { SetupForm } from "@/components/auth";
import { hasAccount } from "@/lib/auth";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  if (hasAccount()) redirect("/?notice=account-exists");
  return <SetupForm notice={notice} />;
}