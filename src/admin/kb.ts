import { embedText } from "../rag/embeddings";

export interface KbDocInput {
  id: string;
  content: string;
}

// Etapa 9 (D8): "crear namespace de KB" para un tenant nuevo, sin CLI —
// hasta Etapa 8 esto requería scripts/seed-kb.mjs + wrangler vectorize
// upsert a mano. D4: cada vector lleva tenant_id en la metadata.
export async function ingestKbDocs(
  vectorize: VectorizeIndex,
  openaiApiKey: string,
  tenantId: string,
  docs: KbDocInput[],
): Promise<number> {
  const vectors = await Promise.all(
    docs.map(async (doc) => {
      const values = await embedText(openaiApiKey, doc.content);
      return {
        id: `${tenantId}:${doc.id}`,
        values,
        metadata: { tenant_id: tenantId, doc_id: doc.id, content: doc.content },
      };
    }),
  );

  await vectorize.upsert(vectors);
  return vectors.length;
}
