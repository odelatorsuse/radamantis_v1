-- Agencia (Fase 2b: catálogo con fotos — inmobiliaria/restaurante/
-- panadería/tienda). Autoservicio desde /console, mismo patrón que
-- kb_documents (Etapa Agencia, "Conocimiento"): fuente de verdad simple en
-- D1, sin Vectorize — un catálogo de negocio (propiedades, platillos,
-- productos) es chico, un LIKE contra título+descripción alcanza, no
-- necesita búsqueda semántica. photo_url es una URL que el propio negocio
-- pega (mismo patrón ya usado para el logo del White-label) — Radamantis
-- no aloja archivos, evita construir subida/almacenamiento propio (R2)
-- para esto.
CREATE TABLE catalog_items (
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price TEXT,
  photo_url TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, item_id)
);
