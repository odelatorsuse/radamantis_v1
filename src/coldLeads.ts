import { getChannelProvider } from "./channels/registry";
import { appendMessage } from "./messages";
import { getChannelExternalId } from "./tenants";

// Etapa 10 (superpower "Reenganche de leads fríos", criterios confirmados
// con Oscar 2026-08-29): a diferencia de no-shows/reporte diario, esto es
// OPT-IN — solo corre para tenants con lead_reengagement_enabled = 1.
//
// Criterio de "frío": la última conversación con ese chat_id no tiene NI
// UNA cita asociada (nunca convirtió) Y el último mensaje fue del bot hace
// más de COLD_THRESHOLD_HOURS sin que el cliente haya vuelto a escribir.
// Hasta 2 intentos por conversación (lead_reengagement.attempts), con el
// mismo umbral de horas entre el 1er y 2do intento.
//
// Mensaje: plantilla fija, no generada por el LLM (mismo estilo que
// no-shows/reporte diario/Vigilante) — pero personalizada reusando la
// última pregunta real del cliente, sin costo extra de tokens.
const COLD_THRESHOLD_HOURS = 5; // punto medio del rango 4-6h confirmado con Oscar.
const MAX_ATTEMPTS = 2;

export interface ColdLeadResult {
  processed: number;
  sent: number;
  errors: { tenantId: string; channel: string; chatId: string; error: string }[];
}

interface EnabledTenantRow {
  tenant_id: string;
}

interface ConversationCandidateRow {
  channel: string;
  chat_id: string;
  last_message_at: string;
  last_role: string;
  last_user_message: string | null;
}

interface AppointmentCountRow {
  count: number;
}

interface ReengagementRow {
  attempts: number;
  last_attempt_at: string | null;
}

async function getEnabledTenants(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT tenant_id FROM tenant_settings WHERE lead_reengagement_enabled = 1")
    .all<EnabledTenantRow>();
  return results.map((r) => r.tenant_id);
}

// Conversaciones cuyo último mensaje fue del bot hace más de
// COLD_THRESHOLD_HOURS — el cliente nunca volvió a escribir después.
async function getColdConversations(db: D1Database, tenantId: string): Promise<ConversationCandidateRow[]> {
  const { results } = await db
    .prepare(
      `SELECT m.channel, m.chat_id, MAX(m.created_at) AS last_message_at,
         (SELECT role FROM messages m2 WHERE m2.tenant_id = m.tenant_id AND m2.channel = m.channel AND m2.chat_id = m.chat_id ORDER BY m2.id DESC LIMIT 1) AS last_role,
         (SELECT content FROM messages m3 WHERE m3.tenant_id = m.tenant_id AND m3.channel = m.channel AND m3.chat_id = m.chat_id AND m3.role = 'user' ORDER BY m3.id DESC LIMIT 1) AS last_user_message
       FROM messages m
       WHERE m.tenant_id = ?
       GROUP BY m.channel, m.chat_id
       HAVING last_role = 'assistant' AND last_message_at <= datetime('now', ?)`,
    )
    .bind(tenantId, `-${COLD_THRESHOLD_HOURS} hours`)
    .all<ConversationCandidateRow>();
  return results;
}

async function hasAnyAppointment(db: D1Database, tenantId: string, channel: string, chatId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM appointments WHERE tenant_id = ? AND channel = ? AND chat_id = ?")
    .bind(tenantId, channel, chatId)
    .first<AppointmentCountRow>();
  return (row?.count ?? 0) > 0;
}

async function getReengagementStatus(db: D1Database, tenantId: string, channel: string, chatId: string): Promise<ReengagementRow | null> {
  const row = await db
    .prepare("SELECT attempts, last_attempt_at FROM lead_reengagement WHERE tenant_id = ? AND channel = ? AND chat_id = ?")
    .bind(tenantId, channel, chatId)
    .first<ReengagementRow>();
  return row ?? null;
}

// Listo para un 2do intento solo si ya pasó el mismo umbral desde el 1ro —
// si no, se sigue esperando aunque el mensaje original ya esté frío.
//
// last_attempt_at viene de datetime('now') de SQLite ("YYYY-MM-DD HH:MM:SS",
// con espacio, no ISO) — hay que normalizarlo antes de new Date(), si no
// da Invalid Date en vez de tronar (mismo tipo de bug de formato ya
// documentado para columnas con este default; ver src/dailyReport.ts).
function isDueForRetry(status: ReengagementRow | null): boolean {
  if (!status) return true;
  if (status.attempts >= MAX_ATTEMPTS) return false;
  if (!status.last_attempt_at) return true;
  const lastAttemptIso = `${status.last_attempt_at.replace(" ", "T")}Z`;
  const hoursSinceLastAttempt = (Date.now() - new Date(lastAttemptIso).getTime()) / (60 * 60 * 1000);
  return hoursSinceLastAttempt >= COLD_THRESHOLD_HOURS;
}

async function markReengagementAttempt(db: D1Database, tenantId: string, channel: string, chatId: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO lead_reengagement (tenant_id, channel, chat_id, attempts, last_attempt_at)
       VALUES (?, ?, ?, 1, datetime('now'))
       ON CONFLICT (tenant_id, channel, chat_id) DO UPDATE SET
         attempts = attempts + 1,
         last_attempt_at = datetime('now')`,
    )
    .bind(tenantId, channel, chatId)
    .run();
}

function buildReengagementMessage(lastUserMessage: string | null): string {
  if (lastUserMessage) {
    return (
      `Hola, notamos que nos preguntaste: "${lastUserMessage}" y no pudimos seguir platicando. ` +
      "¿Sigues interesado? Aquí estamos para ayudarte con lo que necesites."
    );
  }
  return "Hola, notamos que no pudimos continuar nuestra conversación. ¿Sigues interesado? Aquí estamos para ayudarte.";
}

export async function runColdLeadSweep(db: D1Database): Promise<ColdLeadResult> {
  const result: ColdLeadResult = { processed: 0, sent: 0, errors: [] };
  const tenantIds = await getEnabledTenants(db);

  for (const tenantId of tenantIds) {
    const candidates = await getColdConversations(db, tenantId);
    for (const candidate of candidates) {
      result.processed += 1;
      try {
        const [alreadyConverted, status] = await Promise.all([
          hasAnyAppointment(db, tenantId, candidate.channel, candidate.chat_id),
          getReengagementStatus(db, tenantId, candidate.channel, candidate.chat_id),
        ]);
        if (alreadyConverted || !isDueForRetry(status)) continue;

        const provider = getChannelProvider(candidate.channel);
        if (!provider) throw new Error(`Canal "${candidate.channel}" no soportado para reenganche todavía`);
        const externalId = await getChannelExternalId(db, tenantId, candidate.channel);
        if (!externalId) throw new Error(`No hay channel_binding de ${candidate.channel} para este tenant`);

        const message = buildReengagementMessage(candidate.last_user_message);
        await provider.sendMessage(externalId, candidate.chat_id, message);

        const ref = { tenantId, channel: candidate.channel, chatId: candidate.chat_id };
        await appendMessage(db, ref, { role: "assistant", content: message });
        await markReengagementAttempt(db, tenantId, candidate.channel, candidate.chat_id);
        result.sent += 1;
      } catch (err) {
        result.errors.push({ tenantId, channel: candidate.channel, chatId: candidate.chat_id, error: (err as Error).message });
      }
    }
  }

  return result;
}
