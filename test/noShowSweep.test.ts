import { afterEach, describe, expect, it, vi } from "vitest";
import { runNoShowSweep } from "../src/noShowSweep";

const DUE_APPOINTMENT_ROW = {
  id: 1,
  tenant_id: "vet-ch",
  channel: "telegram",
  chat_id: "555",
  start_utc: "2026-09-01T16:00:00.000Z",
  end_utc: "2026-09-01T16:30:00.000Z",
  summary: "Consulta general - Firulais",
  attendee_name: "Oscar",
  attendee_contact: "555-0000",
};

// El sweep hace varias queries distintas contra la misma "db" — se
// despachan por contenido del SQL en vez de por orden de llamada, para no
// acoplar el test al orden interno de runNoShowSweep.
function mockDb(opts: { dueRows?: unknown[]; channelToken?: string | null } = {}) {
  const dueRows = opts.dueRows ?? [DUE_APPOINTMENT_ROW];
  const channelToken = opts.channelToken === undefined ? "bot-token-vet-ch" : opts.channelToken;
  const run = vi.fn().mockResolvedValue({ success: true });

  const prepare = vi.fn((sql: string) => ({
    bind: vi.fn(() => ({
      all: vi.fn().mockResolvedValue(sql.includes("FROM appointments") ? { results: dueRows } : { results: [] }),
      first: vi.fn().mockResolvedValue(
        sql.includes("FROM tenant_settings")
          ? null // usa defaults (America/Mexico_City)
          : sql.includes("FROM tenants")
            ? { name: "Dr. Vet CH (piloto)" }
            : sql.includes("FROM channel_bindings")
              ? channelToken !== null
                ? { external_id: channelToken }
                : null
              : null,
      ),
      run,
    })),
  }));

  return { db: { prepare } as unknown as D1Database, run };
}

describe("runNoShowSweep", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("manda el mensaje de recuperación por Telegram y marca la cita como atendida", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const { db, run } = mockDb();

    const result = await runNoShowSweep(db, new Date("2026-09-01T18:00:00Z"));

    expect(result).toEqual({ processed: 1, sent: 1, errors: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("https://api.telegram.org/botbot-token-vet-ch/sendMessage"),
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.chat_id).toBe(555);
    expect(body.text).toContain("Oscar");
    // run() se llama tanto para guardar el mensaje en `messages` como para
    // marcar no_show_followup_sent_at — al menos dos escrituras.
    expect(run).toHaveBeenCalled();
  });

  it("no hace nada si no hay citas vencidas", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { db } = mockDb({ dueRows: [] });

    const result = await runNoShowSweep(db, new Date("2026-09-01T18:00:00Z"));

    expect(result).toEqual({ processed: 0, sent: 0, errors: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("registra el error y sigue si el tenant no tiene channel_binding de telegram, sin tumbar el barrido", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { db } = mockDb({ channelToken: null });

    const result = await runNoShowSweep(db, new Date("2026-09-01T18:00:00Z"));

    expect(result.processed).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toEqual({ appointmentId: 1, error: expect.stringContaining("channel_binding") });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("registra el error si Telegram rechaza el envío, sin marcar la cita como atendida", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "bad request" });
    vi.stubGlobal("fetch", fetchMock);
    const { db, run } = mockDb();

    const result = await runNoShowSweep(db, new Date("2026-09-01T18:00:00Z"));

    expect(result.sent).toBe(0);
    expect(result.errors).toHaveLength(1);
    // No debe haber llamado a run() (ni UPDATE ni appendMessage) si el envío falló.
    expect(run).not.toHaveBeenCalled();
  });
});
