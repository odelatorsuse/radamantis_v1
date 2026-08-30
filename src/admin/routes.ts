import { Hono, type MiddlewareHandler } from "hono";
import type { AdminRole } from "./session";
import { createAdminSessionToken, verifyAdminSessionToken } from "./session";
import { createAdminUser, deleteAdminUser, getAdminUserByEmail, listAdminUsers, setAdminUserPassword } from "./team";
import { DEFAULT_BUSINESS_HOURS, type WeeklyBusinessHours } from "../calendar/businessHours";
import { buildGoogleAuthUrl } from "../calendar/oauth";
import { deleteCalendarConnection, getCalendarConnection } from "../calendar/repository";
import { getChannelProvider, listSupportedChannels } from "../channels/registry";
import { createTenantUser, getTenantUserByEmail, setTenantUserPassword } from "../client/repository";
import { hashPassword, verifyPassword } from "../passwords";
import { runColdLeadSweep } from "../coldLeads";
import { runDailyReportSweep } from "../dailyReport";
import { hasRecentActivity } from "../messages";
import { runNoShowSweep } from "../noShowSweep";
import { MIN_RELEVANCE_SCORE } from "../prompts";
import { ingestKbDocs, listKbDocuments, type KbDocInput } from "../rag/kb";
import { getTenantSettings, upsertTenantSettings } from "../tenants";
import { getToolCallCounts30d } from "../toolCalls";
import { getVerticalTemplate, listVerticalTemplates } from "../verticals/registry";
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
} from "./repository";

interface Env {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AGENT: DurableObjectNamespace;
  ADMIN_API_KEY: string;
  ADMIN_SESSION_SECRET: string;
  OPENAI_API_KEY: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  GOOGLE_OAUTH_CLIENT_ID: string;
}

type Variables = { role: AdminRole; actor: string };

export const adminApp = new Hono<{ Bindings: Env; Variables: Variables }>();

// Etapa Agencia (Equipo/roles): login propio por persona, alternativa al
// ADMIN_API_KEY compartido. Público — antes del middleware de auth de abajo,
// mismo patrón que /api/client/login.
adminApp.post("/login", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  if (!body.email || !body.password) {
    return c.json({ error: "email y password son requeridos" }, 400);
  }
  const user = await getAdminUserByEmail(c.env.DB, body.email);
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    return c.json({ error: "Credenciales inválidas" }, 401);
  }
  const token = await createAdminSessionToken(c.env.ADMIN_SESSION_SECRET, user.id, user.email, user.role);
  return c.json({ token, email: user.email, role: user.role });
});

// D10: dos formas válidas de entrar — la llave maestra compartida
// (ADMIN_API_KEY, para automatización/el Skill de Claude, acceso total
// siempre) o una sesión de persona con rol (admin/operador, ver ./team.ts).
// Nunca Basic Auth.
adminApp.use("*", async (c, next) => {
  const auth = c.req.header("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  if (c.env.ADMIN_API_KEY && token === c.env.ADMIN_API_KEY) {
    c.set("role", "admin");
    c.set("actor", "api-key");
    return next();
  }

  const session = await verifyAdminSessionToken(c.env.ADMIN_SESSION_SECRET, token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("role", session.role);
  c.set("actor", session.email);
  await next();
});

// Acciones sensibles (crear tenants, rotar tokens de canal, ver costos de
// uso, gestionar el equipo) — solo rol admin, nunca operador.
const requireAdmin: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  if (c.get("role") !== "admin") return c.json({ error: "Esta acción requiere rol admin" }, 403);
  await next();
};

adminApp.get("/tenants", async (c) => {
  const tenants = await listTenants(c.env.DB);
  return c.json({ tenants });
});

adminApp.post("/tenants", requireAdmin, async (c) => {
  const body = await c.req.json<{ id?: string; name?: string; verticalId?: string }>();
  if (!body.id || !body.name || !body.verticalId) {
    return c.json({ error: "id, name y verticalId son requeridos" }, 400);
  }
  await createTenant(c.env.DB, body.id, body.name, body.verticalId);
  await logAdminAction(c.env.DB, { tenantId: body.id, actor: c.get("actor"), action: "create_tenant", details: body });
  return c.json({ ok: true }, 201);
});

// Etapa 9 (D8): alta/edición de canal = INSERT + registrar el webhook en el
// mismo paso, sin curl manual. Etapa 10: pasa por ChannelProvider en vez de
// comparar channel === "telegram" — un canal sin adaptador (o cuyo
// adaptador no registra webhook) simplemente no intenta nada, no es un error.
async function registerChannelWebhook(origin: string, channel: string, externalId: string, telegramWebhookSecret: string) {
  const provider = getChannelProvider(channel);
  if (!provider?.registerWebhook) return { webhookRegistered: false, webhookError: undefined as string | undefined };
  const result = await provider.registerWebhook(origin, externalId, telegramWebhookSecret);
  return { webhookRegistered: result.ok, webhookError: result.error };
}

adminApp.post("/tenants/:id/channels", async (c) => {
  const tenantId = c.req.param("id");
  const body = await c.req.json<{ channel?: string; externalId?: string }>();
  if (!body.channel || !body.externalId) {
    return c.json({ error: "channel y externalId son requeridos" }, 400);
  }
  await addChannelBinding(c.env.DB, tenantId, body.channel, body.externalId);
  await logAdminAction(c.env.DB, {
    tenantId,
    actor: c.get("actor"),
    action: "add_channel_binding",
    details: { channel: body.channel },
  });

  const origin = new URL(c.req.url).origin;
  const { webhookRegistered, webhookError } = await registerChannelWebhook(origin, body.channel, body.externalId, c.env.TELEGRAM_WEBHOOK_SECRET);
  return c.json({ ok: true, webhookRegistered, ...(webhookError ? { webhookError } : {}) }, 201);
});

// Etapa 9: rotar el token de un canal ya vinculado (ej. un token revocado
// por accidente en BotFather) sin borrar y recrear el tenant.
adminApp.put("/tenants/:id/channels/:channel", requireAdmin, async (c) => {
  const tenantId = c.req.param("id");
  const channel = c.req.param("channel");
  const body = await c.req.json<{ externalId?: string }>();
  if (!body.externalId) {
    return c.json({ error: "externalId es requerido" }, 400);
  }
  await updateChannelBinding(c.env.DB, tenantId, channel, body.externalId);
  await logAdminAction(c.env.DB, { tenantId, actor: c.get("actor"), action: "update_channel_binding", details: { channel } });

  const origin = new URL(c.req.url).origin;
  const { webhookRegistered, webhookError } = await registerChannelWebhook(origin, channel, body.externalId, c.env.TELEGRAM_WEBHOOK_SECRET);
  return c.json({ ok: true, webhookRegistered, ...(webhookError ? { webhookError } : {}) });
});

adminApp.post("/tenants/:id/kb", async (c) => {
  const tenantId = c.req.param("id");
  const body = await c.req.json<{ docs?: KbDocInput[] }>();
  if (!body.docs || !Array.isArray(body.docs) || body.docs.length === 0) {
    return c.json({ error: "docs (array de {id, content}) es requerido" }, 400);
  }
  const count = await ingestKbDocs(c.env.DB, c.env.VECTORIZE, c.env.OPENAI_API_KEY, tenantId, body.docs);
  await logAdminAction(c.env.DB, { tenantId, actor: c.get("actor"), action: "ingest_kb", details: { count } });
  return c.json({ ok: true, count });
});

adminApp.get("/tenants/:id", async (c) => {
  const detail = await getTenantDetail(c.env.DB, c.req.param("id"));
  if (!detail) return c.json({ error: "Tenant no encontrado" }, 404);
  return c.json({ tenant: detail });
});

// Agencia ("Flujo"): radiografía real del pipeline de ESTE tenant —
// nunca datos inventados. Cada campo sale de una fuente real: el
// Vertical Template (D6), la conexión de calendario real, el conteo real
// de documentos de KB, y los conteos reales de tool_calls de los últimos
// 30 días (0 significa "no se ha usado", no "no existe").
adminApp.get("/tenants/:id/flow", async (c) => {
  const tenantId = c.req.param("id");
  const detail = await getTenantDetail(c.env.DB, tenantId);
  if (!detail) return c.json({ error: "Tenant no encontrado" }, 404);

  const template = getVerticalTemplate(detail.vertical_id);
  const [calendarConnection, kbDocs, toolCallCounts30d, recentActivity] = await Promise.all([
    getCalendarConnection(c.env.DB, tenantId),
    template.toolsEnabled.includes("searchKb") ? listKbDocuments(c.env.DB, tenantId) : Promise.resolve([]),
    getToolCallCounts30d(c.env.DB, tenantId),
    hasRecentActivity(c.env.DB, tenantId),
  ]);

  return c.json({
    channels: detail.channels.map((ch) => ({ channel: ch.channel })),
    conversationCount: detail.metrics.conversations,
    recentActivity,
    memory: { store: "D1", windowMessages: 20 },
    model: { provider: "OpenAI", name: "gpt-4o-mini" },
    rag: template.toolsEnabled.includes("searchKb")
      ? { enabled: true, minRelevanceScore: MIN_RELEVANCE_SCORE, documentCount: kbDocs.length }
      : { enabled: false, minRelevanceScore: null, documentCount: 0 },
    calendarConnected: calendarConnection !== null,
    toolsEnabled: template.toolsEnabled,
    toolCallCounts30d,
  });
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
  // alertChatId/alertActivationCode se preservan tal cual — se manejan
  // exclusivamente desde /console (Etapa 10, superpower "Vigilante"), nunca
  // desde este formulario, para que guardar tono/idioma/etc. no los borre.
  const current = await getTenantSettings(c.env.DB, tenantId);
  const settings = {
    tone: body.tone || "calido",
    language: body.language || "es",
    currency: body.currency || "MXN",
    promptOverride: body.promptOverride?.trim() ? body.promptOverride : null,
    timezone: body.timezone || "America/Mexico_City",
    businessHours: body.businessHours || DEFAULT_BUSINESS_HOURS,
    alertChatId: current.alertChatId,
    alertActivationCode: current.alertActivationCode,
    reviewLink: current.reviewLink,
    leadReengagementEnabled: current.leadReengagementEnabled,
  };
  await upsertTenantSettings(c.env.DB, tenantId, settings);
  await logAdminAction(c.env.DB, { tenantId, actor: c.get("actor"), action: "update_tenant_settings", details: settings });
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
  await logAdminAction(c.env.DB, { tenantId, actor: c.get("actor"), action: "disconnect_calendar" });
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

// Etapa 10: data-driven en vez de hardcodear opciones en el HTML del
// dashboard — agregar un canal nuevo (src/channels/) lo hace aparecer aquí
// solo, sin tocar dashboardHtml.ts.
adminApp.get("/channels/supported", (c) => {
  const channels = listSupportedChannels().map((p) => ({ channel: p.channel, displayName: p.displayName }));
  return c.json({ channels });
});

adminApp.get("/handoffs", async (c) => {
  const onlyOpen = c.req.query("open") !== "false";
  const handoffs = await listHandoffs(c.env.DB, onlyOpen);
  return c.json({ handoffs });
});

adminApp.post("/handoffs/:id/resolve", async (c) => {
  const id = Number(c.req.param("id"));
  await resolveHandoff(c.env.DB, id);
  await logAdminAction(c.env.DB, { tenantId: null, actor: c.get("actor"), action: "resolve_handoff", details: { id } });
  return c.json({ ok: true });
});

adminApp.get("/usage", requireAdmin, async (c) => {
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

// Etapa 10 (superpower "Reporte diario"): mismo patrón que /no-show-sweep —
// probarlo bajo demanda sin esperar a que sea la hora local de algún tenant.
adminApp.post("/daily-report-sweep", async (c) => {
  const result = await runDailyReportSweep(c.env.DB);
  return c.json(result);
});

// Etapa 10 (superpower "Reenganche de leads fríos"): mismo patrón que los
// otros barridos — probarlo bajo demanda sin esperar 5 horas.
adminApp.post("/cold-lead-sweep", async (c) => {
  const result = await runColdLeadSweep(c.env.DB);
  return c.json(result);
});

// Etapa 10 (consola del cliente, D10): Oscar crea el login del cliente al
// dar de alta el tenant (o después). Usuario/contraseña, no API key —
// decisión explícita de Oscar (más familiar para un dueño de negocio no
// técnico que un token).
adminApp.post("/tenants/:id/users", async (c) => {
  const tenantId = c.req.param("id");
  const body = await c.req.json<{ email?: string; password?: string }>();
  if (!body.email || !body.password) {
    return c.json({ error: "email y password son requeridos" }, 400);
  }
  if (body.password.length < 8) {
    return c.json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);
  }
  const tenant = await getTenantDetail(c.env.DB, tenantId);
  if (!tenant) return c.json({ error: "Tenant no encontrado" }, 404);

  const passwordHash = await hashPassword(body.password);
  try {
    await createTenantUser(c.env.DB, tenantId, body.email, passwordHash);
  } catch (err) {
    return c.json({ error: `No se pudo crear el usuario (¿email ya usado?): ${(err as Error).message}` }, 409);
  }
  await logAdminAction(c.env.DB, { tenantId, actor: c.get("actor"), action: "create_client_user", details: { email: body.email } });
  return c.json({ ok: true }, 201);
});

adminApp.put("/tenants/:id/users/password", async (c) => {
  const tenantId = c.req.param("id");
  const body = await c.req.json<{ email?: string; newPassword?: string }>();
  if (!body.email || !body.newPassword) {
    return c.json({ error: "email y newPassword son requeridos" }, 400);
  }
  if (body.newPassword.length < 8) {
    return c.json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);
  }
  const user = await getTenantUserByEmail(c.env.DB, body.email);
  if (!user || user.tenantId !== tenantId) {
    return c.json({ error: "Usuario no encontrado para este tenant" }, 404);
  }
  await setTenantUserPassword(c.env.DB, user.id, await hashPassword(body.newPassword));
  await logAdminAction(c.env.DB, { tenantId, actor: c.get("actor"), action: "reset_client_user_password", details: { email: body.email } });
  return c.json({ ok: true });
});

// Etapa Agencia (Equipo/roles): gestión del equipo interno que usa el
// panel admin (distinto de /tenants/:id/users, que son logins de /console
// para el DUEÑO DEL NEGOCIO, no para el equipo de Radamantis). Solo rol
// admin puede crear/editar/borrar miembros — un operador jamás debe poder
// otorgarse a sí mismo (u a otros) más acceso del que tiene.
adminApp.post("/admin-users", requireAdmin, async (c) => {
  const body = await c.req.json<{ email?: string; password?: string; role?: string }>();
  if (!body.email || !body.password || !body.role) {
    return c.json({ error: "email, password y role son requeridos" }, 400);
  }
  if (body.role !== "admin" && body.role !== "operador") {
    return c.json({ error: "role debe ser 'admin' u 'operador'" }, 400);
  }
  if (body.password.length < 8) {
    return c.json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);
  }
  const passwordHash = await hashPassword(body.password);
  try {
    await createAdminUser(c.env.DB, body.email, passwordHash, body.role);
  } catch (err) {
    return c.json({ error: `No se pudo crear el usuario (¿email ya usado?): ${(err as Error).message}` }, 409);
  }
  await logAdminAction(c.env.DB, { tenantId: null, actor: c.get("actor"), action: "create_admin_user", details: { email: body.email, role: body.role } });
  return c.json({ ok: true }, 201);
});

adminApp.get("/admin-users", requireAdmin, async (c) => {
  const users = await listAdminUsers(c.env.DB);
  return c.json({ users });
});

adminApp.put("/admin-users/:id/password", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ newPassword?: string }>();
  if (!body.newPassword || body.newPassword.length < 8) {
    return c.json({ error: "newPassword es requerido (mínimo 8 caracteres)" }, 400);
  }
  await setAdminUserPassword(c.env.DB, id, await hashPassword(body.newPassword));
  await logAdminAction(c.env.DB, { tenantId: null, actor: c.get("actor"), action: "reset_admin_user_password", details: { id } });
  return c.json({ ok: true });
});

adminApp.delete("/admin-users/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  await deleteAdminUser(c.env.DB, id);
  await logAdminAction(c.env.DB, { tenantId: null, actor: c.get("actor"), action: "delete_admin_user", details: { id } });
  return c.json({ ok: true });
});
