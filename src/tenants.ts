export interface ResolvedTenant {
  tenantId: string;
  verticalId: string;
}

// Etapa 8.5: config en caliente por tenant — sin fila propia en
// tenant_settings, se asumen estos defaults (ver src/admin/repository.ts).
export interface TenantSettings {
  tone: string;
  language: string;
  currency: string;
  promptOverride: string | null;
}

export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  tone: "calido",
  language: "es",
  currency: "MXN",
  promptOverride: null,
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
    .prepare("SELECT tone, language, currency, prompt_override FROM tenant_settings WHERE tenant_id = ?")
    .bind(tenantId)
    .first<{ tone: string; language: string; currency: string; prompt_override: string | null }>();

  if (!row) return DEFAULT_TENANT_SETTINGS;
  return { tone: row.tone, language: row.language, currency: row.currency, promptOverride: row.prompt_override };
}
