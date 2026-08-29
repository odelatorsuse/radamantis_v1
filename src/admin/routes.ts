import { Hono } from "hono";
import { DEFAULT_BUSINESS_HOURS, type WeeklyBusinessHours } from "../calendar/businessHours";
import { buildGoogleAuthUrl } from "../calendar/oauth";
import { deleteCalendarConnection, getCalendarConnection } from "../calendar/repository";
import { runNoShowSweep } from "../noShowSweep";
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
  AGENT: DurableObjectNamespace;
  ADMIN_API_KEY: string;
  OPENAI_API_KEY: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  GOOGLE_OAUTH_CLIENT_ID: string;
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
  const body = await c.req.json<{
    tone?: string;
    language?: string;
    currency?: string;
    promptOverride?: string | null;
    timezone?: string;
    businessHours?: WeeklyBusinessHours;
  }>();
  const settings = {
    tone: body.tone || "calido",
    language: body.language || "es",
    currency: body.currency || "MXN",
    promptOverride: body.promptOverride?.trim() ? body.promptOverride : null,
    timezone: body.timezone || "America/Mexico_City",
    businessHours: body.businessHours || DEFAULT_BUSINESS_HOURS,
  };
  await upsertTenantSettings(c.env.DB, tenantId, settings);
  await logAdminAction(c.env.DB, { tenantId, action: "update_tenant_settings", details: settings });
  return c.json({ ok: true });
});

// Etapa 10 (Fase A, booking real): estado/conexión/desconexión del
// calendario de un tenant. El intercambio código→tokens vive en la ruta
// pública /oauth/google/callback (index.ts) — Google redirige el navegador
// ahí directo, sin nuestro Bearer token.
adminApp.get("/tenants/:id/calendar", async (c) => {
  const connection = await getCalendarConnection(c.env.DB, c.req.param("id"));
  if (!connection) return c.json({ connected: false });
  return c.json({
    connected: true,
    provider: connection.provider,
    calendarId: connection.calendarId,
    connectedAt: connection.connectedAt,
  });
});

adminApp.get("/tenants/:id/calendar/connect-url", (c) => {
  const origin = new URL(c.req.url).origin;
  const redirectUri = `${origin}/oauth/google/callback`;
  const url = buildGoogleAuthUrl(c.env.GOOGLE_OAUTH_CLIENT_ID, redirectUri, c.req.param("id"));
  return c.json({ url });
});

adminApp.delete("/tenants/:id/calendar", async (c) => {
  const tenantId = c.req.param("id");
  await deleteCalendarConnection(c.env.DB, tenantId);
  await logAdminAction(c.env.DB, { tenantId, action: "disconnect_calendar" });
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

// Herramienta de prueba: habla directo con el ConversationAgent real de un
// tenant (mismo LLM, mismo GoogleCalendarProvider, mismas reglas de horario)
// sin pasar por Telegram — para poder reproducir y depurar conversaciones
// (ej. booking) sin necesitar el bot en producción. channel fijo "debug" para
// no mezclar nunca con historial real de un canal de verdad; usa el mismo
// chatId para mantener memoria entre turnos de una misma prueba.
adminApp.post("/tenants/:id/test-message", async (c) => {
  const tenantId = c.req.param("id");
  const body = await c.req.json<{ chatId?: string; text?: string }>();
  if (!body.chatId || !body.text) {
    return c.json({ error: "chatId y text son requeridos" }, 400);
  }

  const tenant = await getTenantDetail(c.env.DB, tenantId);
  if (!tenant) return c.json({ error: "Tenant no encontrado" }, 404);

  const conversationKey = `${tenantId}:debug:${body.chatId}`;
  const stub = c.env.AGENT.get(c.env.AGENT.idFromName(conversationKey));
  const agentRes = await stub.fetch("https://agent/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenantId,
      channel: "debug",
      chatId: body.chatId,
      userText: body.text,
      verticalId: tenant.vertical_id,
    }),
  });
  const result = await agentRes.json<{ replyText: string | null }>();
  return c.json(result);
});

// Etapa 10 (superpower "Recupera no-shows"): mismo barrido que corre el
// Cron Trigger de wrangler.toml, disponible aquí para probarlo bajo demanda
// (o para forzarlo manualmente si el cron falló) sin esperar a la siguiente
// corrida programada.
adminApp.post("/no-show-sweep", async (c) => {
  const result = await runNoShowSweep(c.env.DB);
  return c.json(result);
});
