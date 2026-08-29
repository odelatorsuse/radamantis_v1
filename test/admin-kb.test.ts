import { describe, expect, it, vi } from "vitest";
import { ingestKbDocs } from "../src/admin/kb";

vi.mock("../src/rag/embeddings", () => ({
  embedText: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

describe("ingestKbDocs", () => {
  it("embebe cada doc y hace upsert con id/metadata prefijados por tenant_id (D4)", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const vectorize = { upsert } as unknown as VectorizeIndex;

    const count = await ingestKbDocs(vectorize, "fake-key", "vet-norte", [
      { id: "horario", content: "9 a 18" },
      { id: "precios", content: "$300" },
    ]);

    expect(count).toBe(2);
    expect(upsert).toHaveBeenCalledWith([
      { id: "vet-norte:horario", values: [0.1, 0.2, 0.3], metadata: { tenant_id: "vet-norte", doc_id: "horario", content: "9 a 18" } },
      { id: "vet-norte:precios", values: [0.1, 0.2, 0.3], metadata: { tenant_id: "vet-norte", doc_id: "precios", content: "$300" } },
    ]);
  });
});
