import { describe, expect, it, vi } from "vitest";
import { dismissKbGap, listKbGaps, recordKbGap } from "../src/rag/gaps";

function mockDb(allResults: unknown[] = []) {
  const all = vi.fn().mockResolvedValue({ results: allResults });
  const run = vi.fn().mockResolvedValue({ success: true });
  const bind = vi.fn().mockReturnValue({ all, run });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { db: { prepare } as unknown as D1Database, prepare, bind, run, all };
}

describe("recordKbGap", () => {
  it("inserta la pregunta con tenant_id", async () => {
    const { db, prepare, bind } = mockDb();
    await recordKbGap(db, "vet-ch", "¿Atienden reptiles?");
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO kb_gaps"));
    expect(bind).toHaveBeenCalledWith("vet-ch", "¿Atienden reptiles?");
  });
});

describe("listKbGaps", () => {
  it("mapea las filas a camelCase, más recientes primero", async () => {
    const { db } = mockDb([
      { id: 2, question: "¿Atienden reptiles?", created_at: "2026-09-01T10:00:00Z" },
      { id: 1, question: "¿Hay servicio a domicilio?", created_at: "2026-09-01T09:00:00Z" },
    ]);
    const gaps = await listKbGaps(db, "vet-ch");
    expect(gaps).toEqual([
      { id: 2, question: "¿Atienden reptiles?", createdAt: "2026-09-01T10:00:00Z" },
      { id: 1, question: "¿Hay servicio a domicilio?", createdAt: "2026-09-01T09:00:00Z" },
    ]);
  });
});

describe("dismissKbGap", () => {
  it("borra por id Y tenant_id (nunca solo por id)", async () => {
    const { db, prepare, bind } = mockDb();
    await dismissKbGap(db, "vet-ch", 7);
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM kb_gaps"));
    expect(bind).toHaveBeenCalledWith(7, "vet-ch");
  });
});
