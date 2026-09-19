import { describe, expect, it } from "vitest";
import {
  addWalkInPair,
  addWalkInPlayer,
  cancelRegistration,
  cancelRegistrationById,
  closeTournament,
  createTournament,
  findTournamentAwaitingConfirmation,
  getPlayerStatus,
  getTournamentByLabel,
  getTournamentById,
  listOpenTournaments,
  listRegistrations,
  registerPair,
  registerPlayer,
  resetTournament,
  setConfirmedAttendance,
  setRegistrationCheckin,
  type PadelTournament,
} from "../src/padel";
import { generateFixture, listMatches } from "../src/padelMatches";
import { createFakePadelD1 } from "./fakePadelD1";

async function openTournament(db: D1Database, tenantId: string, capacity = 20): Promise<PadelTournament> {
  const id = await createTournament(db, tenantId, {
    label: "Categoría B",
    scheduledAtUtc: "2026-09-10T19:00:00.000Z",
    registrationDeadlineUtc: "2026-09-10T18:00:00.000Z",
    capacity,
  });
  const found = await getTournamentByLabel(db, tenantId, "Categoría B");
  if (!found || found.id !== id) throw new Error("setup falló");
  return found;
}

async function openPairTournament(db: D1Database, tenantId: string, capacity = 20): Promise<PadelTournament> {
  const id = await createTournament(db, tenantId, {
    label: "Torneo de Parejas",
    scheduledAtUtc: "2026-09-10T19:00:00.000Z",
    registrationDeadlineUtc: "2026-09-10T18:00:00.000Z",
    capacity,
    registrationMode: "pareja",
  });
  const found = await getTournamentById(db, tenantId, id);
  if (!found) throw new Error("setup falló");
  return found;
}

describe("registerPlayer", () => {
  it("inscribe normalmente cuando hay cupo", async () => {
    const db = createFakePadelD1();
    const tournament = await openTournament(db, "club-1", 2);

    const result = await registerPlayer(db, tournament, "club-1", { playerName: "Juan", phone: null, channel: "telegram", chatId: "group-1", playerId: "p1" });

    expect(result).toEqual({ status: "inscrito", position: 1, capacity: 2 });
  });

  it("manda a lista de espera cuando ya no hay cupo, con la posición correcta", async () => {
    const db = createFakePadelD1();
    const tournament = await openTournament(db, "club-1", 1);

    await registerPlayer(db, tournament, "club-1", { playerName: "Juan", phone: null, channel: "telegram", chatId: "g", playerId: "p1" });
    const second = await registerPlayer(db, tournament, "club-1", { playerName: "Ana", phone: null, channel: "telegram", chatId: "g", playerId: "p2" });

    expect(second).toEqual({ status: "lista_espera", position: 1, capacity: 1 });
  });

  it("es idempotente: la misma persona (mismo player_id) no se duplica al volver a escribir", async () => {
    const db = createFakePadelD1();
    const tournament = await openTournament(db, "club-1", 20);

    const first = await registerPlayer(db, tournament, "club-1", { playerName: "Juan", phone: null, channel: "telegram", chatId: "g", playerId: "p1" });
    const again = await registerPlayer(db, tournament, "club-1", { playerName: "Juan Pérez", phone: null, channel: "telegram", chatId: "g", playerId: "p1" });

    expect(again).toEqual(first);
    const roster = await listRegistrations(db, tournament.id);
    expect(roster).toHaveLength(1);
  });

  it("dos player_id distintos son personas distintas aunque compartan el mismo chat_id (grupo)", async () => {
    const db = createFakePadelD1();
    const tournament = await openTournament(db, "club-1", 20);

    await registerPlayer(db, tournament, "club-1", { playerName: "Juan", phone: null, channel: "telegram", chatId: "grupo-compartido", playerId: "p1" });
    await registerPlayer(db, tournament, "club-1", { playerName: "Ana", phone: null, channel: "telegram", chatId: "grupo-compartido", playerId: "p2" });

    const roster = await listRegistrations(db, tournament.id);
    expect(roster.map((r) => r.playerName)).toEqual(["Juan", "Ana"]);
  });
});

describe("cancelRegistration", () => {
  it("cancelar un lugar inscrito promueve al primero de la lista de espera", async () => {
    const db = createFakePadelD1();
    const tournament = await openTournament(db, "club-1", 1);

    await registerPlayer(db, tournament, "club-1", { playerName: "Juan", phone: null, channel: "telegram", chatId: "g", playerId: "p1" });
    await registerPlayer(db, tournament, "club-1", { playerName: "Ana", phone: null, channel: "telegram", chatId: "g", playerId: "p2" });

    const result = await cancelRegistration(db, "club-1", tournament.id, "telegram", "p1");

    expect(result?.cancelled.status).toBe("cancelado");
    expect(result?.promoted?.playerName).toBe("Ana");
    const anaStatus = await getPlayerStatus(db, tournament.id, "telegram", "p2");
    expect(anaStatus).toEqual({ status: "inscrito", position: 1 });
  });

  it("cancelar un lugar en lista de espera no promueve a nadie", async () => {
    const db = createFakePadelD1();
    const tournament = await openTournament(db, "club-1", 1);

    await registerPlayer(db, tournament, "club-1", { playerName: "Juan", phone: null, channel: "telegram", chatId: "g", playerId: "p1" });
    await registerPlayer(db, tournament, "club-1", { playerName: "Ana", phone: null, channel: "telegram", chatId: "g", playerId: "p2" });

    const result = await cancelRegistration(db, "club-1", tournament.id, "telegram", "p2");

    expect(result?.cancelled.status).toBe("cancelado");
    expect(result?.promoted).toBeNull();
  });

  it("re-registrarse tras cancelar inserta una fila NUEVA (no revive la cancelada) — entra al final de la cola real", async () => {
    const db = createFakePadelD1();
    const tournament = await openTournament(db, "club-1", 20);

    await registerPlayer(db, tournament, "club-1", { playerName: "Juan", phone: null, channel: "telegram", chatId: "g", playerId: "p1" });
    await cancelRegistration(db, "club-1", tournament.id, "telegram", "p1");
    // Alguien más se inscribe MIENTRAS Juan estaba cancelado.
    await registerPlayer(db, tournament, "club-1", { playerName: "Ana", phone: null, channel: "telegram", chatId: "g", playerId: "p2" });
    const rejoined = await registerPlayer(db, tournament, "club-1", { playerName: "Juan", phone: null, channel: "telegram", chatId: "g", playerId: "p1" });

    // Juan queda DESPUÉS de Ana, no adelante — su fila cancelada no se reciclò.
    expect(rejoined.position).toBe(2);
    const roster = await listRegistrations(db, tournament.id);
    expect(roster).toHaveLength(3);
  });

  it("devuelve null si no hay una inscripción activa para ese jugador", async () => {
    const db = createFakePadelD1();
    const tournament = await openTournament(db, "club-1", 20);

    const result = await cancelRegistration(db, "club-1", tournament.id, "telegram", "nadie-registrado");

    expect(result).toBeNull();
  });
});

describe("cancelRegistrationById (cancelación manual del club desde /console)", () => {
  it("cancela por id de fila y promueve igual que la cancelación del propio jugador", async () => {
    const db = createFakePadelD1();
    const tournament = await openTournament(db, "club-1", 1);
    await registerPlayer(db, tournament, "club-1", { playerName: "Juan", phone: null, channel: "telegram", chatId: "g", playerId: "p1" });
    await registerPlayer(db, tournament, "club-1", { playerName: "Ana", phone: null, channel: "telegram", chatId: "g", playerId: "p2" });
    const [juanRow] = await listRegistrations(db, tournament.id);

    const result = await cancelRegistrationById(db, "club-1", juanRow.id);

    expect(result?.promoted?.playerName).toBe("Ana");
  });
});

describe("createTournament / listOpenTournaments / closeTournament", () => {
  it("un club puede tener varias convocatorias abiertas a la vez (categorías/fechas distintas)", async () => {
    const db = createFakePadelD1();
    await createTournament(db, "club-1", { label: "Categoría A", scheduledAtUtc: "x", registrationDeadlineUtc: "y", capacity: 20 });
    await createTournament(db, "club-1", { label: "Categoría B", scheduledAtUtc: "x", registrationDeadlineUtc: "y", capacity: 20 });

    const open = await listOpenTournaments(db, "club-1");

    expect(open.map((t) => t.label)).toEqual(["Categoría A", "Categoría B"]);
  });

  it("cerrar una convocatoria la saca de listOpenTournaments", async () => {
    const db = createFakePadelD1();
    const tournament = await openTournament(db, "club-1", 20);

    await closeTournament(db, "club-1", tournament.id);

    expect(await listOpenTournaments(db, "club-1")).toEqual([]);
  });

  it("aislamiento cross-tenant: el club A no ve las convocatorias del club B", async () => {
    const db = createFakePadelD1();
    await createTournament(db, "club-a", { label: "Torneo", scheduledAtUtc: "x", registrationDeadlineUtc: "y", capacity: 20 });
    await createTournament(db, "club-b", { label: "Torneo", scheduledAtUtc: "x", registrationDeadlineUtc: "y", capacity: 20 });

    expect(await listOpenTournaments(db, "club-a")).toHaveLength(1);
    expect(await listOpenTournaments(db, "club-b")).toHaveLength(1);
  });
});

// Backlog de Agencia (padel): "Limpiar / Iniciar nuevo torneo" — Oscar
// confirmó que quiere borrar de verdad inscripciones/marcadores para
// reusar la misma convocatoria la semana siguiente (no conservar historial).
describe("resetTournament", () => {
  it("borra registros y matches, y regresa la convocatoria a 'abierta' con nueva fecha", async () => {
    const db = createFakePadelD1();
    const tournament = await openTournament(db, "club-1", 20);
    for (let i = 0; i < 20; i++) {
      await registerPlayer(db, tournament, "club-1", { playerName: `J${i}`, phone: null, channel: "telegram", chatId: "g", playerId: `p${i}` });
    }
    const regs = await listRegistrations(db, tournament.id);
    for (const r of regs) await setRegistrationCheckin(db, "club-1", r.id, { attended: true });
    await generateFixture(db, tournament, "club-1");

    await resetTournament(db, "club-1", tournament.id, {
      scheduledAtUtc: "2026-09-17T19:00:00.000Z",
      registrationDeadlineUtc: "2026-09-17T18:00:00.000Z",
    });

    expect(await listRegistrations(db, tournament.id)).toEqual([]);
    expect(await listMatches(db, tournament.id)).toEqual([]);
    const reset = await getTournamentById(db, "club-1", tournament.id);
    expect(reset?.status).toBe("abierta");
    expect(reset?.scheduledAtUtc).toBe("2026-09-17T19:00:00.000Z");
  });

  it("no toca las convocatorias de otro tenant", async () => {
    const db = createFakePadelD1();
    const tournamentA = await createTournament(db, "club-a", { label: "T", scheduledAtUtc: "x", registrationDeadlineUtc: "y", capacity: 20 });
    const tournamentBRef = await createTournament(db, "club-b", { label: "T", scheduledAtUtc: "x", registrationDeadlineUtc: "y", capacity: 20 });

    await resetTournament(db, "club-a", tournamentA, { scheduledAtUtc: "new", registrationDeadlineUtc: "new" });

    const untouched = await getTournamentById(db, "club-b", tournamentBRef);
    expect(untouched?.scheduledAtUtc).toBe("x");
  });
});

// Backlog de Agencia (padel, Fase 2: "Reception Bot" — check-in en el club).
describe("setRegistrationCheckin", () => {
  it("marca pagado sin tocar attended", async () => {
    const db = createFakePadelD1();
    const tournament = await openTournament(db, "club-1", 20);
    await registerPlayer(db, tournament, "club-1", { playerName: "Juan", phone: null, channel: "telegram", chatId: "g", playerId: "p1" });
    const [row] = await listRegistrations(db, tournament.id);

    await setRegistrationCheckin(db, "club-1", row.id, { paid: true });

    const [updated] = await listRegistrations(db, tournament.id);
    expect(updated.paid).toBe(true);
    expect(updated.attended).toBeNull();
  });

  it("marca presente/no-show sin tocar paid", async () => {
    const db = createFakePadelD1();
    const tournament = await openTournament(db, "club-1", 20);
    await registerPlayer(db, tournament, "club-1", { playerName: "Juan", phone: null, channel: "telegram", chatId: "g", playerId: "p1" });
    const [row] = await listRegistrations(db, tournament.id);

    await setRegistrationCheckin(db, "club-1", row.id, { attended: true });
    let [updated] = await listRegistrations(db, tournament.id);
    expect(updated.attended).toBe(true);
    expect(updated.paid).toBe(false);

    await setRegistrationCheckin(db, "club-1", row.id, { attended: false });
    [updated] = await listRegistrations(db, tournament.id);
    expect(updated.attended).toBe(false);
  });

  it("puede marcar pagado y presente en la misma llamada", async () => {
    const db = createFakePadelD1();
    const tournament = await openTournament(db, "club-1", 20);
    await registerPlayer(db, tournament, "club-1", { playerName: "Juan", phone: null, channel: "telegram", chatId: "g", playerId: "p1" });
    const [row] = await listRegistrations(db, tournament.id);

    await setRegistrationCheckin(db, "club-1", row.id, { paid: true, attended: true });

    const [updated] = await listRegistrations(db, tournament.id);
    expect(updated.paid).toBe(true);
    expect(updated.attended).toBe(true);
  });
});

describe("addWalkInPlayer", () => {
  it("agrega un jugador espontáneo, respeta el cupo, y lo marca presente de inmediato", async () => {
    const db = createFakePadelD1();
    const tournament = await openTournament(db, "club-1", 20);

    const result = await addWalkInPlayer(db, tournament, "club-1", { playerName: "Espontáneo Pérez", phone: null });

    expect(result).toEqual({ status: "inscrito", position: 1, capacity: 20 });
    const [row] = await listRegistrations(db, tournament.id);
    expect(row.attended).toBe(true);
    expect(row.paid).toBe(false);
    expect(row.channel).toBe("console");
  });

  it("un espontáneo también puede caer en lista de espera si ya no hay cupo", async () => {
    const db = createFakePadelD1();
    const tournament = await openTournament(db, "club-1", 1);
    await registerPlayer(db, tournament, "club-1", { playerName: "Juan", phone: null, channel: "telegram", chatId: "g", playerId: "p1" });

    const result = await addWalkInPlayer(db, tournament, "club-1", { playerName: "Espontáneo Pérez", phone: null });

    expect(result.status).toBe("lista_espera");
  });
});

// Backlog de Agencia (ronda de canchas + parejas): torneo de pareja FIJA
// (Oscar confirmó, pregunta directa: "se inscriben juntos, una pareja =
// una inscripción") — 2 filas ligadas por pair_id, nunca se separan.
describe("registerPair", () => {
  it("inscribe a las 2 personas juntas, contando el cupo en PAREJAS", async () => {
    const db = createFakePadelD1();
    const tournament = await openPairTournament(db, "club-1", 1); // cupo = 1 pareja

    const result = await registerPair(db, tournament, "club-1", {
      player1Name: "Juan", player2Name: "Ana", phone: null, channel: "telegram", chatId: "g", playerId: "p1",
    });

    expect(result).toEqual({ status: "inscrito", position: 1, capacity: 1 });
    const roster = await listRegistrations(db, tournament.id);
    expect(roster).toHaveLength(2);
    expect(roster[0].pairId).not.toBeNull();
    expect(roster[0].pairId).toBe(roster[1].pairId);
    expect(roster.map((r) => r.playerName)).toEqual(["Juan", "Ana"]);
  });

  it("la segunda pareja cae en lista de espera cuando ya no hay cupo (en parejas, no en individuos)", async () => {
    const db = createFakePadelD1();
    const tournament = await openPairTournament(db, "club-1", 1);
    await registerPair(db, tournament, "club-1", { player1Name: "Juan", player2Name: "Ana", phone: null, channel: "telegram", chatId: "g", playerId: "p1" });

    const second = await registerPair(db, tournament, "club-1", { player1Name: "Luis", player2Name: "María", phone: null, channel: "telegram", chatId: "g", playerId: "p2" });

    expect(second.status).toBe("lista_espera");
    expect(second.position).toBe(1); // primera pareja en espera, no la 3ra fila
  });

  it("es idempotente por player_id: no duplica la pareja si el registrante vuelve a escribir", async () => {
    const db = createFakePadelD1();
    const tournament = await openPairTournament(db, "club-1", 20);

    await registerPair(db, tournament, "club-1", { player1Name: "Juan", player2Name: "Ana", phone: null, channel: "telegram", chatId: "g", playerId: "p1" });
    const again = await registerPair(db, tournament, "club-1", { player1Name: "Juan Pérez", player2Name: "Ana Gómez", phone: null, channel: "telegram", chatId: "g", playerId: "p1" });

    expect(again.status).toBe("inscrito");
    const roster = await listRegistrations(db, tournament.id);
    expect(roster).toHaveLength(2); // sigue siendo 1 sola pareja, no se duplicó
  });
});

describe("cancelRegistration en modo pareja", () => {
  it("cancelar a UNO de los dos cancela a la pareja COMPLETA", async () => {
    const db = createFakePadelD1();
    const tournament = await openPairTournament(db, "club-1", 20);
    await registerPair(db, tournament, "club-1", { player1Name: "Juan", player2Name: "Ana", phone: null, channel: "telegram", chatId: "g", playerId: "p1" });

    const result = await cancelRegistration(db, "club-1", tournament.id, "telegram", "p1");

    expect(result?.cancelled.status).toBe("cancelado");
    const roster = await listRegistrations(db, tournament.id);
    expect(roster.every((r) => r.status === "cancelado")).toBe(true);
  });

  it("cancelar una pareja inscrita promueve a la PRIMERA pareja completa en lista de espera (no un integrante suelto)", async () => {
    const db = createFakePadelD1();
    const tournament = await openPairTournament(db, "club-1", 1);
    await registerPair(db, tournament, "club-1", { player1Name: "Juan", player2Name: "Ana", phone: null, channel: "telegram", chatId: "g", playerId: "p1" });
    await registerPair(db, tournament, "club-1", { player1Name: "Luis", player2Name: "María", phone: null, channel: "telegram", chatId: "g", playerId: "p2" });

    const result = await cancelRegistration(db, "club-1", tournament.id, "telegram", "p1");

    expect(result?.promoted).not.toBeNull();
    const roster = await listRegistrations(db, tournament.id);
    const luisMaria = roster.filter((r) => r.playerName === "Luis" || r.playerName === "María");
    expect(luisMaria.every((r) => r.status === "inscrito")).toBe(true); // los 2, juntos
  });
});

describe("addWalkInPair", () => {
  it("agrega una pareja espontánea, respeta el cupo en parejas, y marca a los 2 presentes de inmediato", async () => {
    const db = createFakePadelD1();
    const tournament = await openPairTournament(db, "club-1", 20);

    const result = await addWalkInPair(db, tournament, "club-1", { player1Name: "Espontáneo", player2Name: "Espontánea", phone: null });

    expect(result).toEqual({ status: "inscrito", position: 1, capacity: 20 });
    const roster = await listRegistrations(db, tournament.id);
    expect(roster).toHaveLength(2);
    expect(roster.every((r) => r.attended === true)).toBe(true);
  });
});

// Backlog de Agencia (ronda de reestructura): "posterior a la hora límite
// de inscripción, buscar que confirmen que van a participar" — la
// confirmación pasa DESPUÉS de que la convocatoria ya cerró ('cerrada'),
// así que findTournamentAwaitingConfirmation no puede resolverla como una
// convocatoria "abierta" — se busca por la inscripción activa del jugador.
describe("findTournamentAwaitingConfirmation / setConfirmedAttendance", () => {
  it("encuentra la convocatoria cerrada donde el jugador tiene una inscripción activa", async () => {
    const db = createFakePadelD1();
    const tournament = await openTournament(db, "club-1", 20);
    await registerPlayer(db, tournament, "club-1", { playerName: "Juan", phone: null, channel: "telegram", chatId: "g", playerId: "p1" });
    await closeTournament(db, "club-1", tournament.id);

    const pending = await findTournamentAwaitingConfirmation(db, "club-1", "telegram", "p1");

    expect(pending).toEqual({ tournamentId: tournament.id, label: "Categoría B" });
  });

  it("devuelve null si la convocatoria sigue abierta (todavía no le toca confirmar)", async () => {
    const db = createFakePadelD1();
    const tournament = await openTournament(db, "club-1", 20);
    await registerPlayer(db, tournament, "club-1", { playerName: "Juan", phone: null, channel: "telegram", chatId: "g", playerId: "p1" });

    const pending = await findTournamentAwaitingConfirmation(db, "club-1", "telegram", "p1");

    expect(pending).toBeNull();
  });

  it("devuelve null si no tiene ninguna inscripción activa", async () => {
    const db = createFakePadelD1();
    const tournament = await openTournament(db, "club-1", 20);
    await closeTournament(db, "club-1", tournament.id);

    const pending = await findTournamentAwaitingConfirmation(db, "club-1", "telegram", "nadie-registrado");

    expect(pending).toBeNull();
  });

  it("guarda confirmed=true/false en la inscripción real", async () => {
    const db = createFakePadelD1();
    const tournament = await openTournament(db, "club-1", 20);
    await registerPlayer(db, tournament, "club-1", { playerName: "Juan", phone: null, channel: "telegram", chatId: "g", playerId: "p1" });
    await closeTournament(db, "club-1", tournament.id);

    const result = await setConfirmedAttendance(db, "club-1", tournament.id, "telegram", "p1", true);

    expect(result?.confirmed).toBe(true);
    const [row] = await listRegistrations(db, tournament.id);
    expect(row.confirmed).toBe(true);
  });

  it("cascada a la pareja completa en torneos de pareja fija", async () => {
    const db = createFakePadelD1();
    const tournament = await openPairTournament(db, "club-1", 20);
    await registerPair(db, tournament, "club-1", { player1Name: "Juan", player2Name: "Ana", phone: null, channel: "telegram", chatId: "g", playerId: "p1" });
    await closeTournament(db, "club-1", tournament.id);

    await setConfirmedAttendance(db, "club-1", tournament.id, "telegram", "p1", false);

    const roster = await listRegistrations(db, tournament.id);
    expect(roster.every((r) => r.confirmed === false)).toBe(true);
  });

  it("devuelve null si no hay una inscripción activa para ese jugador", async () => {
    const db = createFakePadelD1();
    const tournament = await openTournament(db, "club-1", 20);
    await closeTournament(db, "club-1", tournament.id);

    const result = await setConfirmedAttendance(db, "club-1", tournament.id, "telegram", "nadie-registrado", true);

    expect(result).toBeNull();
  });
});

// Backlog de Agencia: respaldo manual desde /console si alguien confirma
// por otro medio (llamada, WhatsApp personal) en vez de contestarle al bot.
describe("setRegistrationCheckin con confirmed", () => {
  it("marca confirmed sin tocar paid ni attended", async () => {
    const db = createFakePadelD1();
    const tournament = await openTournament(db, "club-1", 20);
    await registerPlayer(db, tournament, "club-1", { playerName: "Juan", phone: null, channel: "telegram", chatId: "g", playerId: "p1" });
    const [row] = await listRegistrations(db, tournament.id);

    await setRegistrationCheckin(db, "club-1", row.id, { confirmed: true });

    const [updated] = await listRegistrations(db, tournament.id);
    expect(updated.confirmed).toBe(true);
    expect(updated.paid).toBe(false);
    expect(updated.attended).toBeNull();
  });

  it("puede marcar pagado, presente y confirmado en la misma llamada", async () => {
    const db = createFakePadelD1();
    const tournament = await openTournament(db, "club-1", 20);
    await registerPlayer(db, tournament, "club-1", { playerName: "Juan", phone: null, channel: "telegram", chatId: "g", playerId: "p1" });
    const [row] = await listRegistrations(db, tournament.id);

    await setRegistrationCheckin(db, "club-1", row.id, { paid: true, attended: true, confirmed: true });

    const [updated] = await listRegistrations(db, tournament.id);
    expect(updated.paid).toBe(true);
    expect(updated.attended).toBe(true);
    expect(updated.confirmed).toBe(true);
  });
});
