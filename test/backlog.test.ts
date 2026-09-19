import { describe, expect, it, vi } from "vitest";
import { createBacklogItem, deleteBacklogItem, getBacklogItem, listBacklogItems, updateBacklogItem } from "../src/backlog";

function mockDb(overrides?: { all?: unknown; first?: unknown }) {
  const run = vi.fn().mockResolvedValue({ success: true, meta: { last_row_id: 1 } });
  const all = vi.fn().mockResolvedValue(overrides?.all ?? { results: [] });
  const first = vi.fn().mockResolvedValue(overrides?.first ?? null);
  const bind = vi.fn().mockReturnValue({ run, all, first });
  // listBacklogItems llama .all() directo sobre prepare() sin .bind() (no
  // tiene parámetros) — el statement necesita all/first/run también sin pasar por bind().
  const prepare = vi.fn().mockReturnValue({ bind, run, all, first });
  return { db: { prepare } as unknown as D1Database, prepare, bind, run, all, first };
}

describe("listBacklogItems", () => {
  it("mapea las filas de snake_case a camelCase", async () => {
    const { db } = mockDb({
      all: {
        results: [
          { id: 1, title: "Agregar SMS", description: "recordatorios", status: "pendiente", created_by: "oscar@x.com", result_notes: null, created_at: "t1", updated_at: "t1" },
        ],
      },
    });
    const items = await listBacklogItems(db);
    expect(items).toEqual([
      { id: 1, title: "Agregar SMS", description: "recordatorios", status: "pendiente", createdBy: "oscar@x.com", resultNotes: null, createdAt: "t1", updatedAt: "t1" },
    ]);
  });
});

describe("createBacklogItem", () => {
  it("inserta title, description y createdBy", async () => {
    const { db, prepare, bind } = mockDb();
    await createBacklogItem(db, { title: "Nueva tarea", description: "detalle", createdBy: "oscar@x.com" });
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO backlog_items"));
    expect(bind).toHaveBeenCalledWith("Nueva tarea", "detalle", "oscar@x.com");
  });
});

describe("updateBacklogItem", () => {
  it("cambiar solo el status no debe pisar title/description/resultNotes (COALESCE)", async () => {
    const { db, bind } = mockDb();
    await updateBacklogItem(db, 5, { status: "en_progreso" });
    // title=null (COALESCE preserva), description CASE con flag 0 (no tocar), resultNotes CASE con flag 0.
    expect(bind).toHaveBeenCalledWith(null, 0, null, "en_progreso", 0, null, 5);
  });

  it("dejar resultNotes explícito SÍ lo actualiza, con el flag en 1", async () => {
    const { db, bind } = mockDb();
    await updateBacklogItem(db, 5, { resultNotes: "Implementado y desplegado." });
    expect(bind).toHaveBeenCalledWith(null, 0, null, null, 1, "Implementado y desplegado.", 5);
  });

  it("description explícito null (borrarla) SÍ se aplica, distinto de no mandarla", async () => {
    const { db, bind } = mockDb();
    await updateBacklogItem(db, 5, { description: null });
    expect(bind).toHaveBeenCalledWith(null, 1, null, null, 0, null, 5);
  });
});

describe("deleteBacklogItem", () => {
  it("borra por id", async () => {
    const { db, prepare, bind } = mockDb();
    await deleteBacklogItem(db, 7);
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM backlog_items"));
    expect(bind).toHaveBeenCalledWith(7);
  });
});

describe("getBacklogItem", () => {
  it("devuelve null si no existe", async () => {
    const { db } = mockDb({ first: null });
    expect(await getBacklogItem(db, 999)).toBeNull();
  });

  it("mapea la fila si existe", async () => {
    const { db } = mockDb({
      first: { id: 3, title: "T", description: null, status: "terminada", created_by: null, result_notes: "listo", created_at: "t1", updated_at: "t2" },
    });
    const item = await getBacklogItem(db, 3);
    expect(item?.status).toBe("terminada");
    expect(item?.resultNotes).toBe("listo");
  });
});
