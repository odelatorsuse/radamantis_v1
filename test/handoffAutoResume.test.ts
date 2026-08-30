import { describe, expect, it, vi } from "vitest";
import { runAutoResumeSweep } from "../src/handoffAutoResume";

function mockDb(rows: { id: number }[]) {
  const all = vi.fn().mockResolvedValue({ results: rows });
  const bindSelect = vi.fn().mockReturnValue({ all });
  const bindUpdate = vi.fn().mockReturnValue({});
  const prepare = vi.fn((sql: string) => ({
    bind: sql.startsWith("SELECT") ? bindSelect : bindUpdate,
  }));
  const batch = vi.fn().mockResolvedValue([]);
  const db = { prepare, batch } as unknown as D1Database;
  return { db, prepare, bindSelect, bindUpdate, batch };
}

describe("runAutoResumeSweep", () => {
  it("no hace nada si no hay handoffs elegibles", async () => {
    const { db, batch } = mockDb([]);
    const result = await runAutoResumeSweep(db);
    expect(result).toEqual({ resumed: 0 });
    expect(batch).not.toHaveBeenCalled();
  });

  it("resuelve por batch cada handoff elegible (tenant opt-in, más de 3h)", async () => {
    const { db, batch, bindSelect } = mockDb([{ id: 1 }, { id: 2 }]);
    const result = await runAutoResumeSweep(db);

    expect(result).toEqual({ resumed: 2 });
    expect(bindSelect).toHaveBeenCalledWith("-3 hours");
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(2);
  });

  it("la query filtra por resolved_at IS NULL y auto_resume_handoff_enabled = 1", async () => {
    const { db, prepare } = mockDb([]);
    await runAutoResumeSweep(db);
    const sql = prepare.mock.calls[0][0] as string;
    expect(sql).toContain("h.resolved_at IS NULL");
    expect(sql).toContain("ts.auto_resume_handoff_enabled = 1");
  });
});
