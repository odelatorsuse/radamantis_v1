import { estimateCostUsd } from "../costs";
import { getTenantSettings, type TenantSettings } from "../tenants";

export interface TenantSummary {
  id: string;
  name: string;
  vertical_id: string;
  created_at: string;
  channel_count: number;
  open_handoffs: number;
}

export interface UsageModelBreakdown {
  model: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  audioSeconds: number;
  estimatedCostUsd: number;
}

export interface UsageSummary {
  tenant_id: string;
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  estimatedCostUsd: number;
  breakdown: UsageModelBreakdown[];
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

interface UsageLogRow {
  tenant_id: string;
  model: string;
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  audio_seconds: number | null;
}

async function queryUsageSummary(db: D1Database, sinceClause: string): Promise<UsageSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT tenant_id, model, COUNT(*) AS requests, SUM(prompt_tokens) AS prompt_tokens, SUM(completion_tokens) AS completion_tokens, SUM(audio_seconds) AS audio_seconds
       FROM usage_log
       ${sinceClause}
       GROUP BY tenant_id, model`,
    )
    .all<UsageLogRow>();

  const byTenant = new Map<string, UsageSummary>();
  for (const row of results) {
    const cost = estimateCostUsd({
      model: row.model,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      audioSeconds: row.audio_seconds,
    });
    let summary = byTenant.get(row.tenant_id);
    if (!summary) {
      summary = { tenant_id: row.tenant_id, requests: 0, prompt_tokens: 0, completion_tokens: 0, estimatedCostUsd: 0, breakdown: [] };
      byTenant.set(row.tenant_id, summary);
    }
    summary.requests += row.requests;
    summary.prompt_tokens += row.prompt_tokens;
    summary.completion_tokens += row.completion_tokens;
    summary.estimatedCostUsd += cost;
    summary.breakdown.push({
      model: row.model,
      requests: row.requests,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      audioSeconds: row.audio_seconds ?? 0,
      estimatedCostUsd: cost,
    });
  }
  return Array.from(byTenant.values());
}

// Agencia ("widgets de costo real en /admin"): costo real de OpenAI, no
// inventado — se calcula sobre uso real (usage_log) con las tarifas
// públicas de src/costs.ts. all-time y "este mes" (SQLite-vs-SQLite,
// nunca ISO-vs-JS-Date, mismo patrón seguro ya establecido en el
// proyecto para columnas con datetime('now') por default).
export async function getUsageSummary(db: D1Database): Promise<UsageSummary[]> {
  return queryUsageSummary(db, "");
}

export async function getUsageSummaryThisMonth(db: D1Database): Promise<UsageSummary[]> {
  return queryUsageSummary(db, "WHERE date(created_at) >= date('now', 'start of month')");
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
  params: { tenantId: string | null; actor: string; action: string; details?: unknown },
): Promise<void> {
  await db
    .prepare("INSERT INTO admin_actions (tenant_id, actor, action, details) VALUES (?, ?, ?, ?)")
    .bind(params.tenantId, params.actor, params.action, params.details ? JSON.stringify(params.details) : null)
    .run();
}
