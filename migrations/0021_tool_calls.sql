-- Agencia ("Flujo", diagrama en vivo del pipeline real): registro de cada
-- vez que el agente ejecuta una capacidad real (searchKb, handoffHuman, o
-- una tool de calendario/feedback) — antes no existía forma de saber
-- cuánto se usa cada una, solo si estaba habilitada o no.
CREATE TABLE tool_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  tool_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tool_calls_tenant_tool ON tool_calls (tenant_id, tool_name, created_at);
