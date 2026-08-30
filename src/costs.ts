// Agencia ("widgets de costo real en /admin"): tarifas públicas de OpenAI
// (USD), verificadas en developers.openai.com/api/docs/pricing el
// 2026-08-30. Esto es un ESTIMADO real calculado sobre uso real — nunca un
// número inventado — pero las tarifas pueden cambiar del lado de OpenAI sin
// que este archivo se actualice solo; si algo se ve raro, empezar por
// revisar si cambiaron los precios publicados.
const CHAT_PRICING_PER_MILLION_TOKENS: Record<string, { prompt: number; completion: number }> = {
  "gpt-4o-mini": { prompt: 0.15, completion: 0.6 },
};

const EMBEDDING_PRICING_PER_MILLION_TOKENS: Record<string, number> = {
  "text-embedding-3-small": 0.02,
};

const WHISPER_PER_MINUTE_USD: Record<string, number> = {
  "whisper-1": 0.006,
};

export interface UsageCostInput {
  model: string;
  promptTokens: number;
  completionTokens: number;
  audioSeconds: number | null;
}

// Modelo desconocido (ej. uno nuevo agregado sin actualizar este archivo)
// devuelve 0 en vez de inventar un precio — mejor un total visiblemente
// incompleto (investigable) que uno silenciosamente incorrecto.
export function estimateCostUsd(row: UsageCostInput): number {
  if (row.model in WHISPER_PER_MINUTE_USD) {
    return ((row.audioSeconds ?? 0) / 60) * WHISPER_PER_MINUTE_USD[row.model];
  }
  if (row.model in EMBEDDING_PRICING_PER_MILLION_TOKENS) {
    return (row.promptTokens / 1_000_000) * EMBEDDING_PRICING_PER_MILLION_TOKENS[row.model];
  }
  const chatPricing = CHAT_PRICING_PER_MILLION_TOKENS[row.model];
  if (!chatPricing) return 0;
  return (row.promptTokens / 1_000_000) * chatPricing.prompt + (row.completionTokens / 1_000_000) * chatPricing.completion;
}
