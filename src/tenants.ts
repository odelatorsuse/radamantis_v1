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
}

export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  tone: "calido",
  language: "es",
  currency: "MXN",
  promptOverride: null,
  timezone: "America/Mexico_City",
  businessHours: DEFAULT_BUSINESS_HOURS,
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

export async function getTenantSettings(db: D1Database, tenantId: string): Promise<TenantSettings> {
  const row = await db
    .prepare("SELECT tone, language, currency, prompt_override, timezone, business_hours FROM tenant_settings WHERE tenant_id = ?")
    .bind(tenantId)
    .first<{
      tone: string;
      language: string;
      currency: string;
      prompt_override: string | null;
      timezone: string;
      business_hours: string;
    }>();

  if (!row) return DEFAULT_TENANT_SETTINGS;
  return {
    tone: row.tone,
    language: row.language,
    currency: row.currency,
    promptOverride: row.prompt_override,
    timezone: row.timezone,
    businessHours: parseBusinessHours(row.business_hours),
  };
}
