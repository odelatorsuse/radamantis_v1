import { describe, expect, it, vi } from "vitest";
import {
  createTenantUser,
  getHealthStatus,
  getPastAppointments,
  getTenantUserByEmail,
  getTodayStats,
  getUniqueClients,
  getUpcomingAppointments,
  getWeeklyActivity,
  listConversations,
  setTenantUserPassword,
} from "../src/client/repository";

function mockDb(firstResult: unknown = null, allResults: unknown[] = []) {
  const first = vi.fn().mockResolvedValue(firstResult);
  const all = vi.fn().mockResolvedValue({ results: allResults });
  const run = vi.fn().mockResolvedValue({ success: true });
  const bind = vi.fn().mockReturnValue({ first, all, run });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { db: { prepare } as unknown as D1Database, prepare, bind, first, all, run };
}

describe("getTenantUserByEmail", () => {
  it("mapea la fila a camelCase", async () => {
    const { db } = mockDb({ id: 1, tenant_id: "vet-ch", email: "a@b.com", password_hash: "hash" });
    expect(await getTenantUserByEmail(db, "a@b.com")).toEqual({ id: 1, tenantId: "vet-ch", email: "a@b.com", passwordHash: "hash" });
  });

  it("devuelve null si no existe", async () => {
    const { db } = mockDb(null);
    expect(await getTenantUserByEmail(db, "nadie@nada.com")).toBeNull();
  });
});

describe("createTenantUser / setTenantUserPassword", () => {
  it("inserta con tenant_id, email y password_hash", async () => {
    const { db, prepare, bind } = mockDb();
    await createTenantUser(db, "vet-ch", "a@b.com", "hash");
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO tenant_users"));
    expect(bind).toHaveBeenCalledWith("vet-ch", "a@b.com", "hash");
  });

  it("actualiza password_hash por id", async () => {
    const { db, prepare, bind } = mockDb();
    await setTenantUserPassword(db, 7, "nuevo-hash");
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("UPDATE tenant_users SET password_hash"));
    expect(bind).toHaveBeenCalledWith("nuevo-hash", 7);
  });
});

describe("getTodayStats", () => {
  it("devuelve ceros si no hay fila", async () => {
    const { db } = mockDb(null);
    expect(await getTodayStats(db, "vet-ch")).toEqual({ messagesIn: 0, messagesOut: 0, uniqueClients: 0 });
  });

  it("mapea la fila real", async () => {
    const { db } = mockDb({ messages_in: 5, messages_out: 4, unique_clients: 3 });
    expect(await getTodayStats(db, "vet-ch")).toEqual({ messagesIn: 5, messagesOut: 4, uniqueClients: 3 });
  });
});

describe("getWeeklyActivity", () => {
  it("devuelve siempre 7 días, rellenando con ceros los que no tienen actividad", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-07T12:00:00Z"));
      const { db } = mockDb(null, [{ day: "2026-09-07", messages_in: 2, messages_out: 2 }]);
      const days = await getWeeklyActivity(db, "vet-ch");
      expect(days).toHaveLength(7);
      expect(days[6]).toEqual({ date: "2026-09-07", messagesIn: 2, messagesOut: 2 });
      expect(days[0]).toEqual({ date: "2026-09-01", messagesIn: 0, messagesOut: 0 });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("getUniqueClients", () => {
  it("mapea filas incluyendo datos de la última cita conocida", async () => {
    const { db } = mockDb(null, [
      { channel: "telegram", chat_id: "555", last_seen: "2026-09-01T10:00:00Z", message_count: 3, attendee_name: "Oscar", attendee_contact: "555-0000" },
    ]);
    expect(await getUniqueClients(db, "vet-ch")).toEqual([
      { channel: "telegram", chatId: "555", lastSeen: "2026-09-01T10:00:00Z", messageCount: 3, attendeeName: "Oscar", attendeeContact: "555-0000" },
    ]);
  });
});

describe("getUpcomingAppointments / getPastAppointments", () => {
  it("upcoming usa end_utc >= now ASC", async () => {
    const { db, prepare } = mockDb(null, []);
    await getUpcomingAppointments(db, "vet-ch");
    const sql = prepare.mock.calls[0][0] as string;
    expect(sql).toContain(">=");
    expect(sql).toContain("ASC");
  });

  it("past usa end_utc < now DESC", async () => {
    const { db, prepare } = mockDb(null, []);
    await getPastAppointments(db, "vet-ch");
    const sql = prepare.mock.calls[0][0] as string;
    expect(sql).toContain("<");
    expect(sql).toContain("DESC");
  });
});

describe("getHealthStatus", () => {
  it("combina canales, calendario y última actividad", async () => {
    const run = vi.fn();
    const channelsAll = vi.fn().mockResolvedValue({ results: [{ channel: "telegram" }] });
    const calendarFirst = vi.fn().mockResolvedValue({ tenant_id: "vet-ch" });
    const usageFirst = vi.fn().mockResolvedValue({ last: "2026-09-01T10:00:00Z" });

    let call = 0;
    const prepare = vi.fn().mockImplementation(() => {
      call += 1;
      if (call === 1) return { bind: () => ({ all: channelsAll }) };
      if (call === 2) return { bind: () => ({ first: calendarFirst }) };
      return { bind: () => ({ first: usageFirst }) };
    });
    const db = { prepare } as unknown as D1Database;

    expect(await getHealthStatus(db, "vet-ch")).toEqual({
      channels: ["telegram"],
      calendarConnected: true,
      lastActivityAt: "2026-09-01T10:00:00Z",
    });
    expect(run).not.toHaveBeenCalled();
  });
});

describe("listConversations", () => {
  it("marca paused:true cuando hay un handoff abierto", async () => {
    const { db } = mockDb(null, [
      { channel: "telegram", chat_id: "555", last_message_at: "2026-09-01T10:00:00Z", message_count: 4, last_message: "hola", open_handoff_id: 1 },
      { channel: "telegram", chat_id: "556", last_message_at: "2026-09-01T09:00:00Z", message_count: 2, last_message: "gracias", open_handoff_id: null },
    ]);
    const result = await listConversations(db, "vet-ch");
    expect(result[0].paused).toBe(true);
    expect(result[1].paused).toBe(false);
  });
});
