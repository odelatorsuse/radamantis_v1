import { describe, expect, it, vi } from "vitest";
import { createKbDocument, deleteKbDocument, ingestKbDocs, listKbDocuments, reindexAllKbDocuments, updateKbDocument } from "../src/rag/kb";

vi.mock("../src/rag/embeddings", () => ({
  embedText: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

function mockDb(firstResult: unknown = null, allResults: unknown[] = []) {
  const first = vi.fn().mockResolvedValue(firstResult);
  const all = vi.fn().mockResolvedValue({ results: allResults });
  const run = vi.fn().mockResolvedValue({ success: true });
  const bind = vi.fn().mockReturnValue({ first, all, run });
  const prepare = vi.fn().mockReturnValue({ bind });
  const batch = vi.fn().mockResolvedValue([]);
  return { db: { prepare, batch } as unknown as D1Database, prepare, bind, first, all, run, batch };
}

describe("ingestKbDocs", () => {
  it("embebe cada doc, hace upsert a Vectorize y guarda/actualiza kb_documents en D1", async () => {
    const { db, batch } = mockDb();
    const upsert = vi.fn().mockResolvedValue({});
    const vectorize = { upsert } as unknown as VectorizeIndex;

    const count = await ingestKbDocs(db, vectorize, "fake-key", "vet-norte", [
      { id: "horario", content: "9 a 18", title: "Horario" },
      { id: "precios", content: "$300" },
    ]);

    expect(count).toBe(2);
    expect(upsert).toHaveBeenCalledWith([
      { id: "vet-norte:horario", values: [0.1, 0.2, 0.3], metadata: { tenant_id: "vet-norte", doc_id: "horario", content: "9 a 18" } },
      { id: "vet-norte:precios", values: [0.1, 0.2, 0.3], metadata: { tenant_id: "vet-norte", doc_id: "precios", content: "$300" } },
    ]);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(2);
  });

  it("usa el id como título cuando no se manda uno explícito", async () => {
    const { db, bind } = mockDb();
    const vectorize = { upsert: vi.fn().mockResolvedValue({}) } as unknown as VectorizeIndex;

    await ingestKbDocs(db, vectorize, "fake-key", "vet-norte", [{ id: "precios", content: "$300" }]);

    expect(bind).toHaveBeenCalledWith("vet-norte", "precios", "precios", "$300", 4);
  });
});

describe("listKbDocuments", () => {
  it("mapea las filas a camelCase", async () => {
    const { db } = mockDb(null, [
      { doc_id: "faq", title: "Preguntas Frecuentes", content: "...", char_count: 474, updated_at: "2026-08-30 10:00:00" },
    ]);
    expect(await listKbDocuments(db, "vet-ch")).toEqual([
      { docId: "faq", title: "Preguntas Frecuentes", content: "...", charCount: 474, updatedAt: "2026-08-30 10:00:00" },
    ]);
  });
});

describe("deleteKbDocument", () => {
  it("borra el vector de Vectorize y la fila de D1", async () => {
    const { db, bind } = mockDb();
    const deleteByIds = vi.fn().mockResolvedValue({});
    const vectorize = { deleteByIds } as unknown as VectorizeIndex;

    await deleteKbDocument(db, vectorize, "vet-ch", "faq");

    expect(deleteByIds).toHaveBeenCalledWith(["vet-ch:faq"]);
    expect(bind).toHaveBeenCalledWith("vet-ch", "faq");
  });
});

describe("createKbDocument", () => {
  it("genera un slug a partir del título", async () => {
    const { db } = mockDb(null); // docIdExists -> first() resuelve null -> no existe
    const vectorize = { upsert: vi.fn().mockResolvedValue({}) } as unknown as VectorizeIndex;

    const docId = await createKbDocument(db, vectorize, "fake-key", "vet-ch", "Preguntas Frecuentes", "contenido");

    expect(docId).toBe("preguntas-frecuentes");
  });

  it("agrega un sufijo numérico si el slug ya existe", async () => {
    const first = vi.fn().mockResolvedValueOnce({ 1: 1 }).mockResolvedValueOnce(null);
    const bind = vi.fn().mockReturnValue({ first, run: vi.fn(), all: vi.fn() });
    const prepare = vi.fn().mockReturnValue({ bind });
    const batch = vi.fn().mockResolvedValue([]);
    const db = { prepare, batch } as unknown as D1Database;
    const vectorize = { upsert: vi.fn().mockResolvedValue({}) } as unknown as VectorizeIndex;

    const docId = await createKbDocument(db, vectorize, "fake-key", "vet-ch", "FAQ", "contenido");

    expect(docId).toBe("faq-2");
  });
});

describe("updateKbDocument", () => {
  it("re-embebe con el mismo docId (upsert)", async () => {
    const { db, bind } = mockDb();
    const upsert = vi.fn().mockResolvedValue({});
    const vectorize = { upsert } as unknown as VectorizeIndex;

    await updateKbDocument(db, vectorize, "fake-key", "vet-ch", "faq", "Preguntas Frecuentes", "nuevo contenido");

    expect(upsert).toHaveBeenCalledWith([
      { id: "vet-ch:faq", values: [0.1, 0.2, 0.3], metadata: { tenant_id: "vet-ch", doc_id: "faq", content: "nuevo contenido" } },
    ]);
    expect(bind).toHaveBeenCalledWith("vet-ch", "faq", "Preguntas Frecuentes", "nuevo contenido", "nuevo contenido".length);
  });
});

describe("reindexAllKbDocuments", () => {
  it("re-embebe todos los documentos existentes sin cambiar su contenido", async () => {
    const { db } = mockDb(null, [
      { doc_id: "faq", title: "FAQ", content: "contenido faq", char_count: 13, updated_at: "2026-08-30" },
      { doc_id: "horario", title: "Horario", content: "9 a 18", char_count: 6, updated_at: "2026-08-30" },
    ]);
    const upsert = vi.fn().mockResolvedValue({});
    const vectorize = { upsert } as unknown as VectorizeIndex;

    const count = await reindexAllKbDocuments(db, vectorize, "fake-key", "vet-ch");

    expect(count).toBe(2);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("devuelve 0 sin llamar a Vectorize si no hay documentos", async () => {
    const { db } = mockDb(null, []);
    const upsert = vi.fn();
    const vectorize = { upsert } as unknown as VectorizeIndex;

    expect(await reindexAllKbDocuments(db, vectorize, "fake-key", "vet-ch")).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });
});
