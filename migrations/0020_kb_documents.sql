-- Etapa Agencia (Conocimiento, autoservicio del dueño del negocio en
-- /console): Vectorize no soporta "listar todos los vectores de un
-- tenant" (solo búsquedas por similitud), así que necesitamos una tabla
-- D1 aparte como fuente de verdad para listar/editar/borrar documentos
-- individuales. Vectorize sigue siendo el único índice de búsqueda real
-- (searchKb en agent.ts nunca lee de esta tabla).
CREATE TABLE kb_documents (
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  doc_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  char_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, doc_id)
);
