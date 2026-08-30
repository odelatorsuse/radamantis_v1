import { embedText } from "./embeddings";

// Etapa Agencia ("Conocimiento" en /console, autoservicio del dueño del
// negocio): Vectorize solo soporta búsqueda por similitud, no "listar
// todos los vectores de un tenant" — kb_documents (D1) es la fuente de
// verdad para listar/editar/borrar documentos individuales. Vectorize
// sigue siendo el único índice que searchKb (rag/search.ts) consulta.

export interface KbDocInput {
  id: string;
  content: string;
  title?: string; // opcional — la carga masiva de /admin no manda título, usa el id.
}

export interface KbDocumentSummary {
  docId: string;
  title: string;
  content: string;
  charCount: number;
  updatedAt: string;
}

export async function ingestKbDocs(
  db: D1Database,
  vectorize: VectorizeIndex,
  openaiApiKey: string,
  tenantId: string,
  docs: KbDocInput[],
): Promise<number> {
  const vectors = await Promise.all(
    docs.map(async (doc) => {
      const values = await embedText(openaiApiKey, doc.content);
      return {
        id: `${tenantId}:${doc.id}`,
        values,
        metadata: { tenant_id: tenantId, doc_id: doc.id, content: doc.content },
      };
    }),
  );
  await vectorize.upsert(vectors);

  await db.batch(
    docs.map((doc) =>
      db
        .prepare(
          `INSERT INTO kb_documents (tenant_id, doc_id, title, content, char_count, updated_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT (tenant_id, doc_id) DO UPDATE SET
             title = excluded.title, content = excluded.content, char_count = excluded.char_count, updated_at = excluded.updated_at`,
        )
        .bind(tenantId, doc.id, doc.title ?? doc.id, doc.content, doc.content.length),
    ),
  );

  return vectors.length;
}

export async function listKbDocuments(db: D1Database, tenantId: string): Promise<KbDocumentSummary[]> {
  const { results } = await db
    .prepare(`SELECT doc_id, title, content, char_count, updated_at FROM kb_documents WHERE tenant_id = ? ORDER BY updated_at DESC`)
    .bind(tenantId)
    .all<{ doc_id: string; title: string; content: string; char_count: number; updated_at: string }>();
  return results.map((r) => ({ docId: r.doc_id, title: r.title, content: r.content, charCount: r.char_count, updatedAt: r.updated_at }));
}

export async function deleteKbDocument(db: D1Database, vectorize: VectorizeIndex, tenantId: string, docId: string): Promise<void> {
  await vectorize.deleteByIds([`${tenantId}:${docId}`]);
  await db.prepare(`DELETE FROM kb_documents WHERE tenant_id = ? AND doc_id = ?`).bind(tenantId, docId).run();
}

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "documento";
}

async function docIdExists(db: D1Database, tenantId: string, docId: string): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 FROM kb_documents WHERE tenant_id = ? AND doc_id = ?`).bind(tenantId, docId).first();
  return row !== null;
}

// Autoservicio (/console): el dueño del negocio solo captura un título,
// no piensa en "id" — se deriva un slug único a partir del título en vez
// de pedirle un identificador técnico.
export async function createKbDocument(
  db: D1Database,
  vectorize: VectorizeIndex,
  openaiApiKey: string,
  tenantId: string,
  title: string,
  content: string,
): Promise<string> {
  const base = slugify(title);
  let docId = base;
  let n = 2;
  while (await docIdExists(db, tenantId, docId)) {
    docId = `${base}-${n}`;
    n++;
  }
  await ingestKbDocs(db, vectorize, openaiApiKey, tenantId, [{ id: docId, title, content }]);
  return docId;
}

export async function updateKbDocument(
  db: D1Database,
  vectorize: VectorizeIndex,
  openaiApiKey: string,
  tenantId: string,
  docId: string,
  title: string,
  content: string,
): Promise<void> {
  await ingestKbDocs(db, vectorize, openaiApiKey, tenantId, [{ id: docId, title, content }]);
}

// Re-embebe todos los documentos ya guardados con su contenido actual —
// operación de autoservicio simple para "por si acaso" (ej. si un vector
// se desincronizó de Vectorize), sin cambiar ningún contenido.
export async function reindexAllKbDocuments(
  db: D1Database,
  vectorize: VectorizeIndex,
  openaiApiKey: string,
  tenantId: string,
): Promise<number> {
  const docs = await listKbDocuments(db, tenantId);
  if (docs.length === 0) return 0;
  return ingestKbDocs(
    db,
    vectorize,
    openaiApiKey,
    tenantId,
    docs.map((d) => ({ id: d.docId, title: d.title, content: d.content })),
  );
}
