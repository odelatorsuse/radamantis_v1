import type { LLMUsage } from "./llm/provider";

export interface UsageLogEntry {
  tenantId: string;
  channel: string;
  model: string;
  usage: LLMUsage;
}

// D3: tenant_id obligatorio incluso en el único tenant sandbox de hoy.
export async function logUsage(db: D1Database, entry: UsageLogEntry): Promise<void> {
  await db
    .prepare(
      "INSERT INTO usage_log (tenant_id, channel, model, prompt_tokens, completion_tokens) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(entry.tenantId, entry.channel, entry.model, entry.usage.promptTokens, entry.usage.completionTokens)
    .run();
}
