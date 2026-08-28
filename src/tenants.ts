// D2: el router resuelve tenant antes de instanciar el DO, vía channel_bindings.
export async function resolveTenantId(
  db: D1Database,
  channel: string,
  externalId: string,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT tenant_id FROM channel_bindings WHERE channel = ? AND external_id = ?")
    .bind(channel, externalId)
    .first<{ tenant_id: string }>();
  return row?.tenant_id ?? null;
}
