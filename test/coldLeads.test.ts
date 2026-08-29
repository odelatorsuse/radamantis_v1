import { afterEach, describe, expect, it, vi } from "vitest";
import { runColdLeadSweep } from "../src/coldLeads";

const COLD_CONVERSATION_ROW = {
  channel: "telegram",
  chat_id: "555",
  last_message_at: "2026-09-01T10:00:00.000Z",
  last_role: "assistant",
  last_user_message: "¿cuánto cuesta la consulta?",
};

// Despacha por contenido del SQL, mismo patrón que noShowSweep.test.ts/
// dailyReport.test.ts.
function mockDb(
  opts: {
    enabledTenants?: string[];
    conversations?: unknown[];
    appointmentCount?: number;
    reengagementRow?: unknown | null;
    channelToken?: string | null;
  } = {},
) {
  const enabledTenants = opts.enabledTenants ?? ["vet-ch"];
  const conversations = opts.conversations ?? [COLD_CONVERSATION_ROW];
  const appointmentCount = opts.appointmentCount ?? 0;
  const reengagementRow = opts.reengagementRow === undefined ? null : opts.reengagementRow;
  const channelToken = opts.channelToken === undefined ? "bot-token-vet-ch" : opts.channelToken;
  const run = vi.fn().mockResolvedValue({ success: true });

  const statement = (sql: string) => ({
    all: vi.fn().mockResolvedValue(
      sql.includes("lead_reengagement_enabled = 1")
        ? { results: enabledTenants.map((tenant_id) => ({ tenant_id })) }
        : sql.includes("FROM messages")
          ? { results: conversations }
          : { results: [] },
    ),
    first: vi.fn().mockResolvedValue(
      sql.includes("FROM appointments")
        ? { count: appointmentCount }
        : sql.includes("FROM lead_reengagement")
          ? reengagementRow
          : sql.includes("FROM channel_bindings")
            ? channelToken !== null
              ? { external_id: channelToken }
              : null
            : null,
    ),
    run,
  });

  const prepare = vi.fn((sql: string) => {
    const stmt = statement(sql);
    return { ...stmt, bind: vi.fn(() => stmt) };
  });

  return { db: { prepare } as unknown as D1Database, run };
}

describe("runColdLeadSweep", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("manda el reenganche a una conversación fría, sin cita asociada, sin intentos previos", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const { db, run } = mockDb();

    const result = await runColdLeadSweep(db);

    expect(result).toEqual({ processed: 1, sent: 1, errors: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("https://api.telegram.org/botbot-token-vet-ch/sendMessage"),
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.chat_id).toBe(555);
    expect(body.text).toContain("¿cuánto cuesta la consulta?");
    expect(run).toHaveBeenCalled(); // marca el intento
  });

  it("no manda nada si el tenant no tiene el reenganche activado", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { db } = mockDb({ enabledTenants: [] });

    const result = await runColdLeadSweep(db);

    expect(result).toEqual({ processed: 0, sent: 0, errors: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no manda nada si la conversación ya generó una cita (no está 'fría', ya convirtió)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { db } = mockDb({ appointmentCount: 1 });

    const result = await runColdLeadSweep(db);

    expect(result.sent).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no manda nada si ya se agotaron los 2 intentos", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { db } = mockDb({ reengagementRow: { attempts: 2, last_attempt_at: "2026-08-01 10:00:00" } });

    const result = await runColdLeadSweep(db);

    expect(result.sent).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no reintenta el 2do intento antes de que pase el mismo umbral desde el 1ro", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // last_attempt_at "ahora mismo" — todavía no pasaron las 5h del umbral.
    const nowSqlite = new Date().toISOString().slice(0, 19).replace("T", " ");
    const { db } = mockDb({ reengagementRow: { attempts: 1, last_attempt_at: nowSqlite } });

    const result = await runColdLeadSweep(db);

    expect(result.sent).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sí reintenta el 2do intento si ya pasó el umbral desde el 1ro", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const longAgo = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
    const { db } = mockDb({ reengagementRow: { attempts: 1, last_attempt_at: longAgo } });

    const result = await runColdLeadSweep(db);

    expect(result.sent).toBe(1);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("registra el error y sigue si no hay channel_binding, sin tumbar el barrido", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { db, run } = mockDb({ channelToken: null });

    const result = await runColdLeadSweep(db);

    expect(result.sent).toBe(0);
    expect(result.errors[0].error).toContain("channel_binding");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("usa un mensaje genérico si no hay un último mensaje del cliente registrado", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const { db } = mockDb({ conversations: [{ ...COLD_CONVERSATION_ROW, last_user_message: null }] });

    await runColdLeadSweep(db);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).toContain("¿Sigues interesado?");
  });
});
