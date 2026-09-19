import { afterEach, describe, expect, it, vi } from "vitest";
import { runTournamentDeadlineSweep } from "../src/padelDeadlineSweep";

const DUE_TOURNAMENT_ROW = { id: 1, tenant_id: "club-1", label: "Reta 6ta - Martes" };
const REGISTRATION_ROW = {
  id: 10, tournament_id: 1, tenant_id: "club-1", player_name: "Juan Pérez", phone: null,
  channel: "telegram", chat_id: "group-1", player_id: "p1", status: "inscrito", registered_at: "t1",
  paid: 0, attended: null, pair_id: null, confirmed: null,
};

// Mismo patrón de dispatch-por-contenido-de-SQL que test/noShowSweep.test.ts
// — el barrido hace queries distintas contra la misma "db".
function mockDb(opts: { dueRows?: { id: number; tenant_id: string; label: string }[]; failOnUpdate?: boolean; registrations?: unknown[]; channelToken?: string | null } = {}) {
  const dueRows = opts.dueRows ?? [DUE_TOURNAMENT_ROW];
  const registrations = opts.registrations ?? [];
  const channelToken = opts.channelToken === undefined ? "bot-token-club-1" : opts.channelToken;
  const run = vi.fn().mockImplementation(async () => {
    if (opts.failOnUpdate) throw new Error("D1 boom");
    return { success: true };
  });

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
        sql.includes("FROM channel_bindings") ? (channelToken !== null ? { external_id: channelToken } : null) : null,
      ),
      run,
    })),
  }));

  return { db: { prepare } as unknown as D1Database, run };
}

describe("runTournamentDeadlineSweep", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("cierra toda convocatoria vencida", async () => {
    const { db, run } = mockDb({ dueRows: [DUE_TOURNAMENT_ROW, { id: 2, tenant_id: "club-1", label: "Reta 5ta" }] });

    const result = await runTournamentDeadlineSweep(db, new Date("2026-09-10T18:30:00Z"));

    expect(result).toEqual({ processed: 2, closed: 2, errors: [] });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("no hace nada si no hay convocatorias vencidas", async () => {
    const { db, run } = mockDb({ dueRows: [] });

    const result = await runTournamentDeadlineSweep(db, new Date("2026-09-10T18:30:00Z"));

    expect(result).toEqual({ processed: 0, closed: 0, errors: [] });
    expect(run).not.toHaveBeenCalled();
  });

  it("un error al cerrar una jornada no detiene el resto del barrido", async () => {
    const { db } = mockDb({ dueRows: [DUE_TOURNAMENT_ROW], failOnUpdate: true });

    const result = await runTournamentDeadlineSweep(db, new Date("2026-09-10T18:30:00Z"));

    expect(result.processed).toBe(1);
    expect(result.closed).toBe(0);
    expect(result.errors).toEqual([{ tournamentId: 1, error: "D1 boom" }]);
  });

  // Backlog de Agencia (ronda de reestructura): "posterior a la hora
  // límite de inscripción, buscar que confirmen que van a participar" —
  // el bot manda el mensaje al cerrar cada convocatoria.
  it("al cerrar, manda un mensaje de confirmación a cada inscrito por Telegram", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const { db } = mockDb({ registrations: [REGISTRATION_ROW] });

    const result = await runTournamentDeadlineSweep(db, new Date("2026-09-10T18:30:00Z"));

    expect(result.closed).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("https://api.telegram.org/botbot-token-club-1/sendMessage"),
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).toContain("Reta 6ta - Martes");
    expect(body.text.toLowerCase()).toContain("vas a poder venir");
  });

  it("si no hay inscritos, no manda ningún mensaje", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { db } = mockDb({ registrations: [] });

    await runTournamentDeadlineSweep(db, new Date("2026-09-10T18:30:00Z"));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("si falla el envío de un mensaje, el cierre igual queda registrado como exitoso", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    const { db } = mockDb({ registrations: [REGISTRATION_ROW] });

    const result = await runTournamentDeadlineSweep(db, new Date("2026-09-10T18:30:00Z"));

    expect(result.closed).toBe(1);
    expect(result.errors).toEqual([]);
  });
});
