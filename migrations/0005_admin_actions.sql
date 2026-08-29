-- Etapa 8 (D10): auditoría de acciones de administración — quién dio de
-- alta un tenant/canal o resolvió un handoff, y cuándo.
CREATE TABLE admin_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_admin_actions_tenant ON admin_actions (tenant_id, created_at);
