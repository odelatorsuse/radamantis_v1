import { slugify } from "./slug";

// Agencia (Fase 2b: catálogo con fotos): autoservicio desde /console, mismo
// patrón que rag/kb.ts ("Conocimiento") — el dueño del negocio solo
// captura un título, se deriva un slug legible como item_id. Sin
// Vectorize: un catálogo de negocio es chico, un LIKE contra
// título+descripción alcanza (ver migración 0029).

export interface CatalogItem {
  itemId: string;
  title: string;
  description: string;
  price: string | null;
  photoUrl: string | null;
  updatedAt: string;
}

interface CatalogItemRow {
  item_id: string;
  title: string;
  description: string;
  price: string | null;
  photo_url: string | null;
  updated_at: string;
}

function mapRow(r: CatalogItemRow): CatalogItem {
  return { itemId: r.item_id, title: r.title, description: r.description, price: r.price, photoUrl: r.photo_url, updatedAt: r.updated_at };
}

export async function listCatalogItems(db: D1Database, tenantId: string): Promise<CatalogItem[]> {
  const { results } = await db
    .prepare("SELECT item_id, title, description, price, photo_url, updated_at FROM catalog_items WHERE tenant_id = ? ORDER BY updated_at DESC")
    .bind(tenantId)
    .all<CatalogItemRow>();
  return results.map(mapRow);
}

async function itemIdExists(db: D1Database, tenantId: string, itemId: string): Promise<boolean> {
  const row = await db.prepare("SELECT 1 FROM catalog_items WHERE tenant_id = ? AND item_id = ?").bind(tenantId, itemId).first();
  return row !== null;
}

export async function createCatalogItem(
  db: D1Database,
  tenantId: string,
  title: string,
  description: string,
  price: string | null,
  photoUrl: string | null,
): Promise<string> {
  const base = slugify(title, "item");
  let itemId = base;
  let n = 2;
  while (await itemIdExists(db, tenantId, itemId)) {
    itemId = `${base}-${n}`;
    n++;
  }
  await db
    .prepare("INSERT INTO catalog_items (tenant_id, item_id, title, description, price, photo_url) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(tenantId, itemId, title, description, price, photoUrl)
    .run();
  return itemId;
}

export async function updateCatalogItem(
  db: D1Database,
  tenantId: string,
  itemId: string,
  title: string,
  description: string,
  price: string | null,
  photoUrl: string | null,
): Promise<void> {
  await db
    .prepare(
      "UPDATE catalog_items SET title = ?, description = ?, price = ?, photo_url = ?, updated_at = datetime('now') WHERE tenant_id = ? AND item_id = ?",
    )
    .bind(title, description, price, photoUrl, tenantId, itemId)
    .run();
}

export async function deleteCatalogItem(db: D1Database, tenantId: string, itemId: string): Promise<void> {
  await db.prepare("DELETE FROM catalog_items WHERE tenant_id = ? AND item_id = ?").bind(tenantId, itemId).run();
}

// Búsqueda real que usa la tool del bot (src/catalogTool.ts) — LIKE simple
// contra título y descripción, nunca resultados inventados: si no hay
// match, la lista viene vacía y el modelo debe decirlo así, no adivinar.
export async function searchCatalogItems(db: D1Database, tenantId: string, query: string, limit = 3): Promise<CatalogItem[]> {
  const like = `%${query.trim()}%`;
  const { results } = await db
    .prepare(
      "SELECT item_id, title, description, price, photo_url, updated_at FROM catalog_items WHERE tenant_id = ? AND (title LIKE ? OR description LIKE ?) ORDER BY updated_at DESC LIMIT ?",
    )
    .bind(tenantId, like, like, limit)
    .all<CatalogItemRow>();
  return results.map(mapRow);
}
