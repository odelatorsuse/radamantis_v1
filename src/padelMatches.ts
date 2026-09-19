import { listRegistrations, setTournamentStatus, type PadelRegistration, type PadelTournament } from "./padel";
import { getPadelSettings } from "./padelCategories";

// Backlog de Agencia (padel, Fase 3-4: "Score Engine"). Genera el fixture de
// una "Reta Americana": rotación de parejas en varias rondas (default 5,
// configurable — ver src/padelCategories.ts) con al menos 1 descanso por
// jugador, luego playoffs (semifinal + final) entre el top 8 de la tabla
// de posiciones. 100% desde /console (staff del club captura marcadores
// por cancha) — sin tool de LLM nueva, mismo criterio ya usado en Fase 2.
//
// Segunda vuelta (Oscar, tras ver el sistema en acción): la primera
// versión exigía un múltiplo EXACTO de 20 jugadores confirmados y
// rechazaba con error si no. Oscar aclaró cómo funciona de verdad: "si no
// se juntan [los que confirmaron], arman la reta con los que estén" — el
// club improvisa con la asistencia real, no cancela ni ajusta la lista
// hasta cuadrar un número exacto. Se relajó a aceptar CUALQUIER cantidad
// >= 4 (mínimo para una cancha).
//
// Tercera vuelta (canchas + parejas, 2026-09-02): Oscar encontró un bug
// real de la segunda vuelta — con pocos jugadores (ej. 4), el reparto de
// descansos por ronda ("método de residuo mayor" aplicado ronda a ronda)
// podía forzar un descanso "de más" que dejaba una ronda con menos de 4
// jugadores activos → 0 partidos esa ronda, sin que nadie lo notara hasta
// que él probó con un grupo chico. Pidió considerar el NÚMERO DE CANCHAS
// real del club y asegurar que nadie se quede sin jugar sus rondas sin
// motivo real. Reescrito: el cupo de jugadores activos por ronda ahora es
// `min(canchas*4, floor(n/4)*4)` — SIEMPRE múltiplo de 4, constante en
// todas las rondas — y el reparto de quién descansa usa residuo mayor
// sobre el TOTAL de turnos de descanso necesarios (rondas × descansos por
// ronda), no por ronda aislada, así nunca se fuerza un descanso que deje
// una ronda con canchas a medio llenar.
//
// Además, "torneo de parejas" (pareja FIJA, vs. Reta Americana de pareja
// rotativa) usa el MISMO algoritmo, un nivel arriba: en vez de repartir
// jugadores individuales, reparte PAREJAS completas (unidades de 2
// personas que nunca se separan al armar equipos ni al descansar) — 2
// parejas por cancha en vez de 4 jugadores sueltos.
export const DEFAULT_ROUNDS = 5;
export const DEFAULT_COURT_COUNT = 5;
const MIN_PLAYERS = 4;
const MIN_PAIRS = 2;

export type PadelMatchPhase = "ronda" | "semifinal" | "final";

export interface PadelMatch {
  id: number;
  tournamentId: number;
  tenantId: string;
  phase: PadelMatchPhase;
  roundNumber: number | null;
  courtNumber: number;
  teamAPlayer1Id: number;
  teamAPlayer2Id: number;
  teamBPlayer1Id: number;
  teamBPlayer2Id: number;
  scoreA: number | null;
  scoreB: number | null;
  createdAt: string;
}

interface MatchRow {
  id: number;
  tournament_id: number;
  tenant_id: string;
  phase: string;
  round_number: number | null;
  court_number: number;
  team_a_player1_id: number;
  team_a_player2_id: number;
  team_b_player1_id: number;
  team_b_player2_id: number;
  score_a: number | null;
  score_b: number | null;
  created_at: string;
}

function mapMatch(r: MatchRow): PadelMatch {
  return {
    id: r.id,
    tournamentId: r.tournament_id,
    tenantId: r.tenant_id,
    phase: r.phase as PadelMatchPhase,
    roundNumber: r.round_number,
    courtNumber: r.court_number,
    teamAPlayer1Id: r.team_a_player1_id,
    teamAPlayer2Id: r.team_a_player2_id,
    teamBPlayer1Id: r.team_b_player1_id,
    teamBPlayer2Id: r.team_b_player2_id,
    scoreA: r.score_a,
    scoreB: r.score_b,
    createdAt: r.created_at,
  };
}

export async function listMatches(db: D1Database, tournamentId: number, phase?: PadelMatchPhase): Promise<PadelMatch[]> {
  const { results } = phase
    ? await db
        .prepare("SELECT * FROM padel_matches WHERE tournament_id = ? AND phase = ? ORDER BY round_number ASC, court_number ASC")
        .bind(tournamentId, phase)
        .all<MatchRow>()
    : await db
        .prepare("SELECT * FROM padel_matches WHERE tournament_id = ? ORDER BY round_number ASC, court_number ASC")
        .bind(tournamentId)
        .all<MatchRow>();
  return results.map(mapMatch);
}

export async function getMatchById(db: D1Database, tenantId: string, matchId: number): Promise<PadelMatch | null> {
  const row = await db.prepare("SELECT * FROM padel_matches WHERE id = ? AND tenant_id = ?").bind(matchId, tenantId).first<MatchRow>();
  return row ? mapMatch(row) : null;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface FixtureUnit {
  key: string; // player.id (individual) o pair_id (pareja) — identidad para el reparto de descansos
  members: PadelRegistration[]; // 1 (individual) o 2 (pareja) — nunca se separan
}

function buildUnits(players: PadelRegistration[], mode: "individual" | "pareja"): FixtureUnit[] {
  if (mode === "individual") return players.map((p) => ({ key: String(p.id), members: [p] }));
  const byPair = new Map<string, PadelRegistration[]>();
  for (const p of players) {
    const key = p.pairId ?? `sin-pareja-${p.id}`; // salvaguarda: no debería ocurrir en un torneo 'pareja', pero no revienta si pasa
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key)!.push(p);
  }
  return [...byPair.entries()].map(([key, members]) => ({ key, members }));
}

export type PadelFixtureMatch = {
  roundNumber: number;
  courtNumber: number;
  teamA: [PadelRegistration, PadelRegistration];
  teamB: [PadelRegistration, PadelRegistration];
};

// Núcleo puro (sin D1) para poder probarlo sin fake DB — separa "quién
// descansa y con quién juega cada ronda" de la escritura en la base.
// Funciona igual para Reta Americana ('individual', unidad = 1 jugador, 4
// unidades por cancha) y torneo de pareja fija ('pareja', unidad = 1
// pareja ya formada, 2 unidades por cancha) — ver comentario de archivo.
export function buildFixturePlan(
  players: PadelRegistration[],
  random: () => number = Math.random,
  rounds: number = DEFAULT_ROUNDS,
  courtCount: number = DEFAULT_COURT_COUNT,
  mode: "individual" | "pareja" = "individual",
): PadelFixtureMatch[] {
  if (courtCount < 1) {
    throw new Error("Se necesita al menos 1 cancha configurada en las reglas del torneo (ver panel de Reglas en /console).");
  }
  const units = buildUnits(players, mode);
  const unitsPerCourt = mode === "pareja" ? 2 : 4;
  const n = units.length;
  const minUnits = mode === "pareja" ? MIN_PAIRS : MIN_PLAYERS;
  if (n < minUnits) {
    throw new Error(
      mode === "pareja"
        ? `Se necesitan al menos ${MIN_PAIRS} parejas confirmadas (inscritas y presentes) para armar una cancha — hay ${n}.`
        : `Se necesitan al menos ${MIN_PLAYERS} jugadores confirmados (inscritos y presentes) para armar una cancha — hay ${n}.`,
    );
  }

  const shuffledUnits = shuffle(units, random);
  // Cupo de unidades activas por ronda: nunca más de lo que las canchas
  // reales permiten, y siempre múltiplo exacto de `unitsPerCourt` — así
  // ninguna ronda queda con una cancha a medio llenar. Constante en todas
  // las rondas (mismo n, mismas canchas cada semana).
  const maxActiveUnits = Math.min(courtCount * unitsPerCourt, Math.floor(n / unitsPerCourt) * unitsPerCourt);
  const restPerRound = n - maxActiveUnits;

  // Reparto de descansos "lo más parejo posible" (residuo mayor) sobre el
  // TOTAL de turnos de descanso necesarios en todo el evento (rondas ×
  // restPerRound) — no ronda por ronda como antes, que es justo lo que
  // causaba el bug de rondas vacías con pocos jugadores.
  const totalRestSlots = rounds * restPerRound;
  const baseQuota = Math.floor(totalRestSlots / n);
  const extraQuota = totalRestSlots % n;
  const remaining = new Map(shuffledUnits.map((u, i) => [u.key, baseQuota + (i < extraQuota ? 1 : 0)]));

  const plan: PadelFixtureMatch[] = [];
  for (let r = 0; r < rounds; r++) {
    let restingKeys = new Set<string>();
    if (restPerRound > 0) {
      const resting = [...remaining.entries()]
        .filter(([, quota]) => quota > 0)
        .sort((a, b) => b[1] - a[1]) // mayor cuota restante descansa primero
        .slice(0, restPerRound)
        .map(([key]) => key);
      resting.forEach((key) => remaining.set(key, remaining.get(key)! - 1));
      restingKeys = new Set(resting);
    }
    const activeUnits = shuffle(
      units.filter((u) => !restingKeys.has(u.key)),
      random,
    );
    const courts = activeUnits.length / unitsPerCourt; // exacto por construcción, sin residuo
    for (let court = 0; court < courts; court++) {
      const group = activeUnits.slice(court * unitsPerCourt, court * unitsPerCourt + unitsPerCourt);
      const teamA: [PadelRegistration, PadelRegistration] =
        mode === "pareja" ? [group[0].members[0], group[0].members[1]] : [group[0].members[0], group[1].members[0]];
      const teamB: [PadelRegistration, PadelRegistration] =
        mode === "pareja" ? [group[1].members[0], group[1].members[1]] : [group[2].members[0], group[3].members[0]];
      plan.push({ roundNumber: r + 1, courtNumber: court + 1, teamA, teamB });
    }
  }
  return plan;
}

export async function generateFixture(
  db: D1Database,
  tournament: PadelTournament,
  tenantId: string,
  random: () => number = Math.random,
): Promise<PadelMatch[]> {
  const registrations = await listRegistrations(db, tournament.id);
  const confirmed = registrations.filter((r) => r.status === "inscrito" && r.attended === true);
  // Backlog de Agencia (ronda de reestructura): rondas/canchas ahora se
  // preguntan al ABRIR la convocatoria (Oscar) — solo se cae de vuelta a
  // los defaults de /padel-settings cuando la convocatoria no trae los
  // suyos propios (convocatorias creadas antes de esta migración).
  const settings = await getPadelSettings(db, tenantId);
  const rounds = tournament.rounds ?? settings.rounds;
  const courtCount = tournament.courtCount ?? settings.courtCount;

  const plan = buildFixturePlan(confirmed, random, rounds, courtCount, tournament.registrationMode); // lanza si no alcanza ni para una cancha — antes de escribir nada

  const statements = plan.map((m) =>
    db
      .prepare(
        `INSERT INTO padel_matches (tournament_id, tenant_id, phase, round_number, court_number, team_a_player1_id, team_a_player2_id, team_b_player1_id, team_b_player2_id)
         VALUES (?, ?, 'ronda', ?, ?, ?, ?, ?, ?)`,
      )
      .bind(tournament.id, tenantId, m.roundNumber, m.courtNumber, m.teamA[0].id, m.teamA[1].id, m.teamB[0].id, m.teamB[1].id),
  );
  await db.batch(statements);
  await setTournamentStatus(db, tenantId, tournament.id, "en_curso");

  return listMatches(db, tournament.id, "ronda");
}

export async function recordMatchScore(db: D1Database, tenantId: string, matchId: number, input: { scoreA: number; scoreB: number }): Promise<void> {
  await db
    .prepare("UPDATE padel_matches SET score_a = ?, score_b = ? WHERE id = ? AND tenant_id = ?")
    .bind(input.scoreA, input.scoreB, matchId, tenantId)
    .run();
}

export interface StandingRow {
  registrationId: number;
  playerName: string;
  points: number;
}

// Puntaje individual: en la fase de rondas, el marcador de la pareja de un
// jugador en cada match ES su puntaje individual de ese match (así funciona
// una Reta Americana real — se juega en parejas, se puntúa como individuo).
// Se calcula sumando en el momento, sin tabla de posiciones aparte, para
// que nunca pueda quedar desincronizada de los marcadores reales.
export async function getStandings(db: D1Database, tournamentId: number): Promise<StandingRow[]> {
  const [registrations, matches] = await Promise.all([
    listRegistrationsForTournament(db, tournamentId),
    listMatches(db, tournamentId, "ronda"),
  ]);
  const points = new Map<number, number>();
  for (const reg of registrations) points.set(reg.id, 0);
  for (const m of matches) {
    if (m.scoreA === null || m.scoreB === null) continue;
    points.set(m.teamAPlayer1Id, (points.get(m.teamAPlayer1Id) ?? 0) + m.scoreA);
    points.set(m.teamAPlayer2Id, (points.get(m.teamAPlayer2Id) ?? 0) + m.scoreA);
    points.set(m.teamBPlayer1Id, (points.get(m.teamBPlayer1Id) ?? 0) + m.scoreB);
    points.set(m.teamBPlayer2Id, (points.get(m.teamBPlayer2Id) ?? 0) + m.scoreB);
  }
  return registrations
    .map((reg) => ({ registrationId: reg.id, playerName: reg.playerName, points: points.get(reg.id) ?? 0 }))
    .sort((a, b) => b.points - a.points);
}

// Solo los jugadores que de verdad jugaron rondas (evita listar a alguien
// que se inscribió pero nunca llegó, o que llegó tarde y no jugó ninguna).
async function listRegistrationsForTournament(db: D1Database, tournamentId: number): Promise<PadelRegistration[]> {
  const all = await listRegistrations(db, tournamentId);
  return all.filter((r) => r.status === "inscrito" && r.attended === true);
}

// Backlog de Agencia (padel, Fase 3-4): forma las 4 parejas de semifinal a
// partir del top 8 de la tabla de posiciones (1°+8°, 2°+7°, 3°+6°, 4°+5° —
// regla explícita del pedido original de Oscar, no una suposición). El
// emparejamiento de LAS 4 parejas entre sí para la llave de semifinal usa
// el criterio de bracket estándar (evita que las parejas mejor sembradas se
// crucen antes de la final): pareja 1 vs pareja 4, pareja 2 vs pareja 3,
// donde "pareja 1" es la de mayor suma de puntos individuales de sus dos
// integrantes. SIMPLIFICACIÓN DELIBERADA: exige que las 8 rondas ya tengan
// marcador completo antes de generar playoffs — sin eso, la tabla de
// posiciones no es real todavía.
//
// Torneo de pareja fija ('pareja'): los 2 integrantes de una pareja
// SIEMPRE tienen el mismo puntaje (juegan siempre juntos), así que
// resembrar top-8 INDIVIDUOS en 4 parejas nuevas (como en modo
// 'individual') rompería parejas que deben seguir fijas. En su lugar se
// siembra directo por las top-4 PAREJAS reales (1 vs 4, 2 vs 3 por puntos
// combinados) — misma regla de bracket estándar, un nivel arriba.
export async function generatePlayoffs(db: D1Database, tournament: PadelTournament, tenantId: string): Promise<PadelMatch[]> {
  const rondaMatches = await listMatches(db, tournament.id, "ronda");
  if (rondaMatches.length === 0) throw new Error("Este torneo todavía no tiene un fixture de rondas generado.");
  const missing = rondaMatches.filter((m) => m.scoreA === null || m.scoreB === null);
  if (missing.length > 0) {
    throw new Error(`Faltan ${missing.length} marcadores de ronda por capturar antes de generar los playoffs.`);
  }

  const standings = await getStandings(db, tournament.id);

  let teams: { players: [{ registrationId: number }, { registrationId: number }]; seedPoints: number }[];

  if (tournament.registrationMode === "pareja") {
    const registrations = await listRegistrations(db, tournament.id);
    const byId = new Map(registrations.map((r) => [r.id, r]));
    const pairPoints = new Map<string, { points: number; members: number[] }>();
    for (const s of standings) {
      const reg = byId.get(s.registrationId);
      const pairId = reg?.pairId;
      if (!pairId) continue; // salvaguarda: no debería pasar en un torneo 'pareja'
      const entry = pairPoints.get(pairId) ?? { points: s.points, members: [] };
      entry.members.push(s.registrationId);
      pairPoints.set(pairId, entry);
    }
    const pairs = [...pairPoints.values()]
      .filter((p) => p.members.length === 2)
      .sort((a, b) => b.points - a.points);
    if (pairs.length < 4) {
      throw new Error(`Se necesitan al menos 4 parejas con puntaje para formar los playoffs — hay ${pairs.length}.`);
    }
    const top4 = pairs.slice(0, 4);
    // El INSERT de abajo arma semifinal 1 = teams[0] vs teams[3], semifinal
    // 2 = teams[1] vs teams[2] — mismo orden que el modo 'individual' tras
    // su sort(), así que aquí se asigna directo por rango (1,2,3,4) para
    // que termine siendo 1 vs 4, 2 vs 3.
    teams = [
      { players: [{ registrationId: top4[0].members[0] }, { registrationId: top4[0].members[1] }], seedPoints: top4[0].points },
      { players: [{ registrationId: top4[1].members[0] }, { registrationId: top4[1].members[1] }], seedPoints: top4[1].points },
      { players: [{ registrationId: top4[2].members[0] }, { registrationId: top4[2].members[1] }], seedPoints: top4[2].points },
      { players: [{ registrationId: top4[3].members[0] }, { registrationId: top4[3].members[1] }], seedPoints: top4[3].points },
    ];
  } else {
    if (standings.length < 8) {
      throw new Error(`Se necesitan al menos 8 jugadores con puntaje para formar los playoffs — hay ${standings.length}.`);
    }
    const top8 = standings.slice(0, 8);

    // 1°+8°, 2°+7°, 3°+6°, 4°+5° — regla explícita del pedido original.
    const rawTeams = [
      { players: [top8[0], top8[7]] as [{ registrationId: number }, { registrationId: number }], seedPoints: top8[0].points + top8[7].points },
      { players: [top8[1], top8[6]] as [{ registrationId: number }, { registrationId: number }], seedPoints: top8[1].points + top8[6].points },
      { players: [top8[2], top8[5]] as [{ registrationId: number }, { registrationId: number }], seedPoints: top8[2].points + top8[5].points },
      { players: [top8[3], top8[4]] as [{ registrationId: number }, { registrationId: number }], seedPoints: top8[3].points + top8[4].points },
    ].sort((a, b) => b.seedPoints - a.seedPoints);
    teams = rawTeams;
  }

  // Bracket estándar entre las 4 parejas ya formadas: sembrada 1 vs 4, 2 vs 3.
  const statements = [
    db
      .prepare(
        `INSERT INTO padel_matches (tournament_id, tenant_id, phase, court_number, team_a_player1_id, team_a_player2_id, team_b_player1_id, team_b_player2_id)
         VALUES (?, ?, 'semifinal', 1, ?, ?, ?, ?)`,
      )
      .bind(tournament.id, tenantId, teams[0].players[0].registrationId, teams[0].players[1].registrationId, teams[3].players[0].registrationId, teams[3].players[1].registrationId),
    db
      .prepare(
        `INSERT INTO padel_matches (tournament_id, tenant_id, phase, court_number, team_a_player1_id, team_a_player2_id, team_b_player1_id, team_b_player2_id)
         VALUES (?, ?, 'semifinal', 2, ?, ?, ?, ?)`,
      )
      .bind(tournament.id, tenantId, teams[1].players[0].registrationId, teams[1].players[1].registrationId, teams[2].players[0].registrationId, teams[2].players[1].registrationId),
  ];
  await db.batch(statements);

  return listMatches(db, tournament.id, "semifinal");
}

function winnerTeam(match: PadelMatch): "a" | "b" | null {
  if (match.scoreA === null || match.scoreB === null) return null;
  if (match.scoreA === match.scoreB) return null; // empate real, sin desempate definido todavía — se resuelve a mano
  return match.scoreA > match.scoreB ? "a" : "b";
}

// Genera el partido de la final una vez que las dos semifinales ya tienen
// marcador — toma a los 2 ganadores. SIMPLIFICACIÓN DELIBERADA: un empate
// en una semifinal no tiene regla de desempate definida todavía (no
// especificada en el pedido original) — se rechaza con un error claro en
// vez de decidir un ganador arbitrario.
export async function generateFinal(db: D1Database, tournament: PadelTournament, tenantId: string): Promise<PadelMatch> {
  const semis = await listMatches(db, tournament.id, "semifinal");
  if (semis.length !== 2) throw new Error("Los playoffs todavía no se han generado para este torneo.");
  const [semi1, semi2] = semis;
  const w1 = winnerTeam(semi1);
  const w2 = winnerTeam(semi2);
  if (!w1 || !w2) throw new Error("Faltan marcadores de semifinal (o hay un empate sin resolver) antes de generar la final.");

  const team1 = w1 === "a" ? [semi1.teamAPlayer1Id, semi1.teamAPlayer2Id] : [semi1.teamBPlayer1Id, semi1.teamBPlayer2Id];
  const team2 = w2 === "a" ? [semi2.teamAPlayer1Id, semi2.teamAPlayer2Id] : [semi2.teamBPlayer1Id, semi2.teamBPlayer2Id];

  await db
    .prepare(
      `INSERT INTO padel_matches (tournament_id, tenant_id, phase, court_number, team_a_player1_id, team_a_player2_id, team_b_player1_id, team_b_player2_id)
       VALUES (?, ?, 'final', 1, ?, ?, ?, ?)`,
    )
    .bind(tournament.id, tenantId, team1[0], team1[1], team2[0], team2[1])
    .run();

  const [final] = await listMatches(db, tournament.id, "final");
  return final;
}

export interface ChampionResult {
  players: [number, number]; // registration ids
}

// Marca el torneo como 'finalizado' en cuanto la final tiene marcador real
// (con ganador, no empate) — se llama después de recordMatchScore sobre el
// match de la final, desde la ruta de /console.
export async function finalizeIfChampionDecided(db: D1Database, tournament: PadelTournament, tenantId: string): Promise<ChampionResult | null> {
  const finals = await listMatches(db, tournament.id, "final");
  if (finals.length !== 1) return null;
  const winner = winnerTeam(finals[0]);
  if (!winner) return null;
  const players: [number, number] =
    winner === "a" ? [finals[0].teamAPlayer1Id, finals[0].teamAPlayer2Id] : [finals[0].teamBPlayer1Id, finals[0].teamBPlayer2Id];
  await setTournamentStatus(db, tenantId, tournament.id, "finalizado");
  return { players };
}
