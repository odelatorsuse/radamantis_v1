-- Etapa 2: instrumentación de costos (tokens OpenAI). tenant_id ya presente
-- aunque hoy solo exista el tenant sandbox — la resolución real llega en Etapa 4.
CREATE TABLE usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_usage_log_tenant ON usage_log (tenant_id);
