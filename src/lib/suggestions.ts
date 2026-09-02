export type SuggestedCategory = {
  id: string;
  name: string;
  section: "PERSONAL" | "SEPARATE";
  color: string;
  sortOrder: number;
};

// Suggested categories offered in the onboarding wizard. These are guidance only —
// NOT seeded into the database. Each user chooses, renames, removes, and adds their
// own categories. The categoriser resolves hints to the user's actual categories.
export const SUGGESTED_CATEGORIES: SuggestedCategory[] = [
  { id: "groceries", name: "Groceries", section: "PERSONAL", color: "#78c091", sortOrder: 1 },
  { id: "eating-out", name: "Eating out", section: "PERSONAL", color: "#f28c52", sortOrder: 2 },
  { id: "alcohol", name: "Alcohol", section: "PERSONAL", color: "#ad7cc4", sortOrder: 3 },
  { id: "entertainment", name: "Entertainment", section: "PERSONAL", color: "#e86862", sortOrder: 4 },
  { id: "transport", name: "Transport", section: "PERSONAL", color: "#e7aa18", sortOrder: 5 },
  { id: "travel", name: "Travel", section: "PERSONAL", color: "#4f8de7", sortOrder: 6 },
  { id: "shopping", name: "Shopping", section: "PERSONAL", color: "#dc82ac", sortOrder: 7 },
  { id: "subscriptions-software", name: "Subscriptions & software", section: "PERSONAL", color: "#34b38a", sortOrder: 8 },
  { id: "bills", name: "Bills", section: "PERSONAL", color: "#e9637f", sortOrder: 9 },
  { id: "health", name: "Health", section: "PERSONAL", color: "#8a6fa8", sortOrder: 10 },
  { id: "cash", name: "Cash", section: "PERSONAL", color: "#6757bf", sortOrder: 11 },
  { id: "other", name: "Other", section: "PERSONAL", color: "#9a9a93", sortOrder: 12 },
  { id: "investments", name: "Investments", section: "SEPARATE", color: "#46966f", sortOrder: 13 },
  { id: "housing", name: "Housing", section: "SEPARATE", color: "#f1b323", sortOrder: 14 },
  { id: "business", name: "Business", section: "SEPARATE", color: "#a66bb0", sortOrder: 15 },
  { id: "income", name: "Income", section: "SEPARATE", color: "#2f8f5b", sortOrder: 16 },
  { id: "transfers-other", name: "Transfers & other", section: "SEPARATE", color: "#536b8f", sortOrder: 17 },
];