import { describe, expect, it, vi } from "vitest";
import { deleteCalendarConnection, saveCalendarConnection } from "../src/calendar/repository";

function mockDb() {
  const run = vi.fn().mockResolvedValue({ success: true });
  const bind = vi.fn().mockReturnValue({ run });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { db: { prepare } as unknown as D1Database, prepare, bind, run };
}

describe("saveCalendarConnection", () => {
  it("hace upsert con ON CONFLICT sobre tenant_id", async () => {
    const { db, prepare, bind } = mockDb();
    await saveCalendarConnection(db, {
      tenantId: "vet-ch",
      provider: "google",
      accessToken: "acc",
      refreshToken: "ref",
      expiresAt: "2026-01-01T00:00:00Z",
      calendarId: "primary",
    });
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("ON CONFLICT (tenant_id) DO UPDATE"));
    expect(bind).toHaveBeenCalledWith("vet-ch", "google", "acc", "ref", "2026-01-01T00:00:00Z", "primary");
  });
});

describe("deleteCalendarConnection", () => {
  it("borra por tenant_id", async () => {
    const { db, prepare, bind } = mockDb();
    await deleteCalendarConnection(db, "vet-ch");
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM calendar_connections"));
    expect(bind).toHaveBeenCalledWith("vet-ch");
  });
});
