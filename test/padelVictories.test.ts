import { describe, expect, it } from "vitest";
import { createTournament, getTournamentByLabel, listRegistrations, registerPlayer, setRegistrationCheckin, type PadelTournament } from "../src/padel";
import { upsertPadelSettings } from "../src/padelCategories";
import { DEFAULT_ROUNDS, generateFixture, recordMatchScore } from "../src/padelMatches";
import { getVictoriesLeaderboard } from "../src/padelVictories";
import { createFakePadelD1 } from "./fakePadelD1";

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

async function setupConfirmedTournament(db: D1Database, tenantId: string, label: string, playerCount: number): Promise<PadelTournament> {
  await upsertPadelSettings(db, tenantId, { rounds: DEFAULT_ROUNDS, courtCount: 4, defaultRegistrationMode: "individual" });
  await createTournament(db, tenantId, { label, scheduledAtUtc: "x", registrationDeadlineUtc: "y", capacity: playerCount });
  const tournament = await getTournamentByLabel(db, tenantId, label);
  if (!tournament) throw new Error("setup falló");
  for (let i = 0; i < playerCount; i++) {
    await registerPlayer(db, tournament, tenantId, { playerName: `Jugador ${i + 1}`, phone: null, channel: "telegram", chatId: "g", playerId: `p${i + 1}` });
  }
  const regs = await listRegistrations(db, tournament.id);
  for (const r of regs) await setRegistrationCheckin(db, tenantId, r.id, { attended: true });
  return tournament;
}

// Backlog de Agencia (padel, ronda de canchas + parejas): "es una vista
// NUEVA y separada, ranking por victorias" — cuenta partidos GANADOS
// (no puntos) acumulados a través de TODAS las convocatorias históricas
// del tenant, agrupado por player_id real (no por registration id, que es
// una fila nueva por convocatoria).
describe("getVictoriesLeaderboard", () => {
  it("cuenta victorias reales (marcador ganado, no puntos) de un solo torneo", async () => {
    const db = createFakePadelD1();
    const tournament = await setupConfirmedTournament(db, "club-1", "Torneo 1", 20);
    const matches = await generateFixture(db, tournament, "club-1", seededRandom(1));

    // Jugador 1 gana todos sus partidos (equipo A siempre 21-0 cuando juega).
    for (const m of matches) {
      const isTeamA = m.teamAPlayer1Id === 1 || m.teamAPlayer2Id === 1;
      const isTeamB = m.teamBPlayer1Id === 1 || m.teamBPlayer2Id === 1;
      if (isTeamA) await recordMatchScore(db, "club-1", m.id, { scoreA: 21, scoreB: 0 });
      else if (isTeamB) await recordMatchScore(db, "club-1", m.id, { scoreA: 0, scoreB: 21 });
      else await recordMatchScore(db, "club-1", m.id, { scoreA: 15, scoreB: 15 }); // empate: nadie gana
    }

    const leaderboard = await getVictoriesLeaderboard(db, "club-1");

    expect(leaderboard.length).toBeGreaterThan(0);
    const jugador1 = leaderboard.find((r) => r.playerId === "p1");
    expect(jugador1).toBeDefined();
    expect(jugador1!.wins).toBeGreaterThan(0);
    expect(jugador1!.playerName).toBe("Jugador 1");
    // Ordenado descendente.
    for (let i = 1; i < leaderboard.length; i++) {
      expect(leaderboard[i - 1].wins).toBeGreaterThanOrEqual(leaderboard[i].wins);
    }
  });

  it("acumula victorias del MISMO jugador (player_id) a través de VARIAS convocatorias distintas", async () => {
    const db = createFakePadelD1();

    const t1 = await setupConfirmedTournament(db, "club-1", "Torneo 1", 20);
    const m1 = await generateFixture(db, t1, "club-1", seededRandom(2));
    for (const m of m1) await recordMatchScore(db, "club-1", m.id, { scoreA: 21, scoreB: 15 }); // equipo A siempre gana

    const t2 = await setupConfirmedTournament(db, "club-1", "Torneo 2", 20);
    const m2 = await generateFixture(db, t2, "club-1", seededRandom(2));
    for (const m of m2) await recordMatchScore(db, "club-1", m.id, { scoreA: 21, scoreB: 15 });

    const leaderboard = await getVictoriesLeaderboard(db, "club-1");
    // p1 jugó en ambos torneos (registrations distintas, mismo player_id) —
    // sus victorias deben sumarse, no aparecer como 2 filas separadas.
    const entries = leaderboard.filter((r) => r.playerId === "p1");
    expect(entries).toHaveLength(1);
  });

  it("ignora partidos sin marcador completo o empatados", async () => {
    const db = createFakePadelD1();
    const tournament = await setupConfirmedTournament(db, "club-1", "Torneo 1", 20);
    const matches = await generateFixture(db, tournament, "club-1", seededRandom(1));
    for (const m of matches) await recordMatchScore(db, "club-1", m.id, { scoreA: 20, scoreB: 20 }); // todos empatados

    const leaderboard = await getVictoriesLeaderboard(db, "club-1");

    expect(leaderboard).toEqual([]);
  });

  it("respeta el aislamiento entre tenants", async () => {
    const db = createFakePadelD1();
    const tournament = await setupConfirmedTournament(db, "club-1", "Torneo 1", 20);
    const matches = await generateFixture(db, tournament, "club-1", seededRandom(1));
    for (const m of matches) await recordMatchScore(db, "club-1", m.id, { scoreA: 21, scoreB: 15 });

    const leaderboardOtroTenant = await getVictoriesLeaderboard(db, "otro-club");

    expect(leaderboardOtroTenant).toEqual([]);
  });

  it("respeta el límite pedido", async () => {
    const db = createFakePadelD1();
    const tournament = await setupConfirmedTournament(db, "club-1", "Torneo 1", 20);
    const matches = await generateFixture(db, tournament, "club-1", seededRandom(1));
    for (const m of matches) await recordMatchScore(db, "club-1", m.id, { scoreA: 21, scoreB: 15 });

    const leaderboard = await getVictoriesLeaderboard(db, "club-1", 3);

    expect(leaderboard.length).toBeLessThanOrEqual(3);
  });
});
