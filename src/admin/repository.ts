import { getTenantSettings, type TenantSettings } from "../tenants";

export interface TenantSummary {
  id: string;
  name: string;
  vertical_id: string;
  created_at: string;
  channel_count: number;
  open_handoffs: number;
}

export interface UsageSummary {
  tenant_id: string;
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
}

export interface HandoffRow {
  id: number;
  tenant_id: string;
  channel: string;
  chat_id: string;
  reason: string;
  created_at: string;
  resolved_at: string | null;
}

export interface ChannelBindingRow {
  channel: string;
  external_id: string;
}

export interface TenantDetail {
  id: string;
  name: string;
  vertical_id: string;
  created_at: string;
  settings: TenantSettings;
  channels: ChannelBindingRow[];
  metrics: {
    messagesIn: number;
    messagesOut: number;
    conversations: number;
    openHandoffs: number;
    status: "ok" | "necesita_atencion";
  };
}

// D3: cada query sigue trayendo tenant_id explícito, aunque sea para admin
// (multi-tenant desde el diseño, sin atajos incluso en el panel interno).
export async function listTenants(db: D1Database): Promise<TenantSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT
         t.id, t.name, t.vertical_id, t.created_at,
         (SELECT COUNT(*) FROM channel_bindings cb WHERE cb.tenant_id = t.id) AS channel_count,
         (SELECT COUNT(*) FROM handoffs h WHERE h.tenant_id = t.id AND h.resolved_at IS NULL) AS open_handoffs
       FROM tenants t
       ORDER BY t.created_at ASC`,
    )
    .all<TenantSummary>();
  return results;
}

export async function createTenant(db: D1Database, id: string, name: string, verticalId: string): Promise<void> {
  await db
    .prepare("INSERT INTO tenants (id, name, vertical_id) VALUES (?, ?, ?)")
    .bind(id, name, verticalId)
    .run();
}

export async function addChannelBinding(
  db: D1Database,
  tenantId: string,
  channel: string,
  externalId: string,
): Promise<void> {
  await db
    .prepare("INSERT INTO channel_bindings (channel, external_id, tenant_id) VALUES (?, ?, ?)")
    .bind(channel, externalId, tenantId)
    .run();
}

// Etapa 9: rotar/actualizar el token de un canal ya vinculado (ej. Oscar
// revocó el token viejo por accidente en BotFather). external_id es parte
// de la PK, así que esto borra la fila vieja e inserta la nueva — no un
// UPDATE simple, para no dejar basura si el canal cambia de tipo también.
export async function updateChannelBinding(
  db: D1Database,
  tenantId: string,
  channel: string,
  newExternalId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM channel_bindings WHERE tenant_id = ? AND channel = ?")
    .bind(tenantId, channel)
    .run();
  await db
    .prepare("INSERT INTO channel_bindings (channel, external_id, tenant_id) VALUES (?, ?, ?)")
    .bind(channel, newExternalId, tenantId)
    .run();
}

export async function listHandoffs(db: D1Database, onlyOpen: boolean): Promise<HandoffRow[]> {
  const query = onlyOpen
    ? "SELECT * FROM handoffs WHERE resolved_at IS NULL ORDER BY created_at DESC"
    : "SELECT * FROM handoffs ORDER BY created_at DESC LIMIT 50";
  const { results } = await db.prepare(query).all<HandoffRow>();
  return results;
}

export async function resolveHandoff(db: D1Database, id: number): Promise<void> {
  await db.prepare("UPDATE handoffs SET resolved_at = datetime('now') WHERE id = ? AND resolved_at IS NULL").bind(id).run();
}

export async function getUsageSummary(db: D1Database): Promise<UsageSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT tenant_id, COUNT(*) AS requests, SUM(prompt_tokens) AS prompt_tokens, SUM(completion_tokens) AS completion_tokens
       FROM usage_log
       GROUP BY tenant_id`,
    )
    .all<UsageSummary>();
  return results;
}


export async function getTenantDetail(db: D1Database, tenantId: string): Promise<TenantDetail | null> {
  const tenant = await db
    .prepare("SELECT id, name, vertical_id, created_at FROM tenants WHERE id = ?")
    .bind(tenantId)
    .first<{ id: string; name: string; vertical_id: string; created_at: string }>();
  if (!tenant) return null;

  const [settings, channels, counts] = await Promise.all([
    getTenantSettings(db, tenantId),
    db
      .prepare("SELECT channel, external_id FROM channel_bindings WHERE tenant_id = ?")
      .bind(tenantId)
      .all<ChannelBindingRow>(),
    db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM messages WHERE tenant_id = ? AND role = 'user') AS messages_in,
           (SELECT COUNT(*) FROM messages WHERE tenant_id = ? AND role = 'assistant') AS messages_out,
           (SELECT COUNT(DISTINCT chat_id) FROM messages WHERE tenant_id = ?) AS conversations,
           (SELECT COUNT(*) FROM handoffs WHERE tenant_id = ? AND resolved_at IS NULL) AS open_handoffs`,
      )
      .bind(tenantId, tenantId, tenantId, tenantId)
      .first<{ messages_in: number; messages_out: number; conversations: number; open_handoffs: number }>(),
  ]);

  const openHandoffs = counts?.open_handoffs ?? 0;
  return {
    id: tenant.id,
    name: tenant.name,
    vertical_id: tenant.vertical_id,
    created_at: tenant.created_at,
    settings,
    channels: channels.results,
    metrics: {
      messagesIn: counts?.messages_in ?? 0,
      messagesOut: counts?.messages_out ?? 0,
      conversations: counts?.conversations ?? 0,
      openHandoffs,
      status: openHandoffs > 0 ? "necesita_atencion" : "ok",
    },
  };
}

export async function logAdminAction(
  db: D1Database,
  params: { tenantId: string | null; action: string; details?: unknown },
): Promise<void> {
  await db
    .prepare("INSERT INTO admin_actions (tenant_id, actor, action, details) VALUES (?, ?, ?, ?)")
    .bind(params.tenantId, "super-admin", params.action, params.details ? JSON.stringify(params.details) : null)
    .run();
}
