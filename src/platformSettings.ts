// Agencia (conectores, autoservicio real): configuración compartida por
// TODA la plataforma (no por tenant) — hoy solo las credenciales de la App
// de Meta, pero es el lugar natural para cualquier credencial futura de
// este tipo (ej. una futura App de WhatsApp Business). Vive en D1, no en
// Worker secrets, precisamente para que Oscar la edite desde /admin sin
// depender de `wrangler secret put` — ver migración 0026.
export interface PlatformSettings {
  metaAppId: string | null;
  metaAppSecret: string | null;
  metaVerifyToken: string | null;
}

interface PlatformSettingsRow {
  meta_app_id: string | null;
  meta_app_secret: string | null;
  meta_verify_token: string | null;
}

export async function getPlatformSettings(db: D1Database): Promise<PlatformSettings> {
  const row = await db
    .prepare("SELECT meta_app_id, meta_app_secret, meta_verify_token FROM platform_settings WHERE id = 1")
    .first<PlatformSettingsRow>();
  return {
    metaAppId: row?.meta_app_id ?? null,
    metaAppSecret: row?.meta_app_secret ?? null,
    metaVerifyToken: row?.meta_verify_token ?? null,
  };
}

// Parcial: solo pisa los campos recibidos, para que guardar el App ID no
// borre el Verify Token ya configurado (mismo criterio ya usado en
// upsertTenantSettings para no perder campos al guardar otra sección).
export async function upsertPlatformSettings(db: D1Database, patch: Partial<PlatformSettings>): Promise<void> {
  const current = await getPlatformSettings(db);
  const next = { ...current, ...patch };
  await db
    .prepare(
      `INSERT INTO platform_settings (id, meta_app_id, meta_app_secret, meta_verify_token, updated_at)
       VALUES (1, ?, ?, ?, datetime('now'))
       ON CONFLICT (id) DO UPDATE SET meta_app_id = excluded.meta_app_id, meta_app_secret = excluded.meta_app_secret, meta_verify_token = excluded.meta_verify_token, updated_at = excluded.updated_at`,
    )
    .bind(next.metaAppId, next.metaAppSecret, next.metaVerifyToken)
    .run();
}
