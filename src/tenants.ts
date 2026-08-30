import { DEFAULT_BUSINESS_HOURS, parseBusinessHours, type WeeklyBusinessHours } from "./calendar/businessHours";
import { parseCustomHandoffKeywords } from "./handoff";

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
  // Etapa 10 (unifica no-shows + encuesta + reseñas): link de reseñas (ej.
  // Google Business) que el dueño configura en /console — sin esto, el bot
  // no pide reseña, solo agradece.
  reviewLink: string | null;
  // Etapa 10 (superpower "Reenganche de leads fríos"): opt-in (a diferencia
  // de no-shows/reporte diario, que son default-on) — el dueño lo activa
  // desde /console porque alcanza a más conversaciones y el riesgo de
  // sentirse invasivo es mayor.
  leadReengagementEnabled: boolean;
  // Agencia ("auto-reanudar tras pausa por handoff"): opt-in — si el
  // negocio sigue atendiendo al cliente por su cuenta (teléfono, WhatsApp
  // personal), el bot no debe "despertar" solo a menos que el dueño lo
  // decida explícitamente. Duración fija de 3h por ahora (src/handoffAutoResume.ts).
  autoResumeHandoffEnabled: boolean;
  // Agencia ("palabras de handoff editables por tenant"): SE SUMAN a
  // HANDOFF_KEYWORDS (src/handoff.ts), nunca las reemplazan — un tenant
  // mal configurado no pierde el blindaje base.
  customHandoffKeywords: string[];
  // Agencia (White-label, alcance: por tenant en /console, no multi-agencia
  // — confirmado con Oscar): el dueño del negocio ve SU propio nombre/logo/
  // color en su consola en vez de la identidad visual de Radamantis. Los
  // tres son opcionales — null = usa el default de Radamantis, nunca se
  // inventa un valor.
  brandName: string | null;
  brandLogoUrl: string | null;
  brandColor: string | null;
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
  reviewLink: null,
  leadReengagementEnabled: false,
  autoResumeHandoffEnabled: false,
  customHandoffKeywords: [],
  brandName: null,
  brandLogoUrl: null,
  brandColor: null,
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

// Agencia (conectores Facebook/Instagram): Meta usa un webhook COMPARTIDO
// para todos los tenants — el payload solo trae el Page ID / Instagram
// Business Account ID (route_key), nunca el access token. Variante de
// resolveTenant para ese caso; el resto de los canales sigue resolviendo
// por external_id como siempre.
export async function resolveTenantByRouteKey(
  db: D1Database,
  channel: string,
  routeKey: string,
): Promise<ResolvedTenant | null> {
  const row = await db
    .prepare(
      `SELECT cb.tenant_id AS tenant_id, t.vertical_id AS vertical_id
       FROM channel_bindings cb
       JOIN tenants t ON t.id = cb.tenant_id
       WHERE cb.channel = ? AND cb.route_key = ?`,
    )
    .bind(channel, routeKey)
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

// Widget de sitio web: el visitante ya trae el tenantId en la URL (viene
// del <script data-tenant="...">, público a propósito, no es un secreto)
// — solo falta saber si existe y qué vertical usa, sin toda la carga de
// getTenantDetail (métricas, settings, etc. que este endpoint público no
// necesita).
export async function getVerticalIdForTenant(db: D1Database, tenantId: string): Promise<string | null> {
  const row = await db.prepare("SELECT vertical_id FROM tenants WHERE id = ?").bind(tenantId).first<{ vertical_id: string }>();
  return row?.vertical_id ?? null;
}

export async function getTenantSettings(db: D1Database, tenantId: string): Promise<TenantSettings> {
  const row = await db
    .prepare(
      "SELECT tone, language, currency, prompt_override, timezone, business_hours, alert_chat_id, alert_activation_code, review_link, lead_reengagement_enabled, auto_resume_handoff_enabled, custom_handoff_keywords, brand_name, brand_logo_url, brand_color FROM tenant_settings WHERE tenant_id = ?",
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
      review_link: string | null;
      lead_reengagement_enabled: number;
      auto_resume_handoff_enabled: number;
      custom_handoff_keywords: string;
      brand_name: string | null;
      brand_logo_url: string | null;
      brand_color: string | null;
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
    reviewLink: row.review_link,
    leadReengagementEnabled: row.lead_reengagement_enabled === 1,
    autoResumeHandoffEnabled: row.auto_resume_handoff_enabled === 1,
    customHandoffKeywords: parseCustomHandoffKeywords(row.custom_handoff_keywords),
    brandName: row.brand_name,
    brandLogoUrl: row.brand_logo_url,
    brandColor: row.brand_color,
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
      `INSERT INTO tenant_settings (tenant_id, tone, language, currency, prompt_override, timezone, business_hours, alert_chat_id, alert_activation_code, review_link, lead_reengagement_enabled, auto_resume_handoff_enabled, custom_handoff_keywords, brand_name, brand_logo_url, brand_color, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT (tenant_id) DO UPDATE SET
         tone = excluded.tone,
         language = excluded.language,
         currency = excluded.currency,
         prompt_override = excluded.prompt_override,
         timezone = excluded.timezone,
         business_hours = excluded.business_hours,
         alert_chat_id = excluded.alert_chat_id,
         alert_activation_code = excluded.alert_activation_code,
         review_link = excluded.review_link,
         lead_reengagement_enabled = excluded.lead_reengagement_enabled,
         auto_resume_handoff_enabled = excluded.auto_resume_handoff_enabled,
         custom_handoff_keywords = excluded.custom_handoff_keywords,
         brand_name = excluded.brand_name,
         brand_logo_url = excluded.brand_logo_url,
         brand_color = excluded.brand_color,
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
      settings.reviewLink,
      settings.leadReengagementEnabled ? 1 : 0,
      settings.autoResumeHandoffEnabled ? 1 : 0,
      JSON.stringify(settings.customHandoffKeywords),
      settings.brandName,
      settings.brandLogoUrl,
      settings.brandColor,
    )
    .run();
}
