import { normalizeToUtcISOString, utcToLocalDateTimeString } from "./timezone";

// Etapa 10 (superpower "Recupera no-shows"): registro local de cada cita
// agendada con éxito, y el barrido que detecta cuáles ya pasaron sin
// seguimiento. bookAppointment ya validó todo (horario, disponibilidad
// real) — esto es solo el rastro necesario para poder recontactar al
// cliente después, cosa que Google Calendar por sí solo no nos da (no
// tenemos chat_id/canal en el evento, solo en nuestra propia conversación).

export interface AppointmentRef {
  tenantId: string;
  channel: string;
  chatId: string;
}

export interface DueAppointment {
  id: number;
  tenantId: string;
  channel: string;
  chatId: string;
  startUtc: string;
  endUtc: string;
  summary: string;
  attendeeName: string;
  attendeeContact: string;
}

interface BookAppointmentToolArgs {
  start?: string;
  end?: string;
  summary?: string;
  attendeeName?: string;
  attendeeContact?: string;
  staffMember?: string;
}

interface BookAppointmentToolResult {
  ok?: boolean;
  eventId?: string;
}

// Se llama después de cada tool call de bookAppointment, éxito o no. Nunca
// debe poder tumbar la conversación: si el parseo falla o la reserva no fue
// exitosa, simplemente no registra nada — la confirmación al cliente ya se
// decidió en tools.ts/agent.ts, esto es solo bookkeeping best-effort.
export async function recordAppointmentFromToolCall(
  db: D1Database,
  ref: AppointmentRef,
  rawArguments: string,
  rawResult: string,
  timeZone: string,
): Promise<void> {
  try {
    const args = JSON.parse(rawArguments) as BookAppointmentToolArgs;
    const result = JSON.parse(rawResult) as BookAppointmentToolResult;
    if (!result.ok || !args.start || !args.end || !args.summary || !args.attendeeName || !args.attendeeContact) {
      return;
    }
    const startUtc = normalizeToUtcISOString(args.start, timeZone);
    const endUtc = normalizeToUtcISOString(args.end, timeZone);
    await db
      .prepare(
        `INSERT INTO appointments
           (tenant_id, channel, chat_id, start_utc, end_utc, summary, attendee_name, attendee_contact, event_id, staff_member)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        ref.tenantId,
        ref.channel,
        ref.chatId,
        startUtc,
        endUtc,
        args.summary,
        args.attendeeName,
        args.attendeeContact,
        result.eventId ?? null,
        args.staffMember ?? null,
      )
      .run();
  } catch {
    // best-effort — nunca romper el flujo de la conversación por esto.
  }
}

// Etapa 10: no tenemos ninguna señal real de "el cliente sí llegó" (ni
// Google Calendar ni el bot lo saben) — toda cita cuya hora de fin ya pasó
// se trata como posible no-show y se le da seguimiento, una sola vez.
// GRACE_PERIOD_MS evita contactar al cliente en el instante exacto en que
// termina la cita (podría seguir ahí, o el barrido podría correr justo a
// mitad de la consulta si el cron cae en mal momento).
const GRACE_PERIOD_MS = 30 * 60 * 1000;

export async function getDueNoShowFollowups(db: D1Database, now: Date): Promise<DueAppointment[]> {
  const cutoff = new Date(now.getTime() - GRACE_PERIOD_MS).toISOString();
  const rows = await db
    .prepare(
      `SELECT id, tenant_id, channel, chat_id, start_utc, end_utc, summary, attendee_name, attendee_contact
       FROM appointments
       WHERE no_show_followup_sent_at IS NULL AND end_utc <= ?`,
    )
    .bind(cutoff)
    .all<{
      id: number;
      tenant_id: string;
      channel: string;
      chat_id: string;
      start_utc: string;
      end_utc: string;
      summary: string;
      attendee_name: string;
      attendee_contact: string;
    }>();
  return rows.results.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    channel: r.channel,
    chatId: r.chat_id,
    startUtc: r.start_utc,
    endUtc: r.end_utc,
    summary: r.summary,
    attendeeName: r.attendee_name,
    attendeeContact: r.attendee_contact,
  }));
}

export async function markNoShowFollowupSent(db: D1Database, appointmentId: number): Promise<void> {
  await db
    .prepare("UPDATE appointments SET no_show_followup_sent_at = datetime('now') WHERE id = ?")
    .bind(appointmentId)
    .run();
}

// Plantilla fija, no generada por el LLM — el mensaje de seguimiento debe
// ser 100% predecible (no queremos que el modelo invente detalles de una
// cita que ya pasó). Etapa 10 (unificación no-shows + encuesta + reseñas,
// decidido con Oscar): un solo mensaje post-cita en vez de tres mensajes
// separados que podrían pisarse sobre la misma cita. La CONVERSACIÓN que
// sigue (si el cliente contesta) la maneja el LLM normal con la tool
// recordAppointmentFeedback — este mensaje solo abre la puerta.
export function buildAppointmentFollowUpMessage(tenantName: string, appt: DueAppointment, timeZone: string): string {
  const local = utcToLocalDateTimeString(appt.startUtc, timeZone);
  const [date, time] = [local.slice(0, 10), local.slice(11, 16)];
  return (
    `Hola ${appt.attendeeName}, en ${tenantName} teníamos agendada tu cita del ${date} a las ${time} ` +
    `("${appt.summary}"). ¿Pudiste venir? Si no, cuéntanos y con gusto te ayudamos a reagendar. Si sí ` +
    "viniste, ¿qué calificación del 1 al 5 le darías a tu experiencia?"
  );
}

export interface AppointmentFeedback {
  attended: boolean;
  rating?: number;
  comment?: string;
}

// El feedback se asocia a la cita más reciente de ese chat que YA recibió
// el mensaje de seguimiento (no_show_followup_sent_at IS NOT NULL) — es a
// la que el cliente está respondiendo, no a una cita futura sin terminar
// todavía ni a una muy vieja de hace meses.
export async function getMostRecentFollowedUpAppointment(db: D1Database, ref: AppointmentRef): Promise<number | null> {
  const row = await db
    .prepare(
      `SELECT id FROM appointments
       WHERE tenant_id = ? AND channel = ? AND chat_id = ? AND no_show_followup_sent_at IS NOT NULL
       ORDER BY id DESC LIMIT 1`,
    )
    .bind(ref.tenantId, ref.channel, ref.chatId)
    .first<{ id: number }>();
  return row?.id ?? null;
}

export async function recordAppointmentFeedback(db: D1Database, appointmentId: number, feedback: AppointmentFeedback): Promise<void> {
  await db
    .prepare("UPDATE appointments SET attended = ?, rating = ?, feedback_comment = ? WHERE id = ?")
    .bind(feedback.attended ? 1 : 0, feedback.rating ?? null, feedback.comment ?? null, appointmentId)
    .run();
}
