-- Etapa 10 (consola del cliente, D10): login propio por tenant — separado
-- del ADMIN_API_KEY de super-admin (compartido, para Oscar). Cada cliente
-- entra solo a los datos de su propio tenant_id.
CREATE TABLE tenant_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
