-- Etapa 4: segundo tenant + aislamiento. D2: channel_bindings resuelve
-- tenant antes de instanciar el DO. El bot_token de Telegram vive aquí
-- (fila en DB, D8) en vez de un secret de Worker — alta de canal = INSERT.
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  vertical_id TEXT NOT NULL DEFAULT 'sandbox',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE channel_bindings (
  channel TEXT NOT NULL,
  external_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (channel, external_id)
);

-- Tenant piloto real (Dr. Vet CH) migrado al modelo multi-tenant.
INSERT INTO tenants (id, name, vertical_id) VALUES ('vet-ch', 'Dr. Vet CH (piloto)', 'veterinaria');

-- Segundo tenant, solo para probar aislamiento en Etapa 4 (sin canal real todavía).
INSERT INTO tenants (id, name, vertical_id) VALUES ('segundo-tenant-test', 'Tenant de prueba (aislamiento)', 'sandbox');
