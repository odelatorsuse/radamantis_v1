import { describe, expect, it } from "vitest";
import { padelScreenApp } from "../src/padelScreen";
import { createTournament, getTournamentByLabel, registerPlayer, setRegistrationCheckin, listRegistrations } from "../src/padel";
import { generateFixture, generatePlayoffs, generateFinal, recordMatchScore, listMatches } from "../src/padelMatches";
import { createFakePadelD1 } from "./fakePadelD1";

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

async function fullTournament(db: D1Database, tenantId: string, category: string | null = null, label = "Reta pantalla") {
  await createTournament(db, tenantId, { label, category, scheduledAtUtc: "2026-09-10T19:00:00.000Z", registrationDeadlineUtc: "x", capacity: 20 });
  const tournament = await getTournamentByLabel(db, tenantId, label);
  if (!tournament) throw new Error("setup falló");
  for (let i = 0; i < 20; i++) {
    await registerPlayer(db, tournament, tenantId, { playerName: `Jugador ${i + 1}`, phone: "555-0000", channel: "telegram", chatId: "g", playerId: `p${i + 1}` });
  }
  const regs = await listRegistrations(db, tournament.id);
  for (const r of regs) await setRegistrationCheckin(db, tenantId, r.id, { attended: true });
  const matches = await generateFixture(db, tournament, tenantId, seededRandom(1));
  for (const m of matches) await recordMatchScore(db, tenantId, m.id, { scoreA: 21, scoreB: 15 });
  return tournament;
}

describe("GET /pantalla/:tenantId/:tournamentId (padel, Fase 5: Broadcast Visual)", () => {
  it("404 si el torneo no existe", async () => {
    const db = createFakePadelD1();
    const res = await padelScreenApp.request("/club-1/999", {}, { DB: db });
    expect(res.status).toBe(404);
  });

  it("nunca expone teléfono/chat_id/player_id — solo nombres y marcadores", async () => {
    const db = createFakePadelD1();
    const tournament = await fullTournament(db, "club-1");

    const res = await padelScreenApp.request(`/club-1/${tournament.id}`, {}, { DB: db });
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).not.toContain("555-0000");
    expect(body).not.toContain("\"chatId\"");
    expect(body).not.toContain("\"playerId\"");
    expect(body).toContain("Jugador 1");
  });

  it("champion es null hasta que la final tiene marcador real", async () => {
    const db = createFakePadelD1();
    const tournament = await fullTournament(db, "club-1");
    await generatePlayoffs(db, tournament, "club-1");
    const semis = await listMatches(db, tournament.id, "semifinal");
    await recordMatchScore(db, "club-1", semis[0].id, { scoreA: 24, scoreB: 18 });
    await recordMatchScore(db, "club-1", semis[1].id, { scoreA: 20, scoreB: 24 });
    await generateFinal(db, tournament, "club-1");

    let res = await padelScreenApp.request(`/club-1/${tournament.id}`, {}, { DB: db });
    let body = await res.json<{ champion: unknown }>();
    expect(body.champion).toBeNull();

    const finalMatch = (await listMatches(db, tournament.id, "final"))[0];
    await recordMatchScore(db, "club-1", finalMatch.id, { scoreA: 24, scoreB: 10 });

    res = await padelScreenApp.request(`/club-1/${tournament.id}`, {}, { DB: db });
    body = await res.json<{ champion: [string, string] | null }>();
    expect(body.champion).not.toBeNull();
    expect((body.champion as [string, string]).length).toBe(2);
  });
});

// Backlog de Agencia (padel, ronda de categorías): "las llaves deben
// aplicar para todo el torneo o retas... dame una sección por cada
// categoría" — vista de club completo, una entrada por cada una de las 6
// categorías reales.
describe("GET /pantalla/:tenantId (padel, vista de club completo por categorías)", () => {
  it("devuelve siempre las 6 categorías, aunque solo una tenga torneo real", async () => {
    const db = createFakePadelD1();
    await fullTournament(db, "club-1", "6ta", "Reta 6ta");

    const res = await padelScreenApp.request("/club-1", {}, { DB: db });
    const body = await res.json<{ categories: { category: string; tournament: unknown }[] }>();

    expect(res.status).toBe(200);
    expect(body.categories).toHaveLength(6);
    const sexta = body.categories.find((c) => c.category === "6ta");
    const quinta = body.categories.find((c) => c.category === "5ta");
    expect(sexta?.tournament).not.toBeNull();
    expect(quinta?.tournament).toBeNull();
  });

  it("prioriza la convocatoria en_curso de una categoría sobre una finalizada anterior", async () => {
    const db = createFakePadelD1();
    const finalizada = await fullTournament(db, "club-1", "6ta", "Reta 6ta vieja");
    await generatePlayoffs(db, finalizada, "club-1");
    const semis = await listMatches(db, finalizada.id, "semifinal");
    await recordMatchScore(db, "club-1", semis[0].id, { scoreA: 24, scoreB: 10 });
    await recordMatchScore(db, "club-1", semis[1].id, { scoreA: 24, scoreB: 10 });
    const final = await generateFinal(db, finalizada, "club-1");
    await recordMatchScore(db, "club-1", final.id, { scoreA: 24, scoreB: 10 });

    const nueva = await fullTournament(db, "club-1", "6ta", "Reta 6ta nueva");

    const res = await padelScreenApp.request("/club-1", {}, { DB: db });
    const body = await res.json<{ categories: { category: string; tournament: { label: string } | null }[] }>();

    const sexta = body.categories.find((c) => c.category === "6ta");
    expect(sexta?.tournament?.label).toBe(nueva.label);
    expect(nueva.id).not.toBe(finalizada.id);
  });
});
