// Backlog de Agencia (padel, Fase 1: "Convocador Bot") — mismo patrón que
// src/catalog.ts: módulo de datos propio, no dentro de client/repository.ts,
// porque tanto la tool del bot (src/padelTool.ts) como /console leen/escriben
// esto directamente.
//
// Modelo confirmado con Oscar (distinto de un catálogo/staff normal): los
// jugadores se inscriben escribiendo en un GRUPO de Telegram compartido, no
// cada uno por privado — así que `chat_id` (la conversación) NO identifica
// al jugador, todos comparten el mismo. La identidad real es `player_id`
// (su Telegram user id individual). Un club puede tener varias
// convocatorias abiertas a la vez (categorías/fechas distintas).

export interface PadelTournament {
  id: number;
  tenantId: string;
  label: string;
  // Backlog de Agencia (padel, ronda de categorías): 6ta..1ra, ver
  // src/padelCategories.ts. Nullable — las convocatorias creadas antes de
  // esta migración no tienen categoría, no se les inventa una.
  category: string | null;
  scheduledAtUtc: string;
  registrationDeadlineUtc: string;
  capacity: number;
  // Backlog de Agencia (ronda de canchas + parejas): 'individual' = Reta
  // Americana clásica (pareja rotativa cada ronda); 'pareja' = torneo de
  // pareja FIJA — misma mecánica de rondas/posiciones/playoffs, solo
  // cambia si el compañero rota o no (confirmado con Oscar). Se elige por
  // convocatoria, nunca fijo por tenant.
  registrationMode: "individual" | "pareja";
  // Backlog de Agencia (ronda de reestructura): rondas/canchas se
  // preguntan AL CREAR cada convocatoria (Oscar: un club puede usar
  // distintas canchas/rondas según categoría o día) — nullable solo para
  // las convocatorias creadas ANTES de esta migración; generateFixture
  // cae de vuelta a los defaults de padel_settings cuando son null.
  rounds: number | null;
  courtCount: number | null;
  // Backlog de Agencia (padel, Fase 3-4): 'en_curso' cuando se genera el
  // fixture (deja de aceptar más inscripciones aunque no se haya cerrado a
  // mano), 'finalizado' cuando el partido de la final ya tiene marcador.
  status: "abierta" | "cerrada" | "en_curso" | "finalizado";
  // Backlog de Agencia: cuándo se mandó el aviso de pago pendiente al
  // club (30 min antes de la jornada) — evita repetirlo en cada barrido.
  paymentReminderSentAt: string | null;
  createdAt: string;
}

export type PadelRegistrationStatus = "inscrito" | "lista_espera" | "cancelado";

export interface PadelRegistration {
  id: number;
  tournamentId: number;
  tenantId: string;
  playerName: string;
  phone: string | null;
  channel: string;
  chatId: string;
  playerId: string;
  status: PadelRegistrationStatus;
  registeredAt: string;
  // Backlog de Agencia (padel, Fase 2: "Reception Bot" — check-in en el
  // club). paid: cobro en efectivo/terminal en el mostrador, sin pasarela —
  // solo se marca. attended: null hasta que el staff lo confirme al llegar
  // (nunca se asume), true = se presentó, false = marcado como no-show.
  paid: boolean;
  attended: boolean | null;
  // Backlog de Agencia (ronda de canchas + parejas): UUID compartido por
  // las 2 filas de una misma pareja fija (torneos 'pareja') — null en
  // torneos 'individual'. Nunca se separan al armar equipos, cancelar o
  // promover de la lista de espera.
  pairId: string | null;
  // Backlog de Agencia: "posterior a la hora límite de inscripción,
  // buscar que confirmen que van a participar" — el bot les pregunta al
  // cerrar inscripciones (ver src/padelDeadlineSweep.ts). null = no ha
  // respondido, nunca se asume.
  confirmed: boolean | null;
}

interface TournamentRow {
  id: number;
  tenant_id: string;
  label: string;
  category: string | null;
  scheduled_at_utc: string;
  registration_deadline_utc: string;
  capacity: number;
  registration_mode: string;
  rounds: number | null;
  court_count: number | null;
  status: string;
  payment_reminder_sent_at: string | null;
  created_at: string;
}

interface RegistrationRow {
  id: number;
  tournament_id: number;
  tenant_id: string;
  player_name: string;
  phone: string | null;
  channel: string;
  chat_id: string;
  player_id: string;
  status: string;
  registered_at: string;
  paid: number;
  attended: number | null;
  pair_id: string | null;
  confirmed: number | null;
}

function mapTournament(r: TournamentRow): PadelTournament {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    label: r.label,
    category: r.category,
    scheduledAtUtc: r.scheduled_at_utc,
    registrationDeadlineUtc: r.registration_deadline_utc,
    capacity: r.capacity,
    registrationMode: r.registration_mode === "pareja" ? "pareja" : "individual",
    rounds: r.rounds,
    courtCount: r.court_count,
    status: r.status as PadelTournament["status"],
    paymentReminderSentAt: r.payment_reminder_sent_at,
    createdAt: r.created_at,
  };
}

function mapRegistration(r: RegistrationRow): PadelRegistration {
  return {
    id: r.id,
    tournamentId: r.tournament_id,
    tenantId: r.tenant_id,
    playerName: r.player_name,
    phone: r.phone,
    channel: r.channel,
    chatId: r.chat_id,
    playerId: r.player_id,
    status: r.status as PadelRegistrationStatus,
    registeredAt: r.registered_at,
    paid: r.paid === 1,
    confirmed: r.confirmed === null ? null : r.confirmed === 1,
    attended: r.attended === null ? null : r.attended === 1,
    pairId: r.pair_id,
  };
}

// Backlog de Agencia (padel, Fase 3-4): /console necesita ver una
// convocatoria aunque ya no esté 'abierta' — el check-in (Fase 2) y la
// captura de marcadores (Fase 3-4) pasan DESPUÉS de cerrar inscripciones,
// no solo mientras está abierta. listOpenTournaments (solo 'abierta') se
// deja tal cual para no romper nada que ya la use; esta es la versión
// completa que usa la ruta real de /console.
export async function listAllTournaments(db: D1Database, tenantId: string): Promise<PadelTournament[]> {
  const { results } = await db
    .prepare("SELECT * FROM padel_tournaments WHERE tenant_id = ? ORDER BY id ASC")
    .bind(tenantId)
    .all<TournamentRow>();
  return results.map(mapTournament);
}

export async function listOpenTournaments(db: D1Database, tenantId: string): Promise<PadelTournament[]> {
  const { results } = await db
    .prepare("SELECT * FROM padel_tournaments WHERE tenant_id = ? AND status = 'abierta' ORDER BY id ASC")
    .bind(tenantId)
    .all<TournamentRow>();
  return results.map(mapTournament);
}

export async function getTournamentByLabel(db: D1Database, tenantId: string, label: string): Promise<PadelTournament | null> {
  const row = await db
    .prepare("SELECT * FROM padel_tournaments WHERE tenant_id = ? AND status = 'abierta' AND label = ? ORDER BY id DESC LIMIT 1")
    .bind(tenantId, label)
    .first<TournamentRow>();
  return row ? mapTournament(row) : null;
}

// Backlog de Agencia (ronda de reestructura): la confirmación de
// asistencia pasa DESPUÉS de que cierran inscripciones ('cerrada'), así
// que no se puede resolver como las demás tools por "la convocatoria
// abierta" — se busca directo por la inscripción activa más reciente de
// quien escribe, en una convocatoria que ya cerró pero no ha empezado.
export async function findTournamentAwaitingConfirmation(
  db: D1Database,
  tenantId: string,
  channel: string,
  playerId: string,
): Promise<{ tournamentId: number; label: string } | null> {
  const row = await db
    .prepare(
      `SELECT pt.id AS tournament_id, pt.label AS label FROM padel_registrations pr
       JOIN padel_tournaments pt ON pt.id = pr.tournament_id
       WHERE pr.tenant_id = ? AND pr.channel = ? AND pr.player_id = ? AND pr.status != 'cancelado' AND pt.status = 'cerrada'
       ORDER BY pr.id DESC LIMIT 1`,
    )
    .bind(tenantId, channel, playerId)
    .first<{ tournament_id: number; label: string }>();
  return row ? { tournamentId: row.tournament_id, label: row.label } : null;
}

export async function getTournamentById(db: D1Database, tenantId: string, tournamentId: number): Promise<PadelTournament | null> {
  const row = await db
    .prepare("SELECT * FROM padel_tournaments WHERE id = ? AND tenant_id = ?")
    .bind(tournamentId, tenantId)
    .first<TournamentRow>();
  return row ? mapTournament(row) : null;
}

export async function createTournament(
  db: D1Database,
  tenantId: string,
  input: {
    label: string;
    category?: string | null;
    scheduledAtUtc: string;
    registrationDeadlineUtc: string;
    capacity: number;
    registrationMode?: "individual" | "pareja";
    rounds?: number | null;
    courtCount?: number | null;
  },
): Promise<number> {
  const result = await db
    .prepare(
      "INSERT INTO padel_tournaments (tenant_id, label, category, scheduled_at_utc, registration_deadline_utc, capacity, registration_mode, rounds, court_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      tenantId,
      input.label,
      input.category ?? null,
      input.scheduledAtUtc,
      input.registrationDeadlineUtc,
      input.capacity,
      input.registrationMode ?? "individual",
      input.rounds ?? null,
      input.courtCount ?? null,
    )
    .run();
  return result.meta.last_row_id as number;
}

// Backlog de Agencia (padel, ronda de categorías): resolución sin
// ambigüedad — cada categoría tiene su propio grupo de Telegram, así que
// "la convocatoria abierta de esta categoría" ya no depende de que solo
// haya UNA convocatoria abierta en todo el tenant (ver src/padelTool.ts).
export async function getOpenTournamentForCategory(db: D1Database, tenantId: string, category: string): Promise<PadelTournament | null> {
  const row = await db
    .prepare("SELECT * FROM padel_tournaments WHERE tenant_id = ? AND category = ? AND status = 'abierta' ORDER BY id DESC LIMIT 1")
    .bind(tenantId, category)
    .first<TournamentRow>();
  return row ? mapTournament(row) : null;
}

// Filtra también por tenant_id (no solo por id) — mismo criterio de
// aislamiento cross-tenant que el resto del proyecto, aunque el llamador
// (rutas de /console) ya scopea por tenant, esta es la defensa real.
export async function closeTournament(db: D1Database, tenantId: string, tournamentId: number): Promise<void> {
  await db
    .prepare("UPDATE padel_tournaments SET status = 'cerrada' WHERE id = ? AND tenant_id = ?")
    .bind(tournamentId, tenantId)
    .run();
}

// Backlog de Agencia (padel): "Limpiar / Iniciar nuevo torneo" — Oscar
// confirmó explícitamente (pregunta directa) que quiere borrar de verdad
// las inscripciones/marcadores de ESA convocatoria para reusar el mismo
// registro la semana siguiente, en vez de conservar el historial. Real y
// destructivo a propósito — la ruta que llama a esto exige un
// confirmLabel exacto (mismo patrón que "Zona de peligro" al borrar un
// tenant), esta función en sí no pide confirmación, solo ejecuta.
// Backlog de Agencia (ronda de reestructura): Oscar pidió simplificar la
// confirmación — "escribir el nombre exacto es más que suficiente", sin
// exigir también fechas nuevas. Las fechas ahora son OPCIONALES: si no se
// mandan, la convocatoria se reabre con las MISMAS fechas que ya tenía
// (COALESCE), editables después por separado si hace falta.
export async function resetTournament(
  db: D1Database,
  tenantId: string,
  tournamentId: number,
  input: { scheduledAtUtc?: string | null; registrationDeadlineUtc?: string | null },
): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM padel_matches WHERE tournament_id = ? AND tenant_id = ?").bind(tournamentId, tenantId),
    db.prepare("DELETE FROM padel_registrations WHERE tournament_id = ? AND tenant_id = ?").bind(tournamentId, tenantId),
    db
      .prepare(
        "UPDATE padel_tournaments SET status = 'abierta', scheduled_at_utc = COALESCE(?, scheduled_at_utc), registration_deadline_utc = COALESCE(?, registration_deadline_utc) WHERE id = ? AND tenant_id = ?",
      )
      .bind(input.scheduledAtUtc ?? null, input.registrationDeadlineUtc ?? null, tournamentId, tenantId),
  ]);
}

// Backlog de Agencia (padel, Fase 3-4: "Score Engine") — status sigue
// siendo TEXT libre a propósito (ver migración 0030): 'en_curso' cuando se
// genera el fixture, 'finalizado' cuando se determina el campeón. Setter
// genérico compartido por src/padelMatches.ts, no exclusivo de "cerrar".
export async function setTournamentStatus(db: D1Database, tenantId: string, tournamentId: number, status: string): Promise<void> {
  await db.prepare("UPDATE padel_tournaments SET status = ? WHERE id = ? AND tenant_id = ?").bind(status, tournamentId, tenantId).run();
}

export async function listRegistrations(db: D1Database, tournamentId: number): Promise<PadelRegistration[]> {
  const { results } = await db
    .prepare("SELECT * FROM padel_registrations WHERE tournament_id = ? ORDER BY registered_at ASC, id ASC")
    .bind(tournamentId)
    .all<RegistrationRow>();
  return results.map(mapRegistration);
}

// La llave real de identidad es (tournament_id, channel, player_id) — NO
// chat_id, porque dentro de un grupo compartido todos los jugadores tienen
// el mismo chat_id. player_id es el Telegram user id individual del
// remitente (en una conversación 1:1, igual a chat_id).
async function mostRecentActiveRegistration(
  db: D1Database,
  tournamentId: number,
  channel: string,
  playerId: string,
): Promise<PadelRegistration | null> {
  const row = await db
    .prepare(
      "SELECT * FROM padel_registrations WHERE tournament_id = ? AND channel = ? AND player_id = ? ORDER BY id DESC LIMIT 1",
    )
    .bind(tournamentId, channel, playerId)
    .first<RegistrationRow>();
  if (!row || row.status === "cancelado") return null;
  return mapRegistration(row);
}

async function positionOf(db: D1Database, tournamentId: number, status: PadelRegistrationStatus, id: number): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS cnt FROM padel_registrations WHERE tournament_id = ? AND status = ? AND id <= ?")
    .bind(tournamentId, status, id)
    .first<{ cnt: number }>();
  return row?.cnt ?? 1;
}

export interface RegisterPlayerResult {
  status: "inscrito" | "lista_espera";
  position: number;
  capacity: number;
}

// Núcleo de la tool registerForTournament. Idempotente: si ya hay una fila
// activa (no cancelada) para este player_id en esta jornada, la devuelve tal
// cual en vez de duplicar (evita reintentos de webhook creando entradas
// dobles, y evita que la misma persona quede dos veces si vuelve a escribir
// "me apunto"). Si no hay ninguna, o la más reciente está cancelada, INSERTA
// una fila nueva — nunca "revive" la cancelada (ver comentario en la
// migración).
//
// La decisión inscrito/lista_espera se resuelve con un único INSERT...SELECT
// (conteo + decisión + inserción en una sola sentencia atómica) en vez de
// "leer conteo en JS, decidir, insertar" en pasos separados — así dos
// jugadores registrándose casi al mismo tiempo cerca del límite de cupo no
// pueden colarse ambos como "inscrito".
export async function registerPlayer(
  db: D1Database,
  tournament: PadelTournament,
  tenantId: string,
  input: { playerName: string; phone: string | null; channel: string; chatId: string; playerId: string },
): Promise<RegisterPlayerResult> {
  const existing = await mostRecentActiveRegistration(db, tournament.id, input.channel, input.playerId);
  if (existing) {
    const position = await positionOf(db, tournament.id, existing.status, existing.id);
    return { status: existing.status as "inscrito" | "lista_espera", position, capacity: tournament.capacity };
  }

  await db
    .prepare(
      `INSERT INTO padel_registrations (tournament_id, tenant_id, player_name, phone, channel, chat_id, player_id, status)
       SELECT ?, ?, ?, ?, ?, ?, ?,
         CASE WHEN (SELECT COUNT(*) FROM padel_registrations WHERE tournament_id = ? AND status = 'inscrito') < ?
              THEN 'inscrito' ELSE 'lista_espera' END`,
    )
    .bind(
      tournament.id,
      tenantId,
      input.playerName,
      input.phone,
      input.channel,
      input.chatId,
      input.playerId,
      tournament.id,
      tournament.capacity,
    )
    .run();

  const inserted = await db
    .prepare("SELECT * FROM padel_registrations WHERE tournament_id = ? AND channel = ? AND player_id = ? ORDER BY id DESC LIMIT 1")
    .bind(tournament.id, input.channel, input.playerId)
    .first<RegistrationRow>();
  if (!inserted) throw new Error("No se pudo registrar al jugador");

  const status = inserted.status as "inscrito" | "lista_espera";
  const position = await positionOf(db, tournament.id, status, inserted.id);
  return { status, position, capacity: tournament.capacity };
}

export async function getPlayerStatus(
  db: D1Database,
  tournamentId: number,
  channel: string,
  playerId: string,
): Promise<{ status: PadelRegistrationStatus; position: number } | null> {
  const registration = await mostRecentActiveRegistration(db, tournamentId, channel, playerId);
  if (!registration) return null;
  const position = registration.pairId
    ? await pairPositionOf(db, tournamentId, registration.status, registration.pairId)
    : await positionOf(db, tournamentId, registration.status, registration.id);
  return { status: registration.status, position };
}

// Posición de una PAREJA en la fila (inscritos o lista de espera) —
// cuenta parejas completas, no filas individuales, ordenadas por la fila
// más antigua de cada una (mismo criterio que positionOf, un nivel arriba).
async function pairPositionOf(db: D1Database, tournamentId: number, status: PadelRegistrationStatus, pairId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM (
         SELECT pair_id, MIN(id) AS first_id FROM padel_registrations
         WHERE tournament_id = ? AND status = ? AND pair_id IS NOT NULL GROUP BY pair_id
       ) grouped
       WHERE first_id <= (SELECT MIN(id) FROM padel_registrations WHERE tournament_id = ? AND pair_id = ?)`,
    )
    .bind(tournamentId, status, tournamentId, pairId)
    .first<{ cnt: number }>();
  return row?.cnt ?? 1;
}

export interface RegisterPairResult {
  status: "inscrito" | "lista_espera";
  position: number;
  capacity: number;
}

// Backlog de Agencia (ronda de canchas + parejas): equivalente de
// registerPlayer para torneos 'pareja' — Oscar confirmó que una pareja se
// inscribe JUNTA como una sola unidad, así que el cupo se cuenta en
// PAREJAS (COUNT(DISTINCT pair_id)), no en filas individuales. Inserta
// las 2 filas (una por integrante) en una sola sentencia INSERT...SELECT
// (UNION ALL de los 2 nombres) para que ambas lean el MISMO estado previo
// de la tabla y decidan el MISMO status — igual que registerPlayer evita
// que dos registros casi simultáneos se cuelen ambos, esto evita que los 2
// integrantes de una pareja queden con status distinto entre sí.
export async function registerPair(
  db: D1Database,
  tournament: PadelTournament,
  tenantId: string,
  input: { player1Name: string; player2Name: string; phone: string | null; channel: string; chatId: string; playerId: string },
): Promise<RegisterPairResult> {
  const existing = await mostRecentActiveRegistration(db, tournament.id, input.channel, input.playerId);
  if (existing && existing.pairId) {
    const position = await pairPositionOf(db, tournament.id, existing.status, existing.pairId);
    return { status: existing.status as "inscrito" | "lista_espera", position, capacity: tournament.capacity };
  }

  const pairId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO padel_registrations (tournament_id, tenant_id, player_name, phone, channel, chat_id, player_id, pair_id, status)
       SELECT ?, ?, name, ?, ?, ?, ?, ?,
         CASE WHEN (SELECT COUNT(DISTINCT pair_id) FROM padel_registrations WHERE tournament_id = ? AND status = 'inscrito' AND pair_id IS NOT NULL) < ?
              THEN 'inscrito' ELSE 'lista_espera' END
       FROM (SELECT ? AS name UNION ALL SELECT ? AS name)`,
    )
    .bind(
      tournament.id,
      tenantId,
      input.phone,
      input.channel,
      input.chatId,
      input.playerId,
      pairId,
      tournament.id,
      tournament.capacity,
      input.player1Name,
      input.player2Name,
    )
    .run();

  const inserted = await db
    .prepare("SELECT * FROM padel_registrations WHERE tournament_id = ? AND pair_id = ? ORDER BY id DESC LIMIT 1")
    .bind(tournament.id, pairId)
    .first<RegistrationRow>();
  if (!inserted) throw new Error("No se pudo registrar a la pareja");

  const status = inserted.status as "inscrito" | "lista_espera";
  const position = await pairPositionOf(db, tournament.id, status, pairId);
  return { status, position, capacity: tournament.capacity };
}

export interface CancelRegistrationResult {
  cancelled: PadelRegistration;
  promoted: PadelRegistration | null;
}

// Si el registro cancelado ocupaba un lugar real (`inscrito`), promueve
// automáticamente al primero de la lista de espera (por orden de llegada).
// Devuelve `promoted` con su chatId (el grupo, respaldo) Y playerId (para
// intentar avisarle por privado primero) — el llamador (tool o ruta de
// /console) decide cómo notificar, esta función solo mueve el dato.
//
// Pareja fija (torneos 'pareja'): cancelar a UNO de los dos cancela a la
// pareja COMPLETA (nunca queda uno activo sin su compañero), y se
// promueve la siguiente PAREJA completa de la lista de espera, nunca un
// integrante suelto. Como las 2 filas de una pareja comparten el mismo
// `channel`/`player_id` (ver registerPair), `promoted` sigue siendo una
// sola fila — alcanza para notificar, ya que ambas resuelven al mismo
// destinatario real de Telegram.
export async function cancelRegistration(
  db: D1Database,
  tenantId: string,
  tournamentId: number,
  channel: string,
  playerId: string,
): Promise<CancelRegistrationResult | null> {
  const registration = await mostRecentActiveRegistration(db, tournamentId, channel, playerId);
  if (!registration) return null;

  const toCancel = registration.pairId
    ? (await listRegistrations(db, tournamentId)).filter((r) => r.pairId === registration.pairId && r.status !== "cancelado")
    : [registration];

  await db.batch(
    toCancel.map((r) => db.prepare("UPDATE padel_registrations SET status = 'cancelado' WHERE id = ? AND tenant_id = ?").bind(r.id, tenantId)),
  );
  const cancelled: PadelRegistration = { ...registration, status: "cancelado" };

  let promoted: PadelRegistration | null = null;
  if (registration.status === "inscrito") {
    if (registration.pairId) {
      const waitingPairs = new Map<string, PadelRegistration[]>();
      for (const r of await listRegistrations(db, tournamentId)) {
        if (r.status !== "lista_espera" || !r.pairId) continue;
        if (!waitingPairs.has(r.pairId)) waitingPairs.set(r.pairId, []);
        waitingPairs.get(r.pairId)!.push(r);
      }
      let nextPair: PadelRegistration[] | null = null;
      let earliestId = Infinity;
      for (const group of waitingPairs.values()) {
        if (group.length < 2) continue; // pareja incompleta, no debería pasar — no se promueve
        const groupFirstId = Math.min(...group.map((g) => g.id));
        if (groupFirstId < earliestId) {
          earliestId = groupFirstId;
          nextPair = group;
        }
      }
      if (nextPair) {
        await db.batch(nextPair.map((r) => db.prepare("UPDATE padel_registrations SET status = 'inscrito' WHERE id = ?").bind(r.id)));
        promoted = { ...nextPair[0], status: "inscrito" };
      }
    } else {
      const nextInLine = await db
        .prepare("SELECT * FROM padel_registrations WHERE tournament_id = ? AND status = 'lista_espera' AND pair_id IS NULL ORDER BY id ASC LIMIT 1")
        .bind(tournamentId)
        .first<RegistrationRow>();
      if (nextInLine) {
        await db.prepare("UPDATE padel_registrations SET status = 'inscrito' WHERE id = ?").bind(nextInLine.id).run();
        promoted = { ...mapRegistration(nextInLine), status: "inscrito" };
      }
    }
  }

  return { cancelled, promoted };
}

// Cancelación manual por el club desde /console (a diferencia de
// cancelRegistration, que la dispara el propio jugador vía la tool) — se
// identifica por registration id, no por player_id, porque el club ve una
// tabla de filas, no una conversación. Misma lógica de promoción.
export async function cancelRegistrationById(db: D1Database, tenantId: string, registrationId: number): Promise<CancelRegistrationResult | null> {
  const row = await db
    .prepare("SELECT * FROM padel_registrations WHERE id = ? AND tenant_id = ?")
    .bind(registrationId, tenantId)
    .first<RegistrationRow>();
  if (!row || row.status === "cancelado") return null;
  const registration = mapRegistration(row);
  return cancelRegistration(db, tenantId, registration.tournamentId, registration.channel, registration.playerId);
}

// Backlog de Agencia (padel, Fase 2: "Reception Bot" — check-in en el
// club). Actualización parcial a propósito (mismo patrón que
// upsertTenantSettings): el staff puede marcar "pagó" y "asistió" en
// momentos distintos, un COALESCE evita que tocar uno borre el otro.
//
// Pareja fija: si la fila tiene pair_id, el mismo check-in se aplica a
// los 2 integrantes — en la práctica pagan y llegan juntos, y así el
// staff no tiene que repetir el mismo clic 2 veces por pareja.
export async function setRegistrationCheckin(
  db: D1Database,
  tenantId: string,
  registrationId: number,
  input: { paid?: boolean; attended?: boolean | null; confirmed?: boolean | null },
): Promise<void> {
  const paidValue = input.paid === undefined ? null : input.paid ? 1 : 0;

  const row = await db.prepare("SELECT pair_id FROM padel_registrations WHERE id = ? AND tenant_id = ?").bind(registrationId, tenantId).first<{ pair_id: string | null }>();
  const whereClause = row?.pair_id
    ? "WHERE pair_id = ? AND tenant_id = ?"
    : "WHERE id = ? AND tenant_id = ?";
  const whereParams: [string | number, string] = row?.pair_id ? [row.pair_id, tenantId] : [registrationId, tenantId];

  // attended/confirmed aceptan explícitamente `null` (volver a "sin
  // confirmar"), por eso NO pueden usar el mismo truco de COALESCE que
  // paid — se arma el SET dinámicamente para solo tocar los campos que
  // de verdad vinieron en el input, distinguiendo "no lo mandaron"
  // (undefined, no tocar) de "lo mandaron como null" (sí tocar).
  const setParts = ["paid = COALESCE(?, paid)"];
  const bindValues: (number | null)[] = [paidValue];
  if (input.attended !== undefined) {
    setParts.push("attended = ?");
    bindValues.push(input.attended === null ? null : input.attended ? 1 : 0);
  }
  if (input.confirmed !== undefined) {
    setParts.push("confirmed = ?");
    bindValues.push(input.confirmed === null ? null : input.confirmed ? 1 : 0);
  }

  await db
    .prepare(`UPDATE padel_registrations SET ${setParts.join(", ")} ${whereClause}`)
    .bind(...bindValues, ...whereParams)
    .run();
}

// Backlog de Agencia (ronda de reestructura): confirmación de asistencia
// tras el cierre de inscripciones — el propio jugador contesta al bot
// ("sí"/"no") y esto guarda la respuesta. Cascada a la pareja: como las 2
// filas de una pareja fija comparten channel+player_id (ver registerPair),
// mostRecentActiveRegistration ya resuelve al registrante real, y la
// respuesta se refleja en AMBAS filas de esa pareja — quien contesta
// habla por los dos.
export async function setConfirmedAttendance(
  db: D1Database,
  tenantId: string,
  tournamentId: number,
  channel: string,
  playerId: string,
  confirmed: boolean,
): Promise<PadelRegistration | null> {
  const registration = await mostRecentActiveRegistration(db, tournamentId, channel, playerId);
  if (!registration) return null;

  const confirmedValue = confirmed ? 1 : 0;
  if (registration.pairId) {
    await db
      .prepare("UPDATE padel_registrations SET confirmed = ? WHERE pair_id = ? AND tenant_id = ?")
      .bind(confirmedValue, registration.pairId, tenantId)
      .run();
  } else {
    await db
      .prepare("UPDATE padel_registrations SET confirmed = ? WHERE id = ? AND tenant_id = ?")
      .bind(confirmedValue, registration.id, tenantId)
      .run();
  }
  return { ...registration, confirmed };
}

// Backlog de Agencia (padel, Fase 2): un jugador que se presenta en el club
// sin haberse inscrito antes por el grupo de Telegram ("espontáneo" en el
// pedido original de Oscar) — el staff lo agrega directo desde /console.
// Reusa registerPlayer (mismo respeto de cupo/lista de espera vía el
// INSERT...SELECT atómico — si ya no hay lugar, entra a lista de espera
// igual que cualquiera, el staff decide si libera un lugar cancelando un
// no-show antes de agregarlo). Se marca attended=true de inmediato porque,
// a diferencia de un registro por Telegram, quien lo agrega SABE que está
// físicamente ahí en ese momento.
export async function addWalkInPlayer(
  db: D1Database,
  tournament: PadelTournament,
  tenantId: string,
  input: { playerName: string; phone: string | null },
): Promise<RegisterPlayerResult> {
  const playerId = crypto.randomUUID();
  const result = await registerPlayer(db, tournament, tenantId, {
    playerName: input.playerName,
    phone: input.phone,
    channel: "console",
    chatId: "console",
    playerId,
  });
  const inserted = await db
    .prepare("SELECT * FROM padel_registrations WHERE tournament_id = ? AND channel = 'console' AND player_id = ? ORDER BY id DESC LIMIT 1")
    .bind(tournament.id, playerId)
    .first<RegistrationRow>();
  if (inserted) {
    await db.prepare("UPDATE padel_registrations SET attended = 1 WHERE id = ?").bind(inserted.id).run();
  }
  return result;
}

// Equivalente a addWalkInPlayer para torneos 'pareja' — reusa registerPair
// completo (mismo cupo/lista de espera atómico por PAREJA), y marca a los
// 2 integrantes como attended=true de inmediato (quien los agrega sabe
// que ambos están físicamente ahí).
export async function addWalkInPair(
  db: D1Database,
  tournament: PadelTournament,
  tenantId: string,
  input: { player1Name: string; player2Name: string; phone: string | null },
): Promise<RegisterPairResult> {
  const playerId = crypto.randomUUID();
  const result = await registerPair(db, tournament, tenantId, {
    player1Name: input.player1Name,
    player2Name: input.player2Name,
    phone: input.phone,
    channel: "console",
    chatId: "console",
    playerId,
  });
  await db
    .prepare("UPDATE padel_registrations SET attended = 1 WHERE tournament_id = ? AND channel = 'console' AND player_id = ?")
    .bind(tournament.id, playerId)
    .run();
  return result;
}
