export interface CalendarConnection {
  tenantId: string;
  provider: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  calendarId: string;
  connectedAt: string;
}

export async function getCalendarConnection(db: D1Database, tenantId: string): Promise<CalendarConnection | null> {
  const row = await db
    .prepare(
      "SELECT tenant_id, provider, access_token, refresh_token, expires_at, calendar_id, connected_at FROM calendar_connections WHERE tenant_id = ?",
    )
    .bind(tenantId)
    .first<{
      tenant_id: string;
      provider: string;
      access_token: string;
      refresh_token: string;
      expires_at: string;
      calendar_id: string;
      connected_at: string;
    }>();

  if (!row) return null;
  return {
    tenantId: row.tenant_id,
    provider: row.provider,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresAt: row.expires_at,
    calendarId: row.calendar_id,
    connectedAt: row.connected_at,
  };
}

export async function saveCalendarConnection(
  db: D1Database,
  params: { tenantId: string; provider: string; accessToken: string; refreshToken: string; expiresAt: string; calendarId: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO calendar_connections (tenant_id, provider, access_token, refresh_token, expires_at, calendar_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (tenant_id) DO UPDATE SET
         provider = excluded.provider,
         access_token = excluded.access_token,
         refresh_token = excluded.refresh_token,
         expires_at = excluded.expires_at,
         calendar_id = excluded.calendar_id`,
    )
    .bind(params.tenantId, params.provider, params.accessToken, params.refreshToken, params.expiresAt, params.calendarId)
    .run();
}

export async function updateAccessToken(
  db: D1Database,
  tenantId: string,
  accessToken: string,
  expiresAt: string,
): Promise<void> {
  await db
    .prepare("UPDATE calendar_connections SET access_token = ?, expires_at = ? WHERE tenant_id = ?")
    .bind(accessToken, expiresAt, tenantId)
    .run();
}

export async function deleteCalendarConnection(db: D1Database, tenantId: string): Promise<void> {
  await db.prepare("DELETE FROM calendar_connections WHERE tenant_id = ?").bind(tenantId).run();
}
