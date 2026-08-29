import { Hono } from "hono";
import { listVerticalTemplates } from "../verticals/registry";
import { ingestKbDocs, type KbDocInput } from "./kb";
import {
  addChannelBinding,
  createTenant,
  getTenantDetail,
  getUsageSummary,
  listHandoffs,
  listTenants,
  logAdminAction,
  resolveHandoff,
  updateChannelBinding,
  upsertTenantSettings,
} from "./repository";
import { registerTelegramWebhook } from "./telegramSetup";

interface Env {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  ADMIN_API_KEY: string;
  OPENAI_API_KEY: string;
  TELEGRAM_WEBHOOK_SECRET: string;
}

export const adminApp = new Hono<{ Bindings: Env }>();

// D10: API-key de super-admin — nunca Basic Auth. Es un único operador hoy
// (Oscar); JWT/API-key por tenant llega cuando exista gestión self-service.
adminApp.use("*", async (c, next) => {
  const auth = c.req.header("Authorization");
  const expected = `Bearer ${c.env.ADMIN_API_KEY}`;
  if (!c.env.ADMIN_API_KEY || auth !== expected) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

adminApp.get("/tenants", async (c) => {
  const tenants = await listTenants(c.env.DB);
  return c.json({ tenants });
});

adminApp.post("/tenants", async (c) => {
  const body = await c.req.json<{ id?: string; name?: string; verticalId?: string }>();
  if (!body.id || !body.name || !body.verticalId) {
    return c.json({ error: "id, name y verticalId son requeridos" }, 400);
  }
  await createTenant(c.env.DB, body.id, body.name, body.verticalId);
  await logAdminAction(c.env.DB, { tenantId: body.id, action: "create_tenant", details: body });
  return c.json({ ok: true }, 201);
});

adminApp.post("/tenants/:id/channels", async (c) => {
  const tenantId = c.req.param("id");
  const body = await c.req.json<{ channel?: string; externalId?: string }>();
  if (!body.channel || !body.externalId) {
    return c.json({ error: "channel y externalId son requeridos" }, 400);
  }
  await addChannelBinding(c.env.DB, tenantId, body.channel, body.externalId);
  await logAdminAction(c.env.DB, {
    tenantId,
    action: "add_channel_binding",
    details: { channel: body.channel },
  });

  // Etapa 9 (D8): alta de canal = INSERT + registrar el webhook en el mismo
  // paso, sin curl manual. Solo aplica a Telegram por ahora (D2).
  if (body.channel === "telegram") {
    const origin = new URL(c.req.url).origin;
    const webhook = await registerTelegramWebhook(origin, body.externalId, c.env.TELEGRAM_WEBHOOK_SECRET);
    if (!webhook.ok) {
      return c.json({ ok: true, webhookRegistered: false, webhookError: webhook.error }, 201);
    }
  }

  return c.json({ ok: true, webhookRegistered: body.channel === "telegram" }, 201);
});

// Etapa 9: rotar el token de un canal ya vinculado (ej. un token revocado
// por accidente en BotFather) sin borrar y recrear el tenant.
adminApp.put("/tenants/:id/channels/:channel", async (c) => {
  const tenantId = c.req.param("id");
  const channel = c.req.param("channel");
  const body = await c.req.json<{ externalId?: string }>();
  if (!body.externalId) {
    return c.json({ error: "externalId es requerido" }, 400);
  }
  await updateChannelBinding(c.env.DB, tenantId, channel, body.externalId);
  await logAdminAction(c.env.DB, { tenantId, action: "update_channel_binding", details: { channel } });

  if (channel === "telegram") {
    const origin = new URL(c.req.url).origin;
    const webhook = await registerTelegramWebhook(origin, body.externalId, c.env.TELEGRAM_WEBHOOK_SECRET);
    if (!webhook.ok) {
      return c.json({ ok: true, webhookRegistered: false, webhookError: webhook.error });
    }
  }

  return c.json({ ok: true, webhookRegistered: channel === "telegram" });
});

adminApp.post("/tenants/:id/kb", async (c) => {
  const tenantId = c.req.param("id");
  const body = await c.req.json<{ docs?: KbDocInput[] }>();
  if (!body.docs || !Array.isArray(body.docs) || body.docs.length === 0) {
    return c.json({ error: "docs (array de {id, content}) es requerido" }, 400);
  }
  const count = await ingestKbDocs(c.env.VECTORIZE, c.env.OPENAI_API_KEY, tenantId, body.docs);
  await logAdminAction(c.env.DB, { tenantId, action: "ingest_kb", details: { count } });
  return c.json({ ok: true, count });
});

adminApp.get("/tenants/:id", async (c) => {
  const detail = await getTenantDetail(c.env.DB, c.req.param("id"));
  if (!detail) return c.json({ error: "Tenant no encontrado" }, 404);
  return c.json({ tenant: detail });
});

adminApp.put("/tenants/:id/settings", async (c) => {
  const tenantId = c.req.param("id");
  const body = await c.req.json<{ tone?: string; language?: string; currency?: string; promptOverride?: string | null }>();
  const settings = {
    tone: body.tone || "calido",
    language: body.language || "es",
    currency: body.currency || "MXN",
    promptOverride: body.promptOverride?.trim() ? body.promptOverride : null,
  };
  await upsertTenantSettings(c.env.DB, tenantId, settings);
  await logAdminAction(c.env.DB, { tenantId, action: "update_tenant_settings", details: settings });
  return c.json({ ok: true });
});

adminApp.get("/verticals", (c) => {
  const verticals = listVerticalTemplates().map((v) => ({
    verticalId: v.verticalId,
    displayName: v.displayName,
    toolsEnabled: v.toolsEnabled,
  }));
  return c.json({ verticals });
});

adminApp.get("/handoffs", async (c) => {
  const onlyOpen = c.req.query("open") !== "false";
  const handoffs = await listHandoffs(c.env.DB, onlyOpen);
  return c.json({ handoffs });
});

adminApp.post("/handoffs/:id/resolve", async (c) => {
  const id = Number(c.req.param("id"));
  await resolveHandoff(c.env.DB, id);
  await logAdminAction(c.env.DB, { tenantId: null, action: "resolve_handoff", details: { id } });
  return c.json({ ok: true });
});

adminApp.get("/usage", async (c) => {
  const usage = await getUsageSummary(c.env.DB);
  return c.json({ usage });
});
