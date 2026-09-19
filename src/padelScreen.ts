import { Hono } from "hono";
import { getTournamentById, listRegistrations, type PadelTournament } from "./padel";
import { PADEL_CATEGORIES } from "./padelCategories";
import { getStandings, listMatches, type PadelMatch } from "./padelMatches";
import { getTenantSettings } from "./tenants";
import { getVictoriesLeaderboard } from "./padelVictories";

interface Env {
  DB: D1Database;
}

// Backlog de Agencia (padel, Fase 5: "Broadcast Visual"). Pantalla pública
// de un torneo — pensada para abrirse en una TV/monitor del club, no para
// un usuario logueado, así que es de solo lectura y sin autenticación
// (mismo criterio de "público a propósito" que el widget de sitio web,
// src/widget.ts). Solo expone lo necesario para mostrar el torneo:
// nombres de jugadores y marcadores reales — nunca teléfono/chat_id/
// player_id (esos sí son privados, viven en /api/client/*).
//
// Segunda vuelta (Oscar, tras ver la primera versión): "las llaves deben
// aplicar para todo el torneo o retas" — un club corre las 6 categorías
// (6ta..1ra) en paralelo, cada una su propio día — la pantalla real que
// pidió es una sola vista con una sección POR categoría, no una pantalla
// aislada por convocatoria individual. Se agregó GET /:tenantId (nueva,
// vista de club completo) sin quitar GET /:tenantId/:tournamentId (se
// deja — sigue siendo útil para una TV dedicada a una sola categoría/cancha).
export const padelScreenApp = new Hono<{ Bindings: Env }>();

interface PublicMatch {
  id: number;
  phase: PadelMatch["phase"];
  roundNumber: number | null;
  courtNumber: number;
  teamA: [string, string];
  teamB: [string, string];
  scoreA: number | null;
  scoreB: number | null;
}

interface TournamentPayload {
  tournament: { label: string; status: string };
  matches: PublicMatch[];
  standings: { playerName: string; points: number }[];
  champion: [string, string] | null;
}

async function getTenantName(db: D1Database, tenantId: string): Promise<string> {
  const row = await db.prepare("SELECT name FROM tenants WHERE id = ?").bind(tenantId).first<{ name: string }>();
  return row?.name ?? tenantId;
}

// La convocatoria "vigente" de una categoría para mostrar en la pantalla:
// prioriza una en juego (en_curso) sobre una todavía abierta/cerrada sin
// fixture, y esas sobre la última ya finalizada (para no dejar la sección
// vacía justo después de que se decidió un campeón).
async function getRelevantTournamentForCategory(db: D1Database, tenantId: string, category: string): Promise<PadelTournament | null> {
  const enCurso = await db
    .prepare("SELECT * FROM padel_tournaments WHERE tenant_id = ? AND category = ? AND status = 'en_curso' ORDER BY id DESC LIMIT 1")
    .bind(tenantId, category)
    .first<Record<string, unknown>>();
  if (enCurso) return mapRow(enCurso);

  const abiertaOCerrada = await db
    .prepare("SELECT * FROM padel_tournaments WHERE tenant_id = ? AND category = ? AND status IN ('abierta', 'cerrada') ORDER BY id DESC LIMIT 1")
    .bind(tenantId, category)
    .first<Record<string, unknown>>();
  if (abiertaOCerrada) return mapRow(abiertaOCerrada);

  const finalizado = await db
    .prepare("SELECT * FROM padel_tournaments WHERE tenant_id = ? AND category = ? AND status = 'finalizado' ORDER BY id DESC LIMIT 1")
    .bind(tenantId, category)
    .first<Record<string, unknown>>();
  return finalizado ? mapRow(finalizado) : null;
}

function mapRow(r: Record<string, unknown>): PadelTournament {
  return {
    id: r.id as number,
    tenantId: r.tenant_id as string,
    label: r.label as string,
    category: (r.category as string | null) ?? null,
    scheduledAtUtc: r.scheduled_at_utc as string,
    registrationDeadlineUtc: r.registration_deadline_utc as string,
    capacity: r.capacity as number,
    registrationMode: (r.registration_mode as string) === "pareja" ? "pareja" : "individual",
    rounds: (r.rounds as number | null) ?? null,
    courtCount: (r.court_count as number | null) ?? null,
    status: r.status as PadelTournament["status"],
    paymentReminderSentAt: (r.payment_reminder_sent_at as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

async function buildTournamentPayload(db: D1Database, tournament: PadelTournament): Promise<TournamentPayload> {
  const [registrations, matches, standings] = await Promise.all([
    listRegistrations(db, tournament.id),
    listMatches(db, tournament.id),
    getStandings(db, tournament.id),
  ]);

  const nameById = new Map(registrations.map((r) => [r.id, r.playerName]));
  const name = (id: number) => nameById.get(id) ?? "?";
  const publicMatches: PublicMatch[] = matches.map((m) => ({
    id: m.id,
    phase: m.phase,
    roundNumber: m.roundNumber,
    courtNumber: m.courtNumber,
    teamA: [name(m.teamAPlayer1Id), name(m.teamAPlayer2Id)],
    teamB: [name(m.teamBPlayer1Id), name(m.teamBPlayer2Id)],
    scoreA: m.scoreA,
    scoreB: m.scoreB,
  }));

  // Se deriva directo del marcador real de la final (no de
  // tournament.status) — más simple y robusto: no depende de que
  // finalizeIfChampionDecided ya haya corrido en otra petición.
  const finalMatch = publicMatches.find((m) => m.phase === "final") ?? null;
  const champion =
    finalMatch && finalMatch.scoreA !== null && finalMatch.scoreB !== null && finalMatch.scoreA !== finalMatch.scoreB
      ? finalMatch.scoreA > finalMatch.scoreB
        ? finalMatch.teamA
        : finalMatch.teamB
      : null;

  return {
    tournament: { label: tournament.label, status: tournament.status },
    matches: publicMatches,
    standings: standings.map((s) => ({ playerName: s.playerName, points: s.points })),
    champion,
  };
}

async function buildTenantHeader(db: D1Database, tenantId: string) {
  const [tenantName, settings] = await Promise.all([getTenantName(db, tenantId), getTenantSettings(db, tenantId)]);
  // White-label (Agencia): el dueño puede haber configurado un nombre
  // propio desde /console — se prefiere sobre el tenant_id/nombre crudo,
  // mismo criterio ya usado en el sidebar de /console.
  return { name: settings.brandName || tenantName, brandLogoUrl: settings.brandLogoUrl, brandColor: settings.brandColor };
}

// Ranking acumulado de "más victorias" de todo el club (todas las
// convocatorias históricas, no una sola) — vista NUEVA y separada de la
// tabla de posiciones por puntos de cada torneo individual, confirmada
// así con Oscar. Registrada ANTES de "/:tenantId/:tournamentId" para que
// "victorias" nunca se interprete como un tournamentId numérico.
padelScreenApp.get("/:tenantId/victorias", async (c) => {
  const tenantId = c.req.param("tenantId");
  const [tenant, leaderboard] = await Promise.all([
    buildTenantHeader(c.env.DB, tenantId),
    getVictoriesLeaderboard(c.env.DB, tenantId),
  ]);
  return c.json({ tenant, leaderboard });
});

// Vista de UNA convocatoria específica — útil para una TV dedicada a una
// sola cancha/categoría en vez del club completo.
padelScreenApp.get("/:tenantId/:tournamentId", async (c) => {
  const tenantId = c.req.param("tenantId");
  const tournamentId = Number(c.req.param("tournamentId"));

  const tournament = await getTournamentById(c.env.DB, tenantId, tournamentId);
  if (!tournament) return c.json({ error: "Torneo no encontrado" }, 404);

  const [tenant, payload] = await Promise.all([buildTenantHeader(c.env.DB, tenantId), buildTournamentPayload(c.env.DB, tournament)]);
  return c.json({ tenant, ...payload });
});

// Vista de club completo — una sección por cada una de las 6 categorías
// reales (Oscar: "las llaves deben aplicar para todo el torneo o retas...
// dame una sección por cada categoría").
padelScreenApp.get("/:tenantId", async (c) => {
  const tenantId = c.req.param("tenantId");

  const tenant = await buildTenantHeader(c.env.DB, tenantId);
  const categories = await Promise.all(
    PADEL_CATEGORIES.map(async (category) => {
      const tournament = await getRelevantTournamentForCategory(c.env.DB, tenantId, category);
      if (!tournament) return { category, tournament: null, matches: [], standings: [], champion: null };
      const payload = await buildTournamentPayload(c.env.DB, tournament);
      return { category, ...payload };
    }),
  );

  return c.json({ tenant, categories });
});
