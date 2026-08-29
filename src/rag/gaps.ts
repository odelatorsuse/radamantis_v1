// Etapa 10 (superpower "Mejoras"): rastro de preguntas que el RAG no pudo
// responder con confianza — vive junto a search.ts porque es parte del
// mismo subsistema (RAG), no de la consola del cliente ni del admin;
// ambos lo consumen (agent.ts para registrar, client/routes.ts para listar).
export interface KbGap {
  id: number;
  question: string;
  createdAt: string;
}

export async function recordKbGap(db: D1Database, tenantId: string, question: string): Promise<void> {
  await db.prepare("INSERT INTO kb_gaps (tenant_id, question) VALUES (?, ?)").bind(tenantId, question).run();
}

export async function listKbGaps(db: D1Database, tenantId: string, limit = 50): Promise<KbGap[]> {
  const { results } = await db
    .prepare("SELECT id, question, created_at FROM kb_gaps WHERE tenant_id = ? ORDER BY id DESC LIMIT ?")
    .bind(tenantId, limit)
    .all<{ id: number; question: string; created_at: string }>();
  return results.map((r) => ({ id: r.id, question: r.question, createdAt: r.created_at }));
}

// tenant_id en el WHERE (no solo el id) — sin esto, un tenant podría borrar
// el gap de otro adivinando el id, ya que los ids son autoincrement global.
export async function dismissKbGap(db: D1Database, tenantId: string, id: number): Promise<void> {
  await db.prepare("DELETE FROM kb_gaps WHERE id = ? AND tenant_id = ?").bind(id, tenantId).run();
}
