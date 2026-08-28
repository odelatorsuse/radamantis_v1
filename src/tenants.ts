export interface ResolvedTenant {
  tenantId: string;
  verticalId: string;
}

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
