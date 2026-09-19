import { afterEach, describe, expect, it, vi } from "vitest";
import { runPaymentReminderSweep } from "../src/padelPaymentReminderSweep";

const DUE_TOURNAMENT_ROW = { id: 1, tenant_id: "club-1", label: "Reta 6ta - Martes" };

function unpaidRegistration(id: number) {
  return {
    id, tournament_id: 1, tenant_id: "club-1", player_name: "Juan Pérez", phone: null,
    channel: "telegram", chat_id: "group-1", player_id: `p${id}`, status: "inscrito", registered_at: "t1",
    paid: 0, attended: null, pair_id: null, confirmed: null,
  };
}
function paidRegistration(id: number) {
  return { ...unpaidRegistration(id), paid: 1 };
}

// Backlog de Agencia (ronda de reestructura): "ya que llegó la hora del
// torneo o 30 min antes, revisar si ya pagaron" — Oscar confirmó que
// quiere un aviso automático real al dueño (reusa alertChatId/Vigilante),
// no solo la descripción del flujo manual.
function mockDb(opts: { dueRows?: unknown[]; registrations?: unknown[]; alertChatId?: string | null; channelToken?: string | null } = {}) {
  const dueRows = opts.dueRows ?? [DUE_TOURNAMENT_ROW];
  const registrations = opts.registrations ?? [];
  const alertChatId = opts.alertChatId === undefined ? "999" : opts.alertChatId;
  const channelToken = opts.channelToken === undefined ? "bot-token-club-1" : opts.channelToken;
  const run = vi.fn().mockResolvedValue({ success: true });

  const prepare = vi.fn((sql: string) => ({
    bind: vi.fn(() => ({
      all: vi.fn().mockResolvedValue(
        sql.includes("FROM padel_tournaments")
          ? { results: dueRows }
          : sql.includes("FROM padel_registrations")
            ? { results: registrations }
            : { results: [] },
      ),
      first: vi.fn().mockResolvedValue(
        sql.includes("FROM tenant_settings")
          ? (alertChatId !== null ? { alert_chat_id: alertChatId } : null)
          : sql.includes("FROM channel_bindings")
            ? (channelToken !== null ? { external_id: channelToken } : null)
            : null,
      ),
      run,
    })),
  }));

  return { db: { prepare } as unknown as D1Database, run };
}

describe("runPaymentReminderSweep", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("avisa al dueño si hay inscritos sin pagar dentro de los próximos 30 min", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const { db, run } = mockDb({ registrations: [unpaidRegistration(1), unpaidRegistration(2), paidRegistration(3)] });

    const result = await runPaymentReminderSweep(db, new Date("2026-09-10T18:00:00Z"));

    expect(result).toEqual({ processed: 1, notified: 1, errors: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("https://api.telegram.org/botbot-token-club-1/sendMessage"),
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.chat_id).toBe(999);
    expect(body.text).toContain("2 personas no han pagado");
    expect(body.text).toContain("Reta 6ta - Martes");
    // marca payment_reminder_sent_at para no repetirlo — la 2a llamada a run() es ese UPDATE.
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("no avisa si todos ya pagaron, pero igual marca payment_reminder_sent_at", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { db, run } = mockDb({ registrations: [paidRegistration(1), paidRegistration(2)] });

    const result = await runPaymentReminderSweep(db, new Date("2026-09-10T18:00:00Z"));

    expect(result).toEqual({ processed: 1, notified: 0, errors: [] });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1); // el UPDATE de payment_reminder_sent_at, sin importar si hubo aviso
  });

  it("no hace nada si ninguna convocatoria está dentro de la ventana de 30 min", async () => {
    const { db, run } = mockDb({ dueRows: [] });

    const result = await runPaymentReminderSweep(db, new Date("2026-09-10T18:00:00Z"));

    expect(result).toEqual({ processed: 0, notified: 0, errors: [] });
    expect(run).not.toHaveBeenCalled();
  });

  it("si el dueño no tiene alertas activadas, no manda nada pero sí marca el barrido como hecho", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { db, run } = mockDb({ registrations: [unpaidRegistration(1)], alertChatId: null });

    const result = await runPaymentReminderSweep(db, new Date("2026-09-10T18:00:00Z"));

    expect(result.notified).toBe(1); // sí HAY gente sin pagar — solo el envío en sí es best-effort
    expect(fetchMock).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
