import { buildNoShowMessage, getDueNoShowFollowups, markNoShowFollowupSent } from "./calendar/appointments";
import { getChannelProvider } from "./channels/registry";
import { appendMessage } from "./messages";
import { getChannelExternalId, getTenantSettings } from "./tenants";

// Etapa 10 (superpower "Recupera no-shows"): toda cita cuya hora ya pasó
// (con margen, ver GRACE_PERIOD_MS en appointments.ts) y no se le dio
// seguimiento se trata como posible no-show — no tenemos ninguna señal real
// de si el cliente llegó o no, así que se contacta siempre; es un touchpoint
// de recuperación/reagendado, no una acusación. El mensaje es una plantilla
// fija (no generada por el LLM) para que sea 100% predecible.
//
// Se llama desde dos lugares con el mismo resultado: el cron (producción,
// wrangler.toml) y POST /api/admin/no-show-sweep (para poder probarlo bajo
// demanda sin esperar al cron — mismo patrón que /tenants/:id/test-message).
export interface NoShowSweepResult {
  processed: number;
  sent: number;
  errors: { appointmentId: number; error: string }[];
}

interface TenantNameRow {
  name: string;
}

async function getTenantName(db: D1Database, tenantId: string): Promise<string> {
  const row = await db.prepare("SELECT name FROM tenants WHERE id = ?").bind(tenantId).first<TenantNameRow>();
  return row?.name ?? tenantId;
}

export async function runNoShowSweep(db: D1Database, now: Date = new Date()): Promise<NoShowSweepResult> {
  const due = await getDueNoShowFollowups(db, now);
  const result: NoShowSweepResult = { processed: due.length, sent: 0, errors: [] };

  for (const appt of due) {
    try {
      const [tenantSettings, tenantName] = await Promise.all([
        getTenantSettings(db, appt.tenantId),
        getTenantName(db, appt.tenantId),
      ]);
      const message = buildNoShowMessage(tenantName, appt, tenantSettings.timezone);

      const provider = getChannelProvider(appt.channel);
      if (!provider) throw new Error(`Canal "${appt.channel}" no soportado para seguimiento de no-shows todavía`);
      const externalId = await getChannelExternalId(db, appt.tenantId, appt.channel);
      if (!externalId) throw new Error(`No hay channel_binding de ${appt.channel} para este tenant`);
      await provider.sendMessage(externalId, appt.chatId, message);

      await appendMessage(db, { tenantId: appt.tenantId, channel: appt.channel, chatId: appt.chatId }, { role: "assistant", content: message });
      await markNoShowFollowupSent(db, appt.id);
      result.sent += 1;
    } catch (err) {
      // Una cita que falla (canal no soportado, token inválido, etc.) no debe
      // detener el resto del barrido — se reintenta en la siguiente corrida
      // porque no_show_followup_sent_at solo se marca tras un envío exitoso.
      result.errors.push({ appointmentId: appt.id, error: (err as Error).message });
    }
  }

  return result;
}
