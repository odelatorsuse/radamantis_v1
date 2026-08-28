export interface KbMatch {
  content: string;
  score: number;
}

// D4: índice compartido, siempre filtrado por tenant_id en la metadata —
// nunca una query de Vectorize sin ese filtro.
export async function searchKb(
  vectorize: VectorizeIndex,
  embedding: number[],
  tenantId: string,
  topK = 3,
): Promise<KbMatch[]> {
  const result = await vectorize.query(embedding, {
    topK,
    filter: { tenant_id: tenantId },
    returnMetadata: "all",
  });

  return result.matches
    .filter((match) => typeof match.metadata?.content === "string")
    .map((match) => ({ content: match.metadata!.content as string, score: match.score }));
}
