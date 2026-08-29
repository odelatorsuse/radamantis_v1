import { afterEach, describe, expect, it, vi } from "vitest";
import { runDailyReportSweep } from "../src/dailyReport";

const DUE_TENANT_ROW = {
  tenant_id: "vet-ch",
  alert_chat_id: "999",
  timezone: "America/Mexico_City",
  last_daily_report_date: null,
};

// Despacha por contenido del SQL — mismo patrón que noShowSweep.test.ts.
function mockDb(opts: { tenantRows?: unknown[]; channelToken?: string | null } = {}) {
  const tenantRows = opts.tenantRows ?? [DUE_TENANT_ROW];
  const channelToken = opts.channelToken === undefined ? "bot-token-vet-ch" : opts.channelToken;
  const run = vi.fn().mockResolvedValue({ success: true });

  const statement = (sql: string) => ({
    all: vi.fn().mockResolvedValue(sql.includes("FROM tenant_settings") && sql.includes("WHERE alert_chat_id") ? { results: tenantRows } : { results: [] }),
    first: vi.fn().mockResolvedValue(
      sql.includes("FROM messages")
        ? { messages_in: 10, messages_out: 9, unique_clients: 4 }
        : sql.includes("FROM appointments")
          ? { count: 2 }
          : sql.includes("FROM handoffs")
            ? { count: 1 }
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

// 2026-08-29 14:00 UTC = 08:00 en America/Mexico_City (UTC-6) — hora del
// reporte. Ver test/calendar-timezone.test.ts para el mismo patrón de offset.
const AT_8AM_MEXICO_CITY = new Date("2026-08-29T14:00:00Z");

describe("runDailyReportSweep", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("manda el resumen cuando son las 8am hora local del tenant y no se ha mandado hoy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const { db, run } = mockDb();

    const result = await runDailyReportSweep(db, AT_8AM_MEXICO_CITY);

    expect(result).toEqual({ processed: 1, sent: 1, errors: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("https://api.telegram.org/botbot-token-vet-ch/sendMessage"),
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.chat_id).toBe(999);
    expect(body.text).toContain("Mensajes recibidos: 10");
    expect(body.text).toContain("Respuestas del bot: 9");
    expect(body.text).toContain("Clientes distintos: 4");
    expect(body.text).toContain("Citas agendadas: 2");
    expect(body.text).toContain("esperando atención ahora mismo: 1");
    expect(run).toHaveBeenCalled(); // marca last_daily_report_date
  });

  it("no manda nada si no es la hora del reporte en la zona horaria del tenant", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { db } = mockDb();

    // 14:00 UTC = 08:00 en México, pero acá probamos con las 20:00 UTC = 14:00 local.
    const result = await runDailyReportSweep(db, new Date("2026-08-29T20:00:00Z"));

    expect(result).toEqual({ processed: 0, sent: 0, errors: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no vuelve a mandar si ya se mandó hoy (mismo día local)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { db } = mockDb({ tenantRows: [{ ...DUE_TENANT_ROW, last_daily_report_date: "2026-08-29" }] });

    const result = await runDailyReportSweep(db, AT_8AM_MEXICO_CITY);

    expect(result).toEqual({ processed: 0, sent: 0, errors: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignora tenants sin alert_chat_id configurado (la query ya los excluye, pero por si acaso)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { db } = mockDb({ tenantRows: [] });

    const result = await runDailyReportSweep(db, AT_8AM_MEXICO_CITY);

    expect(result).toEqual({ processed: 0, sent: 0, errors: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("registra el error y sigue si no hay channel_binding, sin marcar el día como enviado", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { db, run } = mockDb({ channelToken: null });

    const result = await runDailyReportSweep(db, AT_8AM_MEXICO_CITY);

    expect(result.sent).toBe(0);
    expect(result.errors[0].error).toContain("channel_binding");
    expect(run).not.toHaveBeenCalled();
  });
});
