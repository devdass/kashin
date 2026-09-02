import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth";
import { hasAccount } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  if (!hasAccount()) redirect("/setup");
  return <LoginForm notice={notice} />;
}