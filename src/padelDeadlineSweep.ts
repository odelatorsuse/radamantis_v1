import { getChannelProvider } from "./channels/registry";
import { appendMessage } from "./messages";
import { listRegistrations } from "./padel";
import { getChannelExternalId } from "./tenants";

// Backlog de Agencia (padel, Fase 1: "Convocador Bot") — mismo patrón que
// src/noShowSweep.ts: corre en el cron de 30 min (wrangler.toml) o bajo
// demanda vía POST /api/admin/tournament-deadline-sweep. Cierra
// automáticamente toda convocatoria cuya hora límite de inscripción ya
// pasó — el club también puede cerrarla a mano antes desde /console.
//
// Backlog de Agencia (ronda de reestructura): "posterior a la hora límite
// de inscripción, buscar que confirmen que van a participar" — Oscar
// confirmó que el bot manda el mensaje. Se dispara justo al cerrar cada
// convocatoria (una sola vez, porque el cierre en sí solo pasa una vez
// por convocatoria — nunca se re-envía en corridas siguientes del
// barrido, ya que status ya no es 'abierta' para volver a calificar).
// Mensaje fijo, no generado por el LLM — mismo principio anti-invento que
// el resto de los mensajes automáticos de este proyecto (recupera
// no-shows, reporte diario, etc.).
export interface TournamentDeadlineSweepResult {
  processed: number;
  closed: number;
  errors: { tournamentId: number; error: string }[];
}

interface DueTournamentRow {
  id: number;
  tenant_id: string;
  label: string;
}

async function getDueTournaments(db: D1Database, now: Date): Promise<DueTournamentRow[]> {
  const { results } = await db
    .prepare("SELECT id, tenant_id, label FROM padel_tournaments WHERE status = 'abierta' AND registration_deadline_utc <= ?")
    .bind(now.toISOString())
    .all<DueTournamentRow>();
  return results;
}

// Best-effort: intenta DM privado a cada inscrito primero (menos ruido en
// el grupo), y si Telegram lo rechaza cae de vuelta al grupo — mismo
// patrón de resiliencia que notifyPromotedPlayer (src/padelTool.ts). Un
// envío que falla nunca detiene los demás.
async function sendConfirmationRequests(db: D1Database, tenantId: string, tournamentId: number, label: string): Promise<void> {
  const registrations = await listRegistrations(db, tournamentId);
  const inscritos = registrations.filter((r) => r.status === "inscrito");
  if (inscritos.length === 0) return;

  const channel = inscritos[0].channel; // toda una convocatoria comparte canal (el grupo de su categoría)
  const provider = getChannelProvider(channel);
  if (!provider) return;
  const externalId = await getChannelExternalId(db, tenantId, channel);
  if (!externalId) return;

  for (const r of inscritos) {
    const text = `Hola ${r.playerName}, ya cerraron las inscripciones para "${label}". ¿Vas a poder venir? Contesta sí o no para confirmar tu lugar.`;
    try {
      await provider.sendMessage(externalId, r.playerId, text);
      await appendMessage(db, { tenantId, channel: provider.channel, chatId: r.playerId }, { role: "assistant", content: text });
    } catch {
      try {
        await provider.sendMessage(externalId, r.chatId, text);
        await appendMessage(db, { tenantId, channel: provider.channel, chatId: r.chatId }, { role: "assistant", content: text });
      } catch {
        // best-effort — el registro ya quedó guardado, solo no le llegó el aviso a tiempo.
      }
    }
  }
}

export async function runTournamentDeadlineSweep(db: D1Database, now: Date = new Date()): Promise<TournamentDeadlineSweepResult> {
  const due = await getDueTournaments(db, now);
  const result: TournamentDeadlineSweepResult = { processed: due.length, closed: 0, errors: [] };

  for (const tournament of due) {
    try {
      // Sin scoping por tenant_id en el UPDATE a propósito — el barrido ya
      // filtró por id real de una fila que sí existe, y el UPDATE solo
      // toca esa fila puntual; el aislamiento por tenant lo garantiza la
      // query de arriba (cada fila pertenece a un solo tenant de por sí).
      await db.prepare("UPDATE padel_tournaments SET status = 'cerrada' WHERE id = ?").bind(tournament.id).run();
      result.closed += 1;
      try {
        await sendConfirmationRequests(db, tournament.tenant_id, tournament.id, tournament.label);
      } catch {
        // best-effort — el cierre ya quedó bien, solo no se pudo avisar.
      }
    } catch (err) {
      // Una jornada que falla no debe detener el resto del barrido.
      result.errors.push({ tournamentId: tournament.id, error: (err as Error).message });
    }
  }

  return result;
}
