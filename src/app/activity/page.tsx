import { FinanceShell } from "@/components/finance-shell";
import { ReviewWorkbench } from "@/components/review-workbench";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  getAccounts,
  getCategories,
  getReviewCount,
  getTransactions,
} from "@/lib/finance-data";

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await requireAuthenticatedUser();
  const { view } = await searchParams;
  const onlyReview = view === "review";
  const [categories, accounts, transactions, reviewCount] = await Promise.all([
    Promise.resolve(getCategories()),
    Promise.resolve(getAccounts()),
    Promise.resolve(getTransactions({ limit: onlyReview ? 200 : 250, onlyReview })),
    Promise.resolve(getReviewCount()),
  ]);

  return (
    <FinanceShell
      description={onlyReview
        ? "Resolve uncertain categories, teach Kashin recurring merchants, and keep the ledger accurate."
        : "Search, filter, sort, and recategorise your complete transaction ledger."}
      eyebrow="Ledger"
      title={onlyReview ? "Review queue" : "Activity"}
      wide
    >
      <ReviewWorkbench
        accounts={accounts}
        categories={categories}
        onlyReview={onlyReview}
        reviewCount={reviewCount}
        transactions={transactions}
      />
    </FinanceShell>
  );
}
