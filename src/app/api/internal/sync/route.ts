import { getAkahuTokens } from "@/lib/credentials";
import { syncFinanceData } from "@/lib/finance-sync";
import { revalidatePath } from "next/cache";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("Authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokens = getAkahuTokens();
  if (!tokens) {
    return Response.json({ error: "Akahu tokens not configured" }, { status: 503 });
  }

  const result = await syncFinanceData(tokens);
  revalidatePath("/", "layout");

  return Response.json(result, { status: result.status === "success" ? 200 : 500 });
}
