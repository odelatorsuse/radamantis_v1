-- Etapa 10 (superpower "Mejoras"): registra cada pregunta que el RAG no
-- pudo responder con confianza (todos los matches por debajo de
-- MIN_RELEVANCE_SCORE) — para que el dueño del negocio sepa qué le falta a
-- su base de conocimiento. Nunca se usa para que el bot "se edite solo": la
-- decisión de qué agregar es siempre humana (mismo principio anti-invento).
CREATE TABLE kb_gaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  question TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_kb_gaps_tenant ON kb_gaps (tenant_id, created_at);
