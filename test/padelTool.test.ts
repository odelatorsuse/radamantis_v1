import { describe, expect, it, vi } from "vitest";
import { closeTournament, createTournament, getTournamentByLabel } from "../src/padel";
import { upsertCategoryConfig } from "../src/padelCategories";
import {
  executeCancelTournamentRegistrationTool,
  executeCheckTournamentStatusTool,
  executeConfirmAttendanceTool,
  executeRegisterForTournamentTool,
} from "../src/padelTool";
import type { ChannelProvider } from "../src/channels/provider";
import { createFakePadelD1 } from "./fakePadelD1";

const REF = { tenantId: "club-1", channel: "telegram", chatId: "grupo-1" };

async function openTournament(db: D1Database, label = "Categoría B", capacity = 20, category: string | null = null) {
  await createTournament(db, "club-1", { label, category, scheduledAtUtc: "2026-09-10T19:00:00.000Z", registrationDeadlineUtc: "2026-09-10T18:00:00.000Z", capacity });
}

async function openPairTournament(db: D1Database, label = "Torneo de Parejas", capacity = 20) {
  await createTournament(db, "club-1", {
    label, category: null, scheduledAtUtc: "2026-09-10T19:00:00.000Z", registrationDeadlineUtc: "2026-09-10T18:00:00.000Z", capacity, registrationMode: "pareja",
  });
}

describe("executeRegisterForTournamentTool", () => {
  it("inscribe usando la única convocatoria abierta sin necesitar tournamentLabel", async () => {
    const db = createFakePadelD1();
    await openTournament(db);

    const result = await executeRegisterForTournamentTool(db, REF, "player-1", JSON.stringify({ playerName: "Juan Pérez" }));

    expect(JSON.parse(result)).toEqual({ ok: true, label: "Categoría B", status: "inscrito", position: 1, capacity: 20 });
  });

  it("devuelve un error claro si falta playerName (el modelo debe preguntar antes de llamarla)", async () => {
    const db = createFakePadelD1();
    await openTournament(db);

    const result = await executeRegisterForTournamentTool(db, REF, "player-1", JSON.stringify({}));

    expect(JSON.parse(result)).toEqual({ error: "Falta playerName" });
  });

  it("con varias convocatorias abiertas y sin tournamentLabel, pide desambiguar en vez de adivinar", async () => {
    const db = createFakePadelD1();
    await openTournament(db, "Categoría A");
    await openTournament(db, "Categoría B");

    const result = await executeRegisterForTournamentTool(db, REF, "player-1", JSON.stringify({ playerName: "Juan" }));

    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("Categoría A");
    expect(parsed.error).toContain("Categoría B");
  });

  it("con tournamentLabel explícito, resuelve la convocatoria correcta entre varias abiertas", async () => {
    const db = createFakePadelD1();
    await openTournament(db, "Categoría A");
    await openTournament(db, "Categoría B");

    const result = await executeRegisterForTournamentTool(db, REF, "player-1", JSON.stringify({ playerName: "Juan", tournamentLabel: "Categoría B" }));

    expect(JSON.parse(result)).toMatchObject({ ok: true, label: "Categoría B" });
  });

  it("devuelve un error claro si no hay ninguna convocatoria abierta", async () => {
    const db = createFakePadelD1();

    const result = await executeRegisterForTournamentTool(db, REF, "player-1", JSON.stringify({ playerName: "Juan" }));

    expect(JSON.parse(result)).toEqual({ error: "No hay ninguna convocatoria abierta en este momento." });
  });

  it("devuelve un error claro si los argumentos no son JSON válido", async () => {
    const db = createFakePadelD1();
    const result = await executeRegisterForTournamentTool(db, REF, "player-1", "no-es-json");
    expect(JSON.parse(result)).toEqual({ error: "Argumentos inválidos" });
  });

  // Backlog de Agencia (ronda de canchas + parejas): la tool le pide al
  // modelo el nombre del compañero cuando la convocatoria es de pareja
  // fija — nunca inventa un nombre ni registra a medias.
  it("en una convocatoria de PAREJA, sin partnerName devuelve un error pidiéndolo (nunca registra a medias)", async () => {
    const db = createFakePadelD1();
    await openPairTournament(db);

    const result = await executeRegisterForTournamentTool(db, REF, "player-1", JSON.stringify({ playerName: "Juan" }));

    const parsed = JSON.parse(result);
    expect(parsed.error).toMatch(/PAREJA FIJA/);
  });

  it("en una convocatoria de PAREJA, con partnerName registra a los 2 juntos", async () => {
    const db = createFakePadelD1();
    await openPairTournament(db, "Torneo de Parejas", 1);

    const result = await executeRegisterForTournamentTool(db, REF, "player-1", JSON.stringify({ playerName: "Juan", partnerName: "Ana" }));

    expect(JSON.parse(result)).toEqual({ ok: true, label: "Torneo de Parejas", pareja: true, status: "inscrito", position: 1, capacity: 1 });
  });
});

describe("executeCheckTournamentStatusTool", () => {
  it("incluye el estado personal de quien pregunta cuando ya está inscrito", async () => {
    const db = createFakePadelD1();
    await openTournament(db, "Categoría B", 20);
    await executeRegisterForTournamentTool(db, REF, "player-1", JSON.stringify({ playerName: "Juan" }));

    const result = await executeCheckTournamentStatusTool(db, REF, "player-1", "America/Mexico_City", JSON.stringify({}));

    const parsed = JSON.parse(result);
    expect(parsed.inscritos).toBe(1);
    expect(parsed.tuEstado).toEqual({ status: "inscrito", posicion: 1 });
  });

  it("tuEstado es null si quien pregunta no se ha inscrito", async () => {
    const db = createFakePadelD1();
    await openTournament(db);

    const result = await executeCheckTournamentStatusTool(db, REF, "alguien-mas", "America/Mexico_City", JSON.stringify({}));

    expect(JSON.parse(result).tuEstado).toBeNull();
  });
});

describe("executeCancelTournamentRegistrationTool", () => {
  it("cancela y avisa por DM privado al jugador promovido de lista de espera", async () => {
    const db = createFakePadelD1();
    await openTournament(db, "Categoría B", 1);
    await executeRegisterForTournamentTool(db, REF, "player-1", JSON.stringify({ playerName: "Juan" }));
    await executeRegisterForTournamentTool(db, { ...REF }, "player-2", JSON.stringify({ playerName: "Ana" }));

    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const provider: ChannelProvider = { channel: "telegram", displayName: "Telegram", sendMessage };

    const result = await executeCancelTournamentRegistrationTool(db, REF, "player-1", provider, "bot-token", JSON.stringify({}));

    expect(JSON.parse(result)).toEqual({ ok: true, label: "Categoría B" });
    // El DM privado se intenta contra el player_id individual (player-2), no el chat del grupo.
    expect(sendMessage).toHaveBeenCalledWith("bot-token", "player-2", expect.stringContaining("Ana"));
  });

  it("si el DM privado falla (chat not found), cae de vuelta a avisar en el grupo", async () => {
    const db = createFakePadelD1();
    await openTournament(db, "Categoría B", 1);
    await executeRegisterForTournamentTool(db, REF, "player-1", JSON.stringify({ playerName: "Juan" }));
    await executeRegisterForTournamentTool(db, REF, "player-2", JSON.stringify({ playerName: "Ana" }));

    const sendMessage = vi.fn().mockRejectedValueOnce(new Error("chat not found")).mockResolvedValueOnce(undefined);
    const provider: ChannelProvider = { channel: "telegram", displayName: "Telegram", sendMessage };

    await executeCancelTournamentRegistrationTool(db, REF, "player-1", provider, "bot-token", JSON.stringify({}));

    expect(sendMessage).toHaveBeenNthCalledWith(1, "bot-token", "player-2", expect.any(String));
    expect(sendMessage).toHaveBeenNthCalledWith(2, "bot-token", REF.chatId, expect.any(String));
  });

  it("devuelve un error claro si quien cancela no tenía una inscripción activa", async () => {
    const db = createFakePadelD1();
    await openTournament(db);

    const result = await executeCancelTournamentRegistrationTool(db, REF, "nadie-registrado", null, null, JSON.stringify({}));

    expect(JSON.parse(result)).toEqual({ error: "No encontramos una inscripción tuya activa en esa convocatoria." });
  });
});

// Backlog de Agencia (padel, ronda de categorías): cada categoría tiene su
// propio grupo de Telegram — el chat de origen resuelve la convocatoria
// SIN preguntar, aunque haya varias abiertas de categorías distintas al
// mismo tiempo (antes, con 2+ abiertas, siempre pedía desambiguar).
describe("resolución por categoría (chat vinculado)", () => {
  it("con el chat vinculado a una categoría, resuelve directo aunque haya otras convocatorias abiertas", async () => {
    const db = createFakePadelD1();
    await openTournament(db, "Reta 6ta - Martes", 20, "6ta");
    await openTournament(db, "Reta 5ta - Jueves", 20, "5ta");
    await upsertCategoryConfig(db, "club-1", "6ta", { weekday: 2, chatId: "grupo-6ta" });

    const ref = { tenantId: "club-1", channel: "telegram", chatId: "grupo-6ta" };
    const result = await executeRegisterForTournamentTool(db, ref, "player-1", JSON.stringify({ playerName: "Juan Pérez" }));

    expect(JSON.parse(result)).toMatchObject({ ok: true, label: "Reta 6ta - Martes" });
  });

  it("si el chat vinculado no tiene convocatoria abierta para esa categoría, error claro (no cae a las de otras categorías)", async () => {
    const db = createFakePadelD1();
    await openTournament(db, "Reta 5ta - Jueves", 20, "5ta");
    await upsertCategoryConfig(db, "club-1", "6ta", { weekday: 2, chatId: "grupo-6ta" });

    const ref = { tenantId: "club-1", channel: "telegram", chatId: "grupo-6ta" };
    const result = await executeRegisterForTournamentTool(db, ref, "player-1", JSON.stringify({ playerName: "Juan" }));

    expect(JSON.parse(result).error).toContain("6ta");
  });

  it("un chat sin vincular (ej. canal debug) sigue usando el criterio anterior (única abierta / preguntar)", async () => {
    const db = createFakePadelD1();
    await openTournament(db, "Categoría B");

    const result = await executeRegisterForTournamentTool(db, REF, "player-1", JSON.stringify({ playerName: "Juan" }));

    expect(JSON.parse(result)).toMatchObject({ ok: true, label: "Categoría B" });
  });
});

// Backlog de Agencia (ronda de reestructura): confirmación de asistencia
// tras cerrar inscripciones — el jugador contesta "sí"/"no" y el modelo
// debe llamar confirmAttendance (nunca ignorar la respuesta).
describe("executeConfirmAttendanceTool", () => {
  it("guarda willAttend=true cuando la convocatoria ya cerró", async () => {
    const db = createFakePadelD1();
    await openTournament(db, "Categoría B");
    await executeRegisterForTournamentTool(db, REF, "player-1", JSON.stringify({ playerName: "Juan" }));
    const tournament = await getTournamentByLabel(db, "club-1", "Categoría B");
    await closeTournament(db, "club-1", tournament!.id);

    const result = await executeConfirmAttendanceTool(db, REF, "player-1", JSON.stringify({ willAttend: true }));

    expect(JSON.parse(result)).toEqual({ ok: true, label: "Categoría B", confirmed: true });
  });

  it("error claro si falta willAttend (el modelo no debe adivinar)", async () => {
    const db = createFakePadelD1();
    const result = await executeConfirmAttendanceTool(db, REF, "player-1", JSON.stringify({}));
    expect(JSON.parse(result)).toEqual({ error: "Falta willAttend (true o false)" });
  });

  it("error claro si no hay ninguna convocatoria esperando confirmación", async () => {
    const db = createFakePadelD1();
    await openTournament(db, "Categoría B"); // sigue 'abierta', todavía no le toca confirmar

    const result = await executeConfirmAttendanceTool(db, REF, "player-1", JSON.stringify({ willAttend: true }));

    expect(JSON.parse(result).error).toContain("esperando confirmación");
  });

  it("error si los argumentos no son JSON válido", async () => {
    const db = createFakePadelD1();
    const result = await executeConfirmAttendanceTool(db, REF, "player-1", "no-es-json");
    expect(JSON.parse(result)).toEqual({ error: "Argumentos inválidos" });
  });
});
