import { describe, expect, it } from "vitest";
import { createTournament, getTournamentByLabel, registerPair, registerPlayer, setRegistrationCheckin, listRegistrations, type PadelTournament } from "../src/padel";
import { upsertPadelSettings } from "../src/padelCategories";
import {
  buildFixturePlan,
  DEFAULT_ROUNDS,
  finalizeIfChampionDecided,
  generateFinal,
  generateFixture,
  generatePlayoffs,
  getStandings,
  listMatches,
  recordMatchScore,
} from "../src/padelMatches";
import { createFakePadelD1 } from "./fakePadelD1";

// RNG determinista para que los tests no dependan de Math.random.
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function fakePlayer(id: number, name: string) {
  return { id, tournamentId: 1, tenantId: "club-1", playerName: name, phone: null, channel: "telegram", chatId: "g", playerId: `p${id}`, status: "inscrito" as const, registeredAt: `t${id}`, paid: false, attended: true as boolean | null };
}

describe("buildFixturePlan (núcleo puro)", () => {
  it("rechaza si no alcanza ni para una cancha (menos de 4 jugadores)", () => {
    const players = Array.from({ length: 3 }, (_, i) => fakePlayer(i + 1, `J${i + 1}`));
    expect(() => buildFixturePlan(players, seededRandom(1))).toThrow(/al menos 4/);
  });

  it("con 20 jugadores y 4 canchas genera 5 rondas x 4 canchas, cada jugador descansa exactamente 1 vez (caso parejo)", () => {
    const players = Array.from({ length: 20 }, (_, i) => fakePlayer(i + 1, `J${i + 1}`));
    const plan = buildFixturePlan(players, seededRandom(42), DEFAULT_ROUNDS, 4);

    expect(plan).toHaveLength(DEFAULT_ROUNDS * 4);
    for (let r = 1; r <= DEFAULT_ROUNDS; r++) {
      const roundMatches = plan.filter((m) => m.roundNumber === r);
      expect(roundMatches).toHaveLength(4);
      const playingIds = roundMatches.flatMap((m) => [...m.teamA, ...m.teamB].map((p) => p.id));
      expect(new Set(playingIds).size).toBe(16); // 20 - 4 descansan
    }
    const appearances = new Map<number, number>();
    for (const m of plan) {
      for (const p of [...m.teamA, ...m.teamB]) appearances.set(p.id, (appearances.get(p.id) ?? 0) + 1);
    }
    // 5 rondas, descansa 1 -> juega 4 rondas cada quien.
    for (const p of players) expect(appearances.get(p.id)).toBe(4);
  });

  // Backlog de Agencia: Oscar aclaró que en la realidad no siempre se junta
  // un múltiplo exacto — "si no se juntan, arman la reta con los que
  // estén". Con un número "feo" (18, no múltiplo de 4 ni de 5) el sistema
  // debe seguir armando canchas válidas, nunca tronar.
  it("con un número no exacto de jugadores (18) sigue armando canchas válidas de 4, sin dejar canchas a medias", () => {
    const players = Array.from({ length: 18 }, (_, i) => fakePlayer(i + 1, `J${i + 1}`));
    const plan = buildFixturePlan(players, seededRandom(3), DEFAULT_ROUNDS, 5);

    expect(plan.length).toBeGreaterThan(0);
    for (const m of plan) {
      const ids = [...m.teamA, ...m.teamB].map((p) => p.id);
      expect(new Set(ids).size).toBe(4); // 4 jugadores distintos, siempre
    }
    // Ninguna ronda queda con canchas a medio llenar: floor(18/4)=4
    // canchas caben con 4 canchas activas (16 jugadores), sobran 2 que
    // descansan esa ronda — TODAS las rondas deben tener el mismo número
    // de partidos (constante, no varía por ronda).
    const matchesPerRound = new Map<number, number>();
    for (const m of plan) matchesPerRound.set(m.roundNumber, (matchesPerRound.get(m.roundNumber) ?? 0) + 1);
    expect(new Set(matchesPerRound.values()).size).toBe(1); // mismo # de partidos en cada ronda
    for (let r = 1; r <= DEFAULT_ROUNDS; r++) expect(matchesPerRound.get(r)).toBe(4); // floor(18/4)=4 canchas

    // El descanso se reparte lo más parejo posible (residuo mayor): la
    // diferencia entre quien más descansa y quien menos nunca es mayor a 1.
    const appearances = new Map<number, number>();
    for (const p of players) appearances.set(p.id, 0);
    for (const m of plan) for (const p of [...m.teamA, ...m.teamB]) appearances.set(p.id, (appearances.get(p.id) ?? 0) + 1);
    const counts = [...appearances.values()];
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  // Backlog de Agencia (ronda de canchas): bug real encontrado por Oscar —
  // con pocos jugadores relativos a las canchas disponibles, el reparto de
  // descansos "por ronda aislada" de la versión anterior podía dejar una
  // ronda entera sin partidos (0 canchas activas) aunque hubiera
  // jugadores/canchas de sobra. Con 4 jugadores y 1+ cancha, TODAS las
  // rondas deben tener exactamente 1 partido — nadie debería quedarse sin
  // jugar una ronda completa sin motivo real.
  it("con pocos jugadores (4) y canchas de sobra, ninguna ronda se queda sin partido (bug real corregido)", () => {
    const players = Array.from({ length: 4 }, (_, i) => fakePlayer(i + 1, `J${i + 1}`));
    const plan = buildFixturePlan(players, seededRandom(1), DEFAULT_ROUNDS, 5);

    expect(plan).toHaveLength(DEFAULT_ROUNDS); // 1 partido por ronda x 5 rondas
    for (let r = 1; r <= DEFAULT_ROUNDS; r++) {
      expect(plan.filter((m) => m.roundNumber === r)).toHaveLength(1);
    }
  });

  it("respeta un número de rondas distinto al default cuando se le pasa explícito", () => {
    const players = Array.from({ length: 8 }, (_, i) => fakePlayer(i + 1, `J${i + 1}`));
    const plan = buildFixturePlan(players, seededRandom(1), 3);
    const roundsUsed = new Set(plan.map((m) => m.roundNumber));
    expect(Math.max(...roundsUsed)).toBeLessThanOrEqual(3);
  });

  it("nadie juega contra/con sí mismo, y cada equipo tiene 2 jugadores distintos", () => {
    const players = Array.from({ length: 20 }, (_, i) => fakePlayer(i + 1, `J${i + 1}`));
    const plan = buildFixturePlan(players, seededRandom(7));
    for (const m of plan) {
      const ids = [...m.teamA, ...m.teamB].map((p) => p.id);
      expect(new Set(ids).size).toBe(4);
    }
  });
});

// Backlog de Agencia (ronda de canchas + parejas): torneo de pareja FIJA —
// mismo algoritmo, un nivel arriba: la unidad que rota/descansa es la
// PAREJA completa (2 personas), nunca se separan al armar equipos.
function fakePair(id: number, pairId: string, name: string) {
  return { ...fakePlayer(id, name), pairId };
}

describe("buildFixturePlan modo pareja", () => {
  it("nunca separa a los 2 integrantes de una pareja al armar equipos", () => {
    const pairs = Array.from({ length: 8 }, (_, i) => [
      fakePair(i * 2 + 1, `pair-${i}`, `J${i * 2 + 1}`),
      fakePair(i * 2 + 2, `pair-${i}`, `J${i * 2 + 2}`),
    ]).flat(); // 8 parejas = 16 jugadores
    const plan = buildFixturePlan(pairs, seededRandom(5), DEFAULT_ROUNDS, 5, "pareja");

    expect(plan.length).toBeGreaterThan(0);
    for (const m of plan) {
      // teamA y teamB deben ser cada uno una pareja REAL (mismo pairId).
      const pairIdOf = (p: (typeof pairs)[number]) => (p as { pairId: string }).pairId;
      expect(pairIdOf(m.teamA[0])).toBe(pairIdOf(m.teamA[1]));
      expect(pairIdOf(m.teamB[0])).toBe(pairIdOf(m.teamB[1]));
    }
  });

  it("rechaza con menos de 2 parejas confirmadas", () => {
    const pairs = [fakePair(1, "pair-0", "J1"), fakePair(2, "pair-0", "J2")]; // 1 sola pareja
    expect(() => buildFixturePlan(pairs, seededRandom(1), DEFAULT_ROUNDS, 5, "pareja")).toThrow(/al menos 2 parejas/);
  });

  it("con pocas parejas y canchas de sobra, ninguna ronda se queda sin partido", () => {
    const pairs = Array.from({ length: 2 }, (_, i) => [
      fakePair(i * 2 + 1, `pair-${i}`, `J${i * 2 + 1}`),
      fakePair(i * 2 + 2, `pair-${i}`, `J${i * 2 + 2}`),
    ]).flat(); // 2 parejas = 1 partido posible por ronda
    const plan = buildFixturePlan(pairs, seededRandom(2), DEFAULT_ROUNDS, 5, "pareja");

    expect(plan).toHaveLength(DEFAULT_ROUNDS);
    for (let r = 1; r <= DEFAULT_ROUNDS; r++) {
      expect(plan.filter((m) => m.roundNumber === r)).toHaveLength(1);
    }
  });
});

// Backlog de Agencia (ronda de canchas): las canchas ahora son un
// parámetro real y explícito (ver src/padelMatches.ts) — se fija en 4
// para reproducir el escenario original de Oscar (20 jugadores, 4
// canchas, 1 descanso obligatorio cada quien) que ya usan varios tests de
// este archivo.
async function setupConfirmedTournament(db: D1Database, tenantId: string, playerCount: number): Promise<PadelTournament> {
  await upsertPadelSettings(db, tenantId, { rounds: DEFAULT_ROUNDS, courtCount: 4, defaultRegistrationMode: "individual" });
  await createTournament(db, tenantId, { label: "Torneo QA", scheduledAtUtc: "x", registrationDeadlineUtc: "y", capacity: playerCount });
  const tournament = await getTournamentByLabel(db, tenantId, "Torneo QA");
  if (!tournament) throw new Error("setup falló");
  for (let i = 0; i < playerCount; i++) {
    await registerPlayer(db, tournament, tenantId, { playerName: `Jugador ${i + 1}`, phone: null, channel: "telegram", chatId: "g", playerId: `p${i + 1}` });
  }
  const regs = await listRegistrations(db, tournament.id);
  for (const r of regs) await setRegistrationCheckin(db, tenantId, r.id, { attended: true });
  return tournament;
}

describe("generateFixture (con D1 real vía fake)", () => {
  it("genera 20 matches y pasa el torneo a en_curso", async () => {
    const db = createFakePadelD1();
    const tournament = await setupConfirmedTournament(db, "club-1", 20);

    const matches = await generateFixture(db, tournament, "club-1", seededRandom(1));

    expect(matches).toHaveLength(20);
    const updated = await getTournamentByLabel(db, "club-1", "Torneo QA");
    expect(updated).toBeNull(); // ya no está 'abierta', getTournamentByLabel solo busca abiertas
  });

  it("genera un fixture válido aunque el número de confirmados no sea 'redondo' (18)", async () => {
    const db = createFakePadelD1();
    const tournament = await setupConfirmedTournament(db, "club-1", 18);

    const matches = await generateFixture(db, tournament, "club-1", seededRandom(1));

    expect(matches.length).toBeGreaterThan(0);
  });

  it("rechaza si hay menos de 4 confirmados", async () => {
    const db = createFakePadelD1();
    const tournament = await setupConfirmedTournament(db, "club-1", 3);

    await expect(generateFixture(db, tournament, "club-1", seededRandom(1))).rejects.toThrow(/al menos 4/);
  });
});

describe("recordMatchScore / getStandings", () => {
  it("suma el marcador de la pareja como puntaje individual de cada jugador", async () => {
    const db = createFakePadelD1();
    const tournament = await setupConfirmedTournament(db, "club-1", 20);
    const matches = await generateFixture(db, tournament, "club-1", seededRandom(3));

    for (const m of matches) {
      await recordMatchScore(db, "club-1", m.id, { scoreA: 21, scoreB: 15 });
    }

    const standings = await getStandings(db, tournament.id);
    expect(standings).toHaveLength(20);
    // cada jugador jugó exactamente 4 rondas (1 descanso) — su total es
    // la suma de 21 o 15 según en qué equipo cayó cada vez, siempre > 0.
    for (const row of standings) expect(row.points).toBeGreaterThan(0);
    const total = standings.reduce((sum, r) => sum + r.points, 0);
    // cada match: 2 jugadores reciben 21 y 2 reciben 15 (marcador de SU pareja).
    expect(total).toBe(matches.length * (21 + 21 + 15 + 15));
  });
});

describe("generatePlayoffs / generateFinal / finalizeIfChampionDecided", () => {
  it("rechaza playoffs si faltan marcadores de ronda", async () => {
    const db = createFakePadelD1();
    const tournament = await setupConfirmedTournament(db, "club-1", 20);
    await generateFixture(db, tournament, "club-1", seededRandom(5));

    await expect(generatePlayoffs(db, tournament, "club-1")).rejects.toThrow(/Faltan/);
  });

  it("flujo completo: fixture -> marcadores -> playoffs -> semifinales -> final -> campeón", async () => {
    const db = createFakePadelD1();
    const tournament = await setupConfirmedTournament(db, "club-1", 20);
    const matches = await generateFixture(db, tournament, "club-1", seededRandom(11));

    // Marcadores variados para que haya un orden real de posiciones.
    let i = 0;
    for (const m of matches) {
      const scoreA = 15 + ((i * 3) % 10);
      const scoreB = 24 - scoreA;
      await recordMatchScore(db, "club-1", m.id, { scoreA, scoreB });
      i++;
    }

    const standings = await getStandings(db, tournament.id);
    expect(standings[0].points).toBeGreaterThanOrEqual(standings[19].points);

    const semis = await generatePlayoffs(db, tournament, "club-1");
    expect(semis).toHaveLength(2);
    // Las 4 parejas del top8 (1+8,2+7,3+6,4+5) deben cubrir exactamente esos 8 jugadores.
    const top8Ids = standings.slice(0, 8).map((s) => s.registrationId);
    const semiPlayerIds = semis.flatMap((m) => [m.teamAPlayer1Id, m.teamAPlayer2Id, m.teamBPlayer1Id, m.teamBPlayer2Id]);
    expect(new Set(semiPlayerIds)).toEqual(new Set(top8Ids));

    await expect(generateFinal(db, tournament, "club-1")).rejects.toThrow(/Faltan marcadores/);

    await recordMatchScore(db, "club-1", semis[0].id, { scoreA: 24, scoreB: 18 });
    await recordMatchScore(db, "club-1", semis[1].id, { scoreA: 20, scoreB: 24 });

    const final = await generateFinal(db, tournament, "club-1");
    expect(final.phase).toBe("final");
    // El equipo A de la final debe ser el ganador de semi1 (A ganó 24-18).
    expect([final.teamAPlayer1Id, final.teamAPlayer2Id].sort()).toEqual([semis[0].teamAPlayer1Id, semis[0].teamAPlayer2Id].sort());

    let champion = await finalizeIfChampionDecided(db, tournament, "club-1");
    expect(champion).toBeNull(); // todavía sin marcador

    await recordMatchScore(db, "club-1", final.id, { scoreA: 24, scoreB: 10 });
    champion = await finalizeIfChampionDecided(db, tournament, "club-1");
    expect(champion?.players.sort()).toEqual([final.teamAPlayer1Id, final.teamAPlayer2Id].sort());
  });

  it("un empate en semifinal bloquea la final con un error claro", async () => {
    const db = createFakePadelD1();
    const tournament = await setupConfirmedTournament(db, "club-1", 20);
    const matches = await generateFixture(db, tournament, "club-1", seededRandom(2));
    for (const m of matches) await recordMatchScore(db, "club-1", m.id, { scoreA: 20, scoreB: 20 });

    const semis = await generatePlayoffs(db, tournament, "club-1");
    await recordMatchScore(db, "club-1", semis[0].id, { scoreA: 21, scoreB: 21 }); // empate
    await recordMatchScore(db, "club-1", semis[1].id, { scoreA: 24, scoreB: 10 });

    await expect(generateFinal(db, tournament, "club-1")).rejects.toThrow(/empate/);
  });
});

// Backlog de Agencia (ronda de canchas + parejas): en modo pareja, los 2
// integrantes SIEMPRE tienen el mismo puntaje (juegan siempre juntos) —
// generatePlayoffs debe sembrar por las top-4 PAREJAS reales (1v4, 2v3),
// nunca re-emparejar individuos como en modo 'individual' (rompería la
// pareja fija).
describe("generatePlayoffs en modo pareja", () => {
  async function setupConfirmedPairTournament(db: D1Database, tenantId: string, pairCount: number): Promise<PadelTournament> {
    await upsertPadelSettings(db, tenantId, { rounds: DEFAULT_ROUNDS, courtCount: 4, defaultRegistrationMode: "pareja" });
    const id = await createTournament(db, tenantId, {
      label: "Torneo de Parejas", scheduledAtUtc: "x", registrationDeadlineUtc: "y", capacity: pairCount, registrationMode: "pareja",
    });
    const tournament = await getTournamentByLabel(db, tenantId, "Torneo de Parejas");
    if (!tournament || tournament.id !== id) throw new Error("setup falló");
    for (let i = 0; i < pairCount; i++) {
      await registerPair(db, tournament, tenantId, {
        player1Name: `Pareja${i}-A`, player2Name: `Pareja${i}-B`, phone: null, channel: "telegram", chatId: "g", playerId: `pair${i}`,
      });
    }
    const regs = await listRegistrations(db, tournament.id);
    for (const r of regs) await setRegistrationCheckin(db, tenantId, r.id, { attended: true });
    return tournament;
  }

  it("siembra las top-4 parejas reales (1v4, 2v3) sin re-emparejar integrantes", async () => {
    const db = createFakePadelD1();
    const tournament = await setupConfirmedPairTournament(db, "club-1", 8); // 8 parejas = 16 jugadores
    const matches = await generateFixture(db, tournament, "club-1", seededRandom(4));

    let i = 0;
    for (const m of matches) {
      const scoreA = 15 + ((i * 3) % 10);
      await recordMatchScore(db, "club-1", m.id, { scoreA, scoreB: 24 - scoreA });
      i++;
    }

    const standings = await getStandings(db, tournament.id);
    const semis = await generatePlayoffs(db, tournament, "club-1");
    expect(semis).toHaveLength(2);

    // Cada semifinal debe enfrentar 2 PAREJAS reales — ambos integrantes de
    // cada equipo deben tener el MISMO puntaje (jugaron siempre juntos).
    const pointsOf = (registrationId: number) => standings.find((s) => s.registrationId === registrationId)?.points;
    for (const m of semis) {
      expect(pointsOf(m.teamAPlayer1Id)).toBe(pointsOf(m.teamAPlayer2Id));
      expect(pointsOf(m.teamBPlayer1Id)).toBe(pointsOf(m.teamBPlayer2Id));
    }
  });

  it("rechaza si hay menos de 4 parejas con puntaje", async () => {
    const db = createFakePadelD1();
    const tournament = await setupConfirmedPairTournament(db, "club-1", 3); // solo 3 parejas
    const matches = await generateFixture(db, tournament, "club-1", seededRandom(1));
    for (const m of matches) await recordMatchScore(db, "club-1", m.id, { scoreA: 21, scoreB: 15 });

    await expect(generatePlayoffs(db, tournament, "club-1")).rejects.toThrow(/al menos 4 parejas/);
  });
});

describe("listMatches", () => {
  it("filtra por phase cuando se pide", async () => {
    const db = createFakePadelD1();
    const tournament = await setupConfirmedTournament(db, "club-1", 20);
    await generateFixture(db, tournament, "club-1", seededRandom(9));

    const ronda = await listMatches(db, tournament.id, "ronda");
    const semis = await listMatches(db, tournament.id, "semifinal");
    expect(ronda).toHaveLength(20);
    expect(semis).toHaveLength(0);
  });
});
