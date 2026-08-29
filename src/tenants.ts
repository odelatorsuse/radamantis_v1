import { DEFAULT_BUSINESS_HOURS, parseBusinessHours, type WeeklyBusinessHours } from "./calendar/businessHours";

export interface ResolvedTenant {
  tenantId: string;
  verticalId: string;
}

// Etapa 8.5: config en caliente por tenant — sin fila propia en
// tenant_settings, se asumen estos defaults (ver src/admin/repository.ts).
// Etapa 10 (Fase B): timezone es obligatoria para que el calendario
// convierta horas correctamente — sin esto el LLM las inventa (bug real).
// businessHours filtra la disponibilidad real por día de la semana, para
// que el modelo no tenga que adivinar (otro bug real: interpretó "la tarde"
// como "desde las 13:30" e ignoró 9:00-13:30; y dejó agendar un sábado a
// las 13:00 cuando ese día cierra a esa hora).
export interface TenantSettings {
  tone: string;
  language: string;
  currency: string;
  promptOverride: string | null;
  timezone: string;
  businessHours: WeeklyBusinessHours;
  // Etapa 10 (superpower "Vigilante"): a dónde avisarle al dueño del negocio
  // cuando un cliente pide un humano o suena molesto. alertChatId es opt-in
  // (null = sin alertas configuradas). alertActivationCode es el código que
  // el dueño manda a su propio bot desde /console para vincular su chat_id
  // sin tener que buscarlo — Telegram no expone el chat_id en su UI.
  alertChatId: string | null;
  alertActivationCode: string | null;
}

export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  tone: "calido",
  language: "es",
  currency: "MXN",
  promptOverride: null,
  timezone: "America/Mexico_City",
  businessHours: DEFAULT_BUSINESS_HOURS,
  alertChatId: null,
  alertActivationCode: null,
};

// D2/D6: el router resuelve tenant Y vertical antes de instanciar el DO,
// para que el core pueda cargar el Vertical Template correcto en runtime.
export async function resolveTenant(
  db: D1Database,
  channel: string,
  externalId: string,
): Promise<ResolvedTenant | null> {
  const row = await db
    .prepare(
      `SELECT cb.tenant_id AS tenant_id, t.vertical_id AS vertical_id
       FROM channel_bindings cb
       JOIN tenants t ON t.id = cb.tenant_id
       WHERE cb.channel = ? AND cb.external_id = ?`,
    )
    .bind(channel, externalId)
    .first<{ tenant_id: string; vertical_id: string }>();

  if (!row) return null;
  return { tenantId: row.tenant_id, verticalId: row.vertical_id };
}

// Inverso de resolveTenant: dado un tenant+canal, el external_id (para
// Telegram, el bot token) — lo necesita el barrido de no-shows para poder
// mandar un mensaje saliente, ya que ahí no llega ninguna request entrante
// de la que extraerlo.
export async function getChannelExternalId(db: D1Database, tenantId: string, channel: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT external_id FROM channel_bindings WHERE tenant_id = ? AND channel = ?")
    .bind(tenantId, channel)
    .first<{ external_id: string }>();
  return row?.external_id ?? null;
}

export async function getTenantSettings(db: D1Database, tenantId: string): Promise<TenantSettings> {
  const row = await db
    .prepare(
      "SELECT tone, language, currency, prompt_override, timezone, business_hours, alert_chat_id, alert_activation_code FROM tenant_settings WHERE tenant_id = ?",
    )
    .bind(tenantId)
    .first<{
      tone: string;
      language: string;
      currency: string;
      prompt_override: string | null;
      timezone: string;
      business_hours: string;
      alert_chat_id: string | null;
      alert_activation_code: string | null;
    }>();

  if (!row) return DEFAULT_TENANT_SETTINGS;
  return {
    tone: row.tone,
    language: row.language,
    currency: row.currency,
    promptOverride: row.prompt_override,
    timezone: row.timezone,
    businessHours: parseBusinessHours(row.business_hours),
    alertChatId: row.alert_chat_id,
    alertActivationCode: row.alert_activation_code,
  };
}

// Etapa 8.5: config en caliente — antes vivía en admin/repository.ts; movida
// aquí en Etapa 10 (junto con getTenantSettings/TenantSettings, su lugar
// natural) porque tanto el panel admin como la consola del cliente
// necesitan escribir aquí (tono/idioma/etc. desde /admin, alertas desde
// /console) — ninguno de los dos debe depender del otro.
export async function upsertTenantSettings(db: D1Database, tenantId: string, settings: TenantSettings): Promise<void> {
  await db
    .prepare(
      `INSERT INTO tenant_settings (tenant_id, tone, language, currency, prompt_override, timezone, business_hours, alert_chat_id, alert_activation_code, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT (tenant_id) DO UPDATE SET
         tone = excluded.tone,
         language = excluded.language,
         currency = excluded.currency,
         prompt_override = excluded.prompt_override,
         timezone = excluded.timezone,
         business_hours = excluded.business_hours,
         alert_chat_id = excluded.alert_chat_id,
         alert_activation_code = excluded.alert_activation_code,
         updated_at = excluded.updated_at`,
    )
    .bind(
      tenantId,
      settings.tone,
      settings.language,
      settings.currency,
      settings.promptOverride,
      settings.timezone,
      JSON.stringify(settings.businessHours),
      settings.alertChatId,
      settings.alertActivationCode,
    )
    .run();
}
