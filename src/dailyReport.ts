import { utcToLocalDateTimeString } from "./calendar/timezone";
import { getChannelProvider } from "./channels/registry";
import { getChannelExternalId } from "./tenants";

// Etapa 10 (superpower "Reporte diario"): reutiliza toda la infraestructura
// de Vigilante (mismo alert_chat_id, mismo ChannelProvider) — si el dueño ya
// activó alertas, también recibe este resumen cada mañana, sin configurar
// nada aparte.
//
// Simplificación explícita: la HORA de disparo sí es correcta por zona
// horaria del tenant (si no, un negocio en otro huso recibiría el reporte
// de madrugada) — pero el RANGO de datos que resume ("ayer") usa el día
// calendario UTC, igual que ya hacían las estadísticas de la consola
// (getWeeklyActivity/getTodayStats) — suficiente para un resumen diario,
// no vale la pena la complejidad de fronteras exactas por zona horaria aquí.
const REPORT_HOUR = 8; // 8am hora local del tenant — fijo por ahora, sin config todavía.

export interface DailyReportResult {
  processed: number;
  sent: number;
  errors: { tenantId: string; error: string }[];
}

interface TenantAlertRow {
  tenant_id: string;
  alert_chat_id: string;
  timezone: string;
  last_daily_report_date: string | null;
}

async function getTenantsDueForReport(db: D1Database, now: Date): Promise<TenantAlertRow[]> {
  const { results } = await db
    .prepare("SELECT tenant_id, alert_chat_id, timezone, last_daily_report_date FROM tenant_settings WHERE alert_chat_id IS NOT NULL")
    .all<TenantAlertRow>();

  return results.filter((r) => {
    const local = utcToLocalDateTimeString(now.toISOString(), r.timezone);
    const localDate = local.slice(0, 10);
    const localHour = parseInt(local.slice(11, 13), 10);
    return localHour === REPORT_HOUR && r.last_daily_report_date !== localDate;
  });
}

interface YesterdayStats {
  messagesIn: number;
  messagesOut: number;
  uniqueClients: number;
  appointmentsBooked: number;
  openHandoffs: number;
}

async function getYesterdayStats(db: D1Database, tenantId: string): Promise<YesterdayStats> {
  const [messagesRow, apptRow, handoffsRow] = await Promise.all([
    db
      .prepare(
        `SELECT
           SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) AS messages_in,
           SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END) AS messages_out,
           COUNT(DISTINCT chat_id) AS unique_clients
         FROM messages
         WHERE tenant_id = ? AND date(created_at) = date('now', '-1 day')`,
      )
      .bind(tenantId)
      .first<{ messages_in: number | null; messages_out: number | null; unique_clients: number }>(),
    db
      .prepare("SELECT COUNT(*) AS count FROM appointments WHERE tenant_id = ? AND date(created_at) = date('now', '-1 day')")
      .bind(tenantId)
      .first<{ count: number }>(),
    db
      .prepare("SELECT COUNT(*) AS count FROM handoffs WHERE tenant_id = ? AND resolved_at IS NULL")
      .bind(tenantId)
      .first<{ count: number }>(),
  ]);

  return {
    messagesIn: messagesRow?.messages_in ?? 0,
    messagesOut: messagesRow?.messages_out ?? 0,
    uniqueClients: messagesRow?.unique_clients ?? 0,
    appointmentsBooked: apptRow?.count ?? 0,
    openHandoffs: handoffsRow?.count ?? 0,
  };
}

function buildReportMessage(stats: YesterdayStats): string {
  return (
    "Buenos días. Este es tu resumen de ayer:\n" +
    `- Mensajes recibidos: ${stats.messagesIn}\n` +
    `- Respuestas del bot: ${stats.messagesOut}\n` +
    `- Clientes distintos: ${stats.uniqueClients}\n` +
    `- Citas agendadas: ${stats.appointmentsBooked}\n` +
    `- Conversaciones esperando atención ahora mismo: ${stats.openHandoffs}`
  );
}

async function markDailyReportSent(db: D1Database, tenantId: string, localDate: string): Promise<void> {
  await db.prepare("UPDATE tenant_settings SET last_daily_report_date = ? WHERE tenant_id = ?").bind(localDate, tenantId).run();
}

export async function runDailyReportSweep(db: D1Database, now: Date = new Date()): Promise<DailyReportResult> {
  const due = await getTenantsDueForReport(db, now);
  const result: DailyReportResult = { processed: due.length, sent: 0, errors: [] };

  for (const tenant of due) {
    try {
      const provider = getChannelProvider("telegram");
      const externalId = await getChannelExternalId(db, tenant.tenant_id, "telegram");
      if (!provider || !externalId) throw new Error("No hay channel_binding de telegram para este tenant");

      const stats = await getYesterdayStats(db, tenant.tenant_id);
      await provider.sendMessage(externalId, tenant.alert_chat_id, buildReportMessage(stats));

      const localDate = utcToLocalDateTimeString(now.toISOString(), tenant.timezone).slice(0, 10);
      await markDailyReportSent(db, tenant.tenant_id, localDate);
      result.sent += 1;
    } catch (err) {
      // Un tenant que falla (token inválido, canal no soportado) no debe
      // detener el resto del barrido — se reintenta la próxima corrida
      // dentro de la misma hora local (no se marca last_daily_report_date).
      result.errors.push({ tenantId: tenant.tenant_id, error: (err as Error).message });
    }
  }

  return result;
}
