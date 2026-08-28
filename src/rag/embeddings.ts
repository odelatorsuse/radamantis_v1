interface OpenAIEmbeddingResponse {
  data: { embedding: number[] }[];
}

// Embeddings van directo a OpenAI (no hay equivalente en la interfaz LLMProvider,
// D5 cubre completions de chat). Mismo proveedor que ya usamos para el LLM.
export async function embedText(apiKey: string, text: string): Promise<number[]> {
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
  return data.data[0].embedding;
}
