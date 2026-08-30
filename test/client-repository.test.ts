import { describe, expect, it, vi } from "vitest";
import {
  clearAlertChatId,
  createTenantUser,
  getAppointmentsForCurrentMonth,
  getHealthStatus,
  getOrCreateAlertSettings,
  getPastAppointments,
  getTenantUserByEmail,
  getTodayStats,
  getUniqueClients,
  getUpcomingAppointments,
  getWeeklyActivity,
  listConversations,
  setAlertChatId,
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

describe("getAppointmentsForCurrentMonth", () => {
  it("filtra por mes calendario (strftime) y ordena ASC, incluyendo attended", async () => {
    const { db, prepare, bind } = mockDb(null, [
      { id: 1, start_utc: "2026-08-05 10:00:00", end_utc: "2026-08-05 10:30:00", summary: "Consulta", attendee_name: "Ana", attendee_contact: "555", attended: 1 },
    ]);
    const result = await getAppointmentsForCurrentMonth(db, "vet-ch");
    const sql = prepare.mock.calls[0][0] as string;
    expect(sql).toContain("strftime('%Y-%m', start_utc)");
    expect(sql).toContain("ORDER BY start_utc ASC");
    expect(bind).toHaveBeenCalledWith("vet-ch");
    expect(result).toEqual([
      { id: 1, startUtc: "2026-08-05 10:00:00", endUtc: "2026-08-05 10:30:00", summary: "Consulta", attendeeName: "Ana", attendeeContact: "555", attended: 1 },
    ]);
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

const TENANT_SETTINGS_ROW = {
  tone: "calido",
  language: "es",
  currency: "MXN",
  prompt_override: null,
  timezone: "America/Mexico_City",
  business_hours: "{}",
  alert_chat_id: null,
  alert_activation_code: null,
};

describe("getOrCreateAlertSettings", () => {
  it("devuelve el código existente sin regenerarlo si el tenant ya tiene uno", async () => {
    const { db, run } = mockDb({ ...TENANT_SETTINGS_ROW, alert_activation_code: "ABCD1234", alert_chat_id: "999" });

    const result = await getOrCreateAlertSettings(db, "vet-ch");

    expect(result).toEqual({ activationCode: "ABCD1234", configured: true });
    expect(run).not.toHaveBeenCalled();
  });

  it("genera y guarda un código nuevo si el tenant no tiene uno (primera vez)", async () => {
    const { db, run } = mockDb(null); // getTenantSettings -> DEFAULT_TENANT_SETTINGS (sin fila)

    const result = await getOrCreateAlertSettings(db, "vet-ch");

    expect(result.configured).toBe(false);
    expect(result.activationCode).toMatch(/^[0-9A-F]{8}$/);
    expect(run).toHaveBeenCalledTimes(1); // upsertTenantSettings guardó el código nuevo
  });
});

describe("setAlertChatId / clearAlertChatId", () => {
  it("setAlertChatId guarda el chat_id preservando el resto de la config", async () => {
    const { db, bind } = mockDb({ ...TENANT_SETTINGS_ROW, alert_activation_code: "ABCD1234" });

    await setAlertChatId(db, "vet-ch", "999");

    // El último bind es el del INSERT/upsert — su penúltimo/antepenúltimo
    // argumento corresponde a alert_chat_id/alert_activation_code.
    const lastCall = bind.mock.calls[bind.mock.calls.length - 1];
    expect(lastCall).toContain("999");
    expect(lastCall).toContain("ABCD1234");
  });

  it("clearAlertChatId pone alert_chat_id en null sin tocar el código", async () => {
    const { db, bind } = mockDb({ ...TENANT_SETTINGS_ROW, alert_chat_id: "999", alert_activation_code: "ABCD1234" });

    await clearAlertChatId(db, "vet-ch");

    const lastCall = bind.mock.calls[bind.mock.calls.length - 1];
    expect(lastCall).toContain(null);
    expect(lastCall).toContain("ABCD1234");
  });
});
