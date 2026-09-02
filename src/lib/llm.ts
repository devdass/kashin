import "server-only";

import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/vault";

export type LlmProvider = "openai" | "anthropic" | "custom" | "surplus";

export type LlmSettings = {
  enabled: boolean;
  provider: LlmProvider;
  model: string;
  baseUrl: string | null;
  apiKey: string | null;
};

export type LlmCategorizationInput = {
  id: string;
  date: string;
  description: string;
  merchant?: string | null;
  amount: number;
  type: string;
};

export type LlmCategorizationResult = {
  id: string;
  categoryId: string;
  confidence: number;
  reasoning: string;
};

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  custom: "",
  surplus: "deepseek-v4-flash-0731-fast",
};

export function getLlmSettings(): LlmSettings {
  const row = db
    .prepare("SELECT enabled, provider, model, base_url, api_key_encrypted FROM llm_settings WHERE id = 1")
    .get() as
    | { enabled: number; provider: string; model: string; base_url: string | null; api_key_encrypted: string | null }
    | undefined;
  if (!row) {
    return { enabled: false, provider: "openai", model: "", baseUrl: null, apiKey: null };
  }
  let apiKey: string | null = null;
  if (row.api_key_encrypted) {
    try {
      apiKey = decryptSecret(row.api_key_encrypted);
    } catch {
      apiKey = null;
    }
  }
  return {
    enabled: row.enabled === 1,
    provider: (["openai", "anthropic", "custom", "surplus"].includes(row.provider) ? row.provider : "openai") as LlmProvider,
    model: row.model,
    baseUrl: row.base_url,
    apiKey,
  };
}

export function saveLlmSettings(settings: {
  enabled: boolean;
  provider: LlmProvider;
  model: string;
  baseUrl: string | null;
  apiKey: string | null;
}) {
  const existing = getLlmSettings();
  const apiKey = settings.apiKey !== null && settings.apiKey !== "" ? encryptSecret(settings.apiKey) : existing.apiKey;
  db.prepare(`
    INSERT INTO llm_settings (id, enabled, provider, model, base_url, api_key_encrypted, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      enabled = excluded.enabled,
      provider = excluded.provider,
      model = excluded.model,
      base_url = excluded.base_url,
      api_key_encrypted = excluded.api_key_encrypted,
      updated_at = excluded.updated_at
  `).run(
    settings.enabled ? 1 : 0,
    settings.provider,
    settings.model,
    settings.baseUrl || null,
    apiKey === null ? null : apiKey,
    new Date().toISOString(),
  );
}

function endpointUrl(settings: LlmSettings): string | null {
  if (!settings.apiKey) return null;
  const key = settings.apiKey.trim();
  if (key.length === 0) return null;
  return key;
}

function buildPrompt(transactions: LlmCategorizationInput[], categories: string[]) {
  const lines = transactions.map(
    (t) =>
      `- ${t.date} | ${t.description} | ${t.merchant ?? ""} | ${t.type} | ${t.amount}`,
  );
  return [
    "You are a transaction categorisation engine for a personal finance app.",
    "Assign each transaction exactly one category from the provided list.",
    "Respond with ONLY a JSON array, no prose, one object per transaction in the same order:",
    '[{"id":"<original id>","category":"<category>","confidence":0-1,"reasoning":"short reason"}]',
    "",
    `Available categories: ${categories.join(", ")}`,
    "",
    "Transactions:",
    ...lines,
  ].join("\n");
}

function parseJsonArray(text: string): Array<Record<string, unknown>> {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("No JSON array found in model response");
  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed)) throw new Error("Model response is not an array");
  return parsed;
}

async function callProvider(
  settings: LlmSettings,
  prompt: string,
): Promise<string> {
  const apiKey = endpointUrl(settings);
  if (!apiKey) throw new Error("No API key configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    if (settings.provider === "anthropic") {
      const base = settings.baseUrl || "https://api.anthropic.com";
      const response = await fetch(`${base.replace(/\/$/, "")}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: settings.model || DEFAULT_MODELS.anthropic,
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Anthropic API ${response.status}: ${await response.text()}`);
      }
      const data = (await response.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text = (data.content ?? [])
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");
      return text;
    }

    // openai, custom, and surplus all speak the OpenAI chat completions format.
    const base =
      settings.provider === "custom"
        ? settings.baseUrl || "http://localhost:11434/v1"
        : settings.provider === "surplus"
          ? settings.baseUrl || "https://api.surplusintelligence.ai/v1"
          : settings.baseUrl || "https://api.openai.com/v1";
    const response = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model || DEFAULT_MODELS[settings.provider],
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`LLM API ${response.status}: ${await response.text()}`);
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Categorise a batch of transactions with the configured LLM provider.
 * Returns results keyed to the input ids. Throws if the provider call fails.
 */
export async function categorizeWithLlm(
  transactions: LlmCategorizationInput[],
  categoryNames: string[],
): Promise<LlmCategorizationResult[]> {
  const settings = getLlmSettings();
  if (!settings.enabled) throw new Error("LLM categorisation is not enabled");
  if (!settings.apiKey) throw new Error("LLM API key is not configured");
  if (transactions.length === 0) return [];

  const prompt = buildPrompt(transactions, categoryNames);
  const raw = await callProvider(settings, prompt);
  const parsed = parseJsonArray(raw);

  const categories = db
    .prepare("SELECT id, name FROM categories WHERE archived = 0")
    .all() as Array<{ id: string; name: string }>;
  const nameToId = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

  const results: LlmCategorizationResult[] = [];
  for (const item of parsed) {
    const id = String(item.id ?? "");
    const transaction = transactions.find((t) => t.id === id);
    if (!transaction) continue;
    const categoryName = String(item.category ?? "").trim();
    const categoryId = nameToId.get(categoryName.toLowerCase());
    if (!categoryId) continue;
    const confidence = Number(item.confidence);
    results.push({
      id,
      categoryId,
      confidence: Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 1) : 0.75,
      reasoning: String(item.reasoning ?? "").slice(0, 300),
    });
  }
  return results;
}

export async function testLlmConnection(): Promise<{ ok: boolean; message: string }> {
  const settings = getLlmSettings();
  if (!settings.apiKey) return { ok: false, message: "No API key configured" };
  try {
    const result = await callProvider(
      settings,
      "Reply with a JSON array: []",
    );
    return { ok: true, message: result.slice(0, 200) || "Connected" };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Connection failed",
    };
  }
}