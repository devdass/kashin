import "server-only";

const AKAHU_API_URL = "https://api.akahu.io/v1";

export type AkahuTokens = { userToken: string; appToken: string };

type AkahuMeResponse = {
  success: boolean;
  item?: {
    _id: string;
    access_granted_at: string;
    email?: string;
  };
  message?: string;
};

export type AkahuAccount = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  type: string;
  attributes: string[];
  formattedAccount?: string;
  institution: string;
  balance?: {
    currency: string;
    current: number;
    available?: number;
    limit?: number;
    overdrawn?: boolean;
  };
  balanceRefreshedAt?: string;
};

type AkahuAccountsResponse = {
  success: boolean;
  items?: Array<{
    _id: string;
    name: string;
    status: "ACTIVE" | "INACTIVE";
    type: string;
    attributes: string[];
    formatted_account?: string;
    connection: { name: string };
    balance?: {
      currency: string;
      current: number;
      available?: number;
      limit?: number;
      overdrawn?: boolean;
    };
    refreshed?: { balance?: string };
  }>;
  message?: string;
};

export type AkahuConnection =
  | { status: "not-configured" }
  | {
      status: "connected";
      user: { id: string; email?: string; accessGrantedAt: string };
    }
  | { status: "error"; message: string };

export type AkahuAccounts =
  | { status: "success"; accounts: AkahuAccount[] }
  | { status: "error"; message: string };

export type AkahuTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: string;
  merchant?: string;
  category?: string;
  categoryGroup?: string;
};

type AkahuTransactionsResponse = {
  success: boolean;
  items?: Array<{
    _id: string;
    date: string;
    description: string;
    amount: number;
    type: string;
    merchant?: { name: string };
    category?: {
      name: string;
      groups?: { personal_finance?: { name: string } };
    };
  }>;
  cursor?: { next?: string | null };
  message?: string;
};

export type AkahuTransactions =
  | { status: "success"; transactions: AkahuTransaction[] }
  | { status: "error"; message: string };

function headers(tokens: AkahuTokens) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${tokens.userToken}`,
    "Content-Type": "application/json",
    "X-Akahu-Id": tokens.appToken,
  };
}

export async function getAkahuConnection(
  tokens: AkahuTokens | null,
): Promise<AkahuConnection> {
  if (!tokens) {
    return { status: "not-configured" };
  }

  try {
    const response = await fetch(`${AKAHU_API_URL}/me`, {
      headers: headers(tokens),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await response.json()) as AkahuMeResponse;

    if (!response.ok || !data.success || !data.item) {
      return {
        status: "error",
        message: data.message ?? `Akahu returned HTTP ${response.status}`,
      };
    }

    return {
      status: "connected",
      user: {
        id: data.item._id,
        email: data.item.email,
        accessGrantedAt: data.item.access_granted_at,
      },
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Could not reach Akahu",
    };
  }
}

export async function verifyAkahuTokens(tokens: AkahuTokens) {
  return getAkahuConnection(tokens);
}

export async function triggerAkahuRefresh(tokens: AkahuTokens): Promise<void> {
  try {
    await fetch(`${AKAHU_API_URL}/refresh`, {
      method: "POST",
      headers: headers(tokens),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Best-effort — if Akahu is busy or we're within the 5-min cooldown, ignore it
  }
}

export async function getAkahuAccounts(
  tokens: AkahuTokens,
): Promise<AkahuAccounts> {
  try {
    const response = await fetch(`${AKAHU_API_URL}/accounts`, {
      headers: headers(tokens),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await response.json()) as AkahuAccountsResponse;

    if (!response.ok || !data.success || !data.items) {
      return {
        status: "error",
        message: data.message ?? `Akahu returned HTTP ${response.status}`,
      };
    }

    return {
      status: "success",
      accounts: data.items.map((account) => ({
        id: account._id,
        name: account.name,
        status: account.status,
        type: account.type,
        attributes: account.attributes,
        formattedAccount: account.formatted_account,
        institution: account.connection.name,
        balance: account.balance,
        balanceRefreshedAt: account.refreshed?.balance,
      })),
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Could not reach Akahu",
    };
  }
}

export async function getAkahuAccountTransactions(
  tokens: AkahuTokens,
  accountId: string,
  start: Date,
  end: Date,
): Promise<AkahuTransactions> {
  const transactions: AkahuTransaction[] = [];
  let cursor: string | null | undefined;

  try {
    for (let page = 0; page < 100; page += 1) {
      const query = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
      });
      if (cursor) query.set("cursor", cursor);

      const response = await fetch(
        `${AKAHU_API_URL}/accounts/${encodeURIComponent(accountId)}/transactions?${query}`,
        {
          headers: headers(tokens),
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        },
      );
      const data = (await response.json()) as AkahuTransactionsResponse;

      if (!response.ok || !data.success || !data.items) {
        return {
          status: "error",
          message: data.message ?? `Akahu returned HTTP ${response.status}`,
        };
      }

      transactions.push(
        ...data.items.map((transaction) => ({
          id: transaction._id,
          date: transaction.date,
          description: transaction.description,
          amount: transaction.amount,
          type: transaction.type,
          merchant: transaction.merchant?.name,
          category: transaction.category?.name,
          categoryGroup:
            transaction.category?.groups?.personal_finance?.name,
        })),
      );

      cursor = data.cursor?.next;
      if (!cursor) {
        return { status: "success", transactions };
      }
    }

    return {
      status: "error",
      message: "Akahu returned too many transaction pages",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Could not reach Akahu",
    };
  }
}
