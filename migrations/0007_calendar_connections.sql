-- Etapa 10 (booking real): conexión OAuth de calendario por tenant. Tokens
-- en texto plano (mismo nivel de seguridad "sandbox" que bot tokens/admin
-- key hoy) — cifrado en reposo queda como hardening futuro (Agencia/D10).
CREATE TABLE calendar_connections (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants (id),
  provider TEXT NOT NULL DEFAULT 'google',
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  connected_at TEXT NOT NULL DEFAULT (datetime('now'))
);
