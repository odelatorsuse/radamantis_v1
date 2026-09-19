-- Backlog de Agencia (padel, Fase 3-4: "Score Engine" — fixture, puntaje,
-- playoffs). Un "match" es un juego de una cancha: 2 parejas (4 jugadores),
-- con marcador por pareja. En la fase de rondas ("ronda") el puntaje
-- INDIVIDUAL de cada jugador es directamente el marcador de su pareja en
-- ese match (así funciona una "Reta Americana" real: se juega en parejas
-- rotativas pero se puntúa como individuo) — la tabla de posiciones se
-- calcula sumando estos marcadores, sin necesidad de una tabla aparte.
--
-- phase: 'ronda' (round_number 1-5) | 'semifinal' | 'final' (round_number
-- NULL en estas dos — son eliminación directa, no rotación).
CREATE TABLE padel_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES padel_tournaments (id),
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  phase TEXT NOT NULL,
  round_number INTEGER,
  court_number INTEGER NOT NULL,
  team_a_player1_id INTEGER NOT NULL REFERENCES padel_registrations (id),
  team_a_player2_id INTEGER NOT NULL REFERENCES padel_registrations (id),
  team_b_player1_id INTEGER NOT NULL REFERENCES padel_registrations (id),
  team_b_player2_id INTEGER NOT NULL REFERENCES padel_registrations (id),
  score_a INTEGER,
  score_b INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
