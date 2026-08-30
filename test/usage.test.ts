import { describe, expect, it, vi } from "vitest";
import { logUsage } from "../src/usage";

describe("logUsage", () => {
  it("inserta tenant_id, canal, modelo y tokens en usage_log", async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const bind = vi.fn().mockReturnValue({ run });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    await logUsage(db, {
      tenantId: "sandbox",
      channel: "telegram",
      model: "gpt-4o-mini",
      usage: { promptTokens: 10, completionTokens: 5 },
    });

    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO usage_log"));
    expect(bind).toHaveBeenCalledWith("sandbox", "telegram", "gpt-4o-mini", 10, 5, null);
    expect(run).toHaveBeenCalled();
  });

  it("guarda audioSeconds cuando se manda (ej. whisper-1)", async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const bind = vi.fn().mockReturnValue({ run });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    await logUsage(db, {
      tenantId: "sandbox",
      channel: "telegram",
      model: "whisper-1",
      usage: { promptTokens: 0, completionTokens: 0 },
      audioSeconds: 12.5,
    });

    expect(bind).toHaveBeenCalledWith("sandbox", "telegram", "whisper-1", 0, 0, 12.5);
  });
});
