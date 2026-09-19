import { listRegistrations } from "./padel";
import { sendAlertToOwner } from "./vigilante";

// Backlog de Agencia (ronda de reestructura): "ya que llegó la hora del
// torneo o 30 min antes, tienes que empezar a revisar si ya pagaron" —
// Oscar confirmó que quiere un aviso automático real (no solo la
// descripción del flujo manual que ya existe con los botones "Marcar
// pagado"/"Presente" en /console). Mismo cron de 30 min que los demás
// barridos del proyecto (wrangler.toml) — la ventana de "dentro de los
// próximos 30 min" se mantiene verdadera durante todo ese tramo, así que
// una corrida del cron siempre la agarra antes de que el evento pase.
//
// `payment_reminder_sent_at` evita repetir el aviso en la siguiente
// corrida del mismo barrido — se marca en cuanto se manda, sin importar
// si había o no gente sin pagar (para no seguir revisando una convocatoria
// ya avisada cada 30 min hasta que empiece).
export interface PaymentReminderSweepResult {
  processed: number;
  notified: number;
  errors: { tournamentId: number; error: string }[];
}

interface DueTournamentRow {
  id: number;
  tenant_id: string;
  label: string;
}

async function getTournamentsNeedingPaymentCheck(db: D1Database, now: Date): Promise<DueTournamentRow[]> {
  const in30min = new Date(now.getTime() + 30 * 60 * 1000);
  const { results } = await db
    .prepare(
      `SELECT id, tenant_id, label FROM padel_tournaments
       WHERE status IN ('abierta', 'cerrada', 'en_curso')
         AND payment_reminder_sent_at IS NULL
         AND scheduled_at_utc > ?
         AND scheduled_at_utc <= ?`,
    )
    .bind(now.toISOString(), in30min.toISOString())
    .all<DueTournamentRow>();
  return results;
}

export async function runPaymentReminderSweep(db: D1Database, now: Date = new Date()): Promise<PaymentReminderSweepResult> {
  const due = await getTournamentsNeedingPaymentCheck(db, now);
  const result: PaymentReminderSweepResult = { processed: due.length, notified: 0, errors: [] };

  for (const tournament of due) {
    try {
      const registrations = await listRegistrations(db, tournament.id);
      const unpaid = registrations.filter((r) => r.status === "inscrito" && !r.paid).length;
      if (unpaid > 0) {
        const text = `Faltan menos de 30 min para "${tournament.label}" y ${unpaid} ${unpaid === 1 ? "persona no ha pagado" : "personas no han pagado"} todavía.`;
        await sendAlertToOwner(db, tournament.tenant_id, text);
        result.notified += 1;
      }
      await db.prepare("UPDATE padel_tournaments SET payment_reminder_sent_at = ? WHERE id = ?").bind(now.toISOString(), tournament.id).run();
    } catch (err) {
      result.errors.push({ tournamentId: tournament.id, error: (err as Error).message });
    }
  }

  return result;
}
