-- Etapa 8.5: config en caliente por tenant (tono/idioma/moneda/override de
-- prompt) — sin redeploy. Fila opcional: si no existe, el core usa defaults.
CREATE TABLE tenant_settings (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants (id),
  tone TEXT NOT NULL DEFAULT 'calido',
  language TEXT NOT NULL DEFAULT 'es',
  currency TEXT NOT NULL DEFAULT 'MXN',
  prompt_override TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
