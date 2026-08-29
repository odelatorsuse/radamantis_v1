import { afterEach, describe, expect, it, vi } from "vitest";
import { executeFeedbackTool } from "../src/calendar/feedbackTool";

const ref = { tenantId: "vet-ch", channel: "telegram", chatId: "555" };

// Despacha por contenido del SQL — mismo patrón que otros módulos con
// varias queries distintas contra la misma "db".
function mockDb(opts: { appointmentId?: number | null; alertChatId?: string | null; channelToken?: string | null } = {}) {
  const appointmentId = opts.appointmentId === undefined ? 7 : opts.appointmentId;
  const alertChatId = opts.alertChatId === undefined ? null : opts.alertChatId;
  const channelToken = opts.channelToken === undefined ? "bot-token-vet-ch" : opts.channelToken;
  const run = vi.fn().mockResolvedValue({ success: true });

  const prepare = vi.fn((sql: string) => ({
    bind: vi.fn(() => ({
      first: vi.fn().mockResolvedValue(
        sql.includes("no_show_followup_sent_at IS NOT NULL")
          ? appointmentId !== null
            ? { id: appointmentId }
            : null
          : sql.includes("FROM tenant_settings")
            ? {
                tone: "calido",
                language: "es",
                currency: "MXN",
                prompt_override: null,
                timezone: "America/Mexico_City",
                business_hours: "{}",
                alert_chat_id: alertChatId,
                alert_activation_code: null,
                review_link: null,
              }
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

describe("executeFeedbackTool", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("devuelve error con JSON inválido", async () => {
    const { db } = mockDb();
    const result = await executeFeedbackTool(db, ref, "{not json");
    expect(JSON.parse(result)).toEqual({ error: "Argumentos inválidos" });
  });

  it("devuelve error si falta 'attended'", async () => {
    const { db } = mockDb();
    const result = await executeFeedbackTool(db, ref, JSON.stringify({ rating: 5 }));
    expect(JSON.parse(result).error).toContain("attended");
  });

  it("devuelve error si no hay una cita reciente con seguimiento enviado", async () => {
    const { db } = mockDb({ appointmentId: null });
    const result = await executeFeedbackTool(db, ref, JSON.stringify({ attended: true, rating: 5 }));
    expect(JSON.parse(result).error).toContain("No se encontró");
  });

  it("guarda attended:false sin avisar al dueño (no aplica calificación)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { db, run } = mockDb({ alertChatId: "999" });

    const result = await executeFeedbackTool(db, ref, JSON.stringify({ attended: false }));

    expect(JSON.parse(result)).toEqual({ ok: true });
    expect(run).toHaveBeenCalledTimes(1); // solo el UPDATE de feedback, sin alerta
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calificación alta (4-5): guarda feedback, no avisa al dueño", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { db } = mockDb({ alertChatId: "999" });

    const result = await executeFeedbackTool(db, ref, JSON.stringify({ attended: true, rating: 5, comment: "Excelente" }));

    expect(JSON.parse(result)).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calificación baja (1-3): avisa al dueño vía Vigilante (mismo alert_chat_id)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const { db } = mockDb({ alertChatId: "999" });

    await executeFeedbackTool(db, ref, JSON.stringify({ attended: true, rating: 2, comment: "Esperé mucho" }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("https://api.telegram.org/botbot-token-vet-ch/sendMessage"),
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).toContain("2/5");
    expect(body.text).toContain("Esperé mucho");
  });
});
