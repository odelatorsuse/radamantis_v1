-- Etapa 6: handoff a humano. Una conversación está "pausada" (el bot deja
-- de auto-responder) mientras tenga un handoff sin resolver. Desbloquearla
-- hoy es manual (UPDATE resolved_at) hasta que exista el dashboard (Etapa 8).
CREATE TABLE handoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE INDEX idx_handoffs_open ON handoffs (tenant_id, channel, chat_id, resolved_at);
