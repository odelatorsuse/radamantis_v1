-- Etapa 3: historial de conversación, tenant_id obligatorio (D3) aunque hoy
-- solo exista el tenant sandbox — el aislamiento real se prueba en Etapa 4.
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_messages_conversation ON messages (tenant_id, channel, chat_id, id);
