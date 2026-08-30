import type { LLMUsage } from "./llm/provider";

export interface UsageLogEntry {
  tenantId: string;
  channel: string;
  model: string;
  usage: LLMUsage;
  // Agencia ("widgets de costo real"): solo para modelos que se facturan
  // por duración (whisper-1), no por tokens — usage.promptTokens/
  // completionTokens se quedan en 0 para esas filas.
  audioSeconds?: number;
}

// D3: tenant_id obligatorio incluso en el único tenant sandbox de hoy.
export async function logUsage(db: D1Database, entry: UsageLogEntry): Promise<void> {
  await db
    .prepare(
      "INSERT INTO usage_log (tenant_id, channel, model, prompt_tokens, completion_tokens, audio_seconds) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(entry.tenantId, entry.channel, entry.model, entry.usage.promptTokens, entry.usage.completionTokens, entry.audioSeconds ?? null)
    .run();
}
