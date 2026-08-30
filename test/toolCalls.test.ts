import { describe, expect, it, vi } from "vitest";
import { getToolCallCounts30d, logToolCall } from "../src/toolCalls";

function mockDb(allResults: unknown[] = []) {
  const run = vi.fn().mockResolvedValue({ success: true });
  const all = vi.fn().mockResolvedValue({ results: allResults });
  const bind = vi.fn().mockReturnValue({ run, all });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { db: { prepare } as unknown as D1Database, prepare, bind, run, all };
}

describe("logToolCall", () => {
  it("inserta tenant_id y tool_name", async () => {
    const { db, bind } = mockDb();
    await logToolCall(db, "vet-ch", "searchKb");
    expect(bind).toHaveBeenCalledWith("vet-ch", "searchKb");
  });
});

describe("getToolCallCounts30d", () => {
  it("mapea tool_name a su conteo de los últimos 30 días", async () => {
    const { db } = mockDb([
      { tool_name: "searchKb", count: 12 },
      { tool_name: "bookAppointment", count: 3 },
    ]);
    expect(await getToolCallCounts30d(db, "vet-ch")).toEqual({ searchKb: 12, bookAppointment: 3 });
  });

  it("devuelve un objeto vacío si no hay llamadas registradas", async () => {
    const { db } = mockDb([]);
    expect(await getToolCallCounts30d(db, "vet-ch")).toEqual({});
  });
});
