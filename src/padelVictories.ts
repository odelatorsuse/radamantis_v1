// Backlog de Agencia (padel, ronda de canchas + parejas — vista nueva
// confirmada con Oscar: "es una vista NUEVA y separada, ranking por
// victorias", NO reemplaza la tabla de posiciones por puntos que ya vive
// en cada torneo individual). Es un ranking ACUMULADO de todo el club,
// estilo circuito real (Premier Padel): cuenta partidos GANADOS (no
// puntos) a través de TODAS las convocatorias históricas del tenant.
//
// La identidad real de un jugador a través de varias convocatorias es
// `player_id` (su Telegram user id) — `padel_registrations.id` es una fila
// nueva por convocatoria (Fase 1: re-registrarse nunca revive una fila
// vieja), así que agrupar por ese id contaría al mismo jugador por
// separado en cada torneo. `player_name` se toma de la inscripción más
// reciente encontrada (los nombres no deberían cambiar entre torneos).
//
// Un match cuenta como "ganado" solo si tiene AMBOS marcadores y no hay
// empate — mismo criterio ya usado para derivar el campeón real en
// src/padelScreen.ts, nunca se inventa un ganador de un marcador
// incompleto o empatado.
export interface PadelVictoryRow {
  playerId: string;
  playerName: string;
  wins: number;
}

interface MatchRow {
  team_a_player1_id: number;
  team_a_player2_id: number;
  team_b_player1_id: number;
  team_b_player2_id: number;
  score_a: number | null;
  score_b: number | null;
}

interface RegistrationIdentityRow {
  id: number;
  player_id: string;
  player_name: string;
}

export async function getVictoriesLeaderboard(db: D1Database, tenantId: string, limit = 10): Promise<PadelVictoryRow[]> {
  const { results: matches } = await db
    .prepare(
      `SELECT team_a_player1_id, team_a_player2_id, team_b_player1_id, team_b_player2_id, score_a, score_b
       FROM padel_matches
       WHERE tenant_id = ? AND score_a IS NOT NULL AND score_b IS NOT NULL`,
    )
    .bind(tenantId)
    .all<MatchRow>();

  const winsByRegistrationId = new Map<number, number>();
  for (const m of matches) {
    if (m.score_a === null || m.score_b === null || m.score_a === m.score_b) continue;
    const winners =
      m.score_a > m.score_b
        ? [m.team_a_player1_id, m.team_a_player2_id]
        : [m.team_b_player1_id, m.team_b_player2_id];
    for (const regId of winners) winsByRegistrationId.set(regId, (winsByRegistrationId.get(regId) ?? 0) + 1);
  }
  if (winsByRegistrationId.size === 0) return [];

  const regIds = [...winsByRegistrationId.keys()];
  const placeholders = regIds.map(() => "?").join(",");
  const { results: registrations } = await db
    .prepare(`SELECT id, player_id, player_name FROM padel_registrations WHERE id IN (${placeholders})`)
    .bind(...regIds)
    .all<RegistrationIdentityRow>();

  const byPlayerId = new Map<string, { playerName: string; wins: number }>();
  for (const reg of registrations) {
    const wins = winsByRegistrationId.get(reg.id) ?? 0;
    const entry = byPlayerId.get(reg.player_id) ?? { playerName: reg.player_name, wins: 0 };
    entry.wins += wins;
    entry.playerName = reg.player_name;
    byPlayerId.set(reg.player_id, entry);
  }

  return [...byPlayerId.entries()]
    .map(([playerId, v]) => ({ playerId, playerName: v.playerName, wins: v.wins }))
    .sort((a, b) => b.wins - a.wins)
    .slice(0, limit);
}
