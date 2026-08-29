-- Etapa Agencia (Equipo/roles): login propio por persona en el panel
-- super-admin, en vez del ADMIN_API_KEY compartido. No está atado a un
-- tenant (a diferencia de tenant_users) — un admin/operador ve todos los
-- tenants, según su rol. ADMIN_API_KEY sigue funcionando como llave
-- maestra (automatización/Skill de Claude), esto es solo para personas
-- usando el panel web.
CREATE TABLE admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'operador')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
