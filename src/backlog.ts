// Backlog de Agencia: tablero Kanban en /admin para que Oscar anote
// modificaciones pendientes a Radamantis mismo (no es dato de un tenant —
// ver migración 0035). Módulo de datos propio, mismo patrón que
// src/catalog.ts/src/padel.ts: CRUD simple, sin lógica de negocio extra.

// Ver comentario completo del significado de cada status y quién mueve
// cada tarjeta en src/admin/routes.ts (junto a las rutas /backlog).
export type BacklogStatus = "pendiente" | "aprobado" | "en_espera" | "en_progreso" | "test" | "terminada";

export interface BacklogItem {
  id: number;
  title: string;
  description: string | null;
  status: BacklogStatus;
  createdBy: string | null;
  resultNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BacklogRow {
  id: number;
  title: string;
  description: string | null;
  status: string;
  created_by: string | null;
  result_notes: string | null;
  created_at: string;
  updated_at: string;
}

function mapItem(r: BacklogRow): BacklogItem {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status as BacklogStatus,
    createdBy: r.created_by,
    resultNotes: r.result_notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listBacklogItems(db: D1Database): Promise<BacklogItem[]> {
  const { results } = await db.prepare("SELECT * FROM backlog_items ORDER BY created_at ASC, id ASC").all<BacklogRow>();
  return results.map(mapItem);
}

export async function createBacklogItem(db: D1Database, input: { title: string; description: string | null; createdBy: string | null }): Promise<number> {
  const result = await db
    .prepare("INSERT INTO backlog_items (title, description, created_by) VALUES (?, ?, ?)")
    .bind(input.title, input.description, input.createdBy)
    .run();
  return result.meta.last_row_id as number;
}

// Actualización parcial (mismo patrón que upsertTenantSettings/
// setRegistrationCheckin): solo toca los campos que vienen definidos, para
// que un cambio de status desde el drag-and-drop no borre el título, y
// para que la sesión autónoma pueda dejar result_notes sin tocar lo demás.
export async function updateBacklogItem(
  db: D1Database,
  id: number,
  input: { title?: string; description?: string | null; status?: BacklogStatus; resultNotes?: string | null },
): Promise<void> {
  await db
    .prepare(
      `UPDATE backlog_items SET
         title = COALESCE(?, title),
         description = CASE WHEN ? THEN ? ELSE description END,
         status = COALESCE(?, status),
         result_notes = CASE WHEN ? THEN ? ELSE result_notes END,
         updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(
      input.title ?? null,
      "description" in input ? 1 : 0,
      input.description ?? null,
      input.status ?? null,
      "resultNotes" in input ? 1 : 0,
      input.resultNotes ?? null,
      id,
    )
    .run();
}

export async function deleteBacklogItem(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM backlog_items WHERE id = ?").bind(id).run();
}

export async function getBacklogItem(db: D1Database, id: number): Promise<BacklogItem | null> {
  const row = await db.prepare("SELECT * FROM backlog_items WHERE id = ?").bind(id).first<BacklogRow>();
  return row ? mapItem(row) : null;
}
