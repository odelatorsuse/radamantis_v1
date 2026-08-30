interface OpenAIEmbeddingResponse {
  data: { embedding: number[] }[];
  usage: { total_tokens: number };
}

export interface EmbeddingResult {
  embedding: number[];
  totalTokens: number;
}

// Embeddings van directo a OpenAI (no hay equivalente en la interfaz LLMProvider,
// D5 cubre completions de chat). Mismo proveedor que ya usamos para el LLM.
// Devuelve totalTokens (no solo el vector) para que quien llama pueda
// registrar el costo real — ver src/costs.ts.
export async function embedText(apiKey: string, text: string): Promise<EmbeddingResult> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI embeddings falló: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as OpenAIEmbeddingResponse;
  return { embedding: data.data[0].embedding, totalTokens: data.usage?.total_tokens ?? 0 };
}
