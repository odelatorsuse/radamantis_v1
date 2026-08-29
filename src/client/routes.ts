import { Hono } from "hono";
import { getChannelProvider } from "../channels/registry";
import { createHandoff, isPaused, resolveHandoffByRef } from "../handoff";
import { appendMessage, getHistory } from "../messages";
import { dismissKbGap, listKbGaps } from "../rag/gaps";
import { getChannelExternalId, getTenantSettings } from "../tenants";
import { verifyPassword } from "./passwords";
import {
  clearAlertChatId,
  getHealthStatus,
  getOrCreateAlertSettings,
  getPastAppointments,
  getTenantUserByEmail,
  getTodayStats,
  getUniqueClients,
  getUpcomingAppointments,
  getWeeklyActivity,
  listConversations,
  setLeadReengagementEnabled,
  setReviewLink,
} from "./repository";
import { createSessionToken, verifySessionToken } from "./session";

interface Env {
  DB: D1Database;
  CLIENT_SESSION_SECRET: string;
}

// D10: consola del cliente — auth propia por tenant, separada del
// ADMIN_API_KEY de super-admin. Todas las rutas de aquí para abajo derivan
// tenantId SIEMPRE del token de sesión verificado, nunca de un parámetro de
// URL — es la garantía de que un cliente jamás puede ver datos de otro.
export const clientApp = new Hono<{ Bindings: Env; Variables: { tenantId: string } }>();

clientApp.post("/login", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  if (!body.email || !body.password) {
    return c.json({ error: "email y password son requeridos" }, 400);
  }
  const user = await getTenantUserByEmail(c.env.DB, body.email);
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    return c.json({ error: "Credenciales inválidas" }, 401);
  }
  const token = await createSessionToken(c.env.CLIENT_SESSION_SECRET, user.tenantId, user.id);
  return c.json({ token, tenantId: user.tenantId });
});

clientApp.use("*", async (c, next) => {
  const auth = c.req.header("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
  const session = token ? await verifySessionToken(c.env.CLIENT_SESSION_SECRET, token) : null;
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("tenantId", session.tenantId);
  await next();
});

clientApp.get("/stats/today", async (c) => {
  const stats = await getTodayStats(c.env.DB, c.get("tenantId"));
  return c.json({ stats });
});

clientApp.get("/stats/week", async (c) => {
  const days = await getWeeklyActivity(c.env.DB, c.get("tenantId"));
  return c.json({ days });
});

clientApp.get("/clients", async (c) => {
  const clients = await getUniqueClients(c.env.DB, c.get("tenantId"));
  return c.json({ clients });
});

clientApp.get("/appointments", async (c) => {
  const tenantId = c.get("tenantId");
  const [upcoming, past] = await Promise.all([getUpcomingAppointments(c.env.DB, tenantId), getPastAppointments(c.env.DB, tenantId)]);
  return c.json({ upcoming, past });
});

clientApp.get("/health", async (c) => {
  const health = await getHealthStatus(c.env.DB, c.get("tenantId"));
  return c.json({ health });
});

clientApp.get("/conversations", async (c) => {
  const conversations = await listConversations(c.env.DB, c.get("tenantId"));
  return c.json({ conversations });
});

clientApp.get("/conversations/:channel/:chatId/messages", async (c) => {
  const ref = { tenantId: c.get("tenantId"), channel: c.req.param("channel"), chatId: c.req.param("chatId") };
  const messages = await getHistory(c.env.DB, ref, 100);
  return c.json({ messages });
});

clientApp.post("/conversations/:channel/:chatId/pause", async (c) => {
  const ref = { tenantId: c.get("tenantId"), channel: c.req.param("channel"), chatId: c.req.param("chatId") };
  await createHandoff(c.env.DB, ref, "Pausado manualmente desde la consola del cliente");
  return c.json({ ok: true });
});

clientApp.post("/conversations/:channel/:chatId/resume", async (c) => {
  const ref = { tenantId: c.get("tenantId"), channel: c.req.param("channel"), chatId: c.req.param("chatId") };
  await resolveHandoffByRef(c.env.DB, ref);
  return c.json({ ok: true });
});

// Etapa 10 (consola del cliente — manejo de chats): el negocio responde a
// mano, real, por el mismo canal — no es el LLM. Se pausa el bot de forma
// automática si no lo estaba ya, para que no le conteste al cliente encima
// de lo que el humano acaba de escribir.
clientApp.post("/conversations/:channel/:chatId/send", async (c) => {
  const tenantId = c.get("tenantId");
  const channel = c.req.param("channel");
  const chatId = c.req.param("chatId");
  const ref = { tenantId, channel, chatId };

  const body = await c.req.json<{ text?: string }>();
  if (!body.text || !body.text.trim()) {
    return c.json({ error: "text es requerido" }, 400);
  }

  const provider = getChannelProvider(channel);
  if (!provider) {
    return c.json({ error: `Canal "${channel}" no soportado para responder desde la consola todavía` }, 400);
  }

  const externalId = await getChannelExternalId(c.env.DB, tenantId, channel);
  if (!externalId) {
    return c.json({ error: `No hay un canal de ${provider.displayName} vinculado a este tenant` }, 404);
  }

  try {
    await provider.sendMessage(externalId, chatId, body.text);
  } catch (err) {
    return c.json({ error: `No se pudo enviar el mensaje: ${(err as Error).message}` }, 502);
  }

  await appendMessage(c.env.DB, ref, { role: "assistant", content: body.text, sentBy: "human" });
  if (!(await isPaused(c.env.DB, ref))) {
    await createHandoff(c.env.DB, ref, "Pausado automáticamente al responder manualmente desde la consola del cliente");
  }

  return c.json({ ok: true });
});

// Etapa 10 (superpower "Vigilante"): el dueño ve/genera su código de
// activación aquí — mandárselo a su propio bot por Telegram vincula su
// chat_id (lo hace el webhook en src/index.ts, no esta ruta).
clientApp.get("/alert-settings", async (c) => {
  const settings = await getOrCreateAlertSettings(c.env.DB, c.get("tenantId"));
  return c.json(settings);
});

clientApp.delete("/alert-settings", async (c) => {
  await clearAlertChatId(c.env.DB, c.get("tenantId"));
  return c.json({ ok: true });
});

// Etapa 10 (superpower "Mejoras"): preguntas que el bot no pudo responder
// con confianza — el dueño decide qué agregar a su base de conocimiento,
// el bot nunca la edita solo.
clientApp.get("/kb-gaps", async (c) => {
  const gaps = await listKbGaps(c.env.DB, c.get("tenantId"));
  return c.json({ gaps });
});

clientApp.delete("/kb-gaps/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await dismissKbGap(c.env.DB, c.get("tenantId"), id);
  return c.json({ ok: true });
});

// Etapa 10 (unifica no-shows + encuesta + reseñas): link de reseñas (ej.
// Google Business) — sin esto, el bot no pide reseña, solo agradece.
clientApp.get("/review-link", async (c) => {
  const settings = await getTenantSettings(c.env.DB, c.get("tenantId"));
  return c.json({ reviewLink: settings.reviewLink });
});

clientApp.put("/review-link", async (c) => {
  const body = await c.req.json<{ reviewLink?: string | null }>();
  const reviewLink = body.reviewLink?.trim() ? body.reviewLink.trim() : null;
  await setReviewLink(c.env.DB, c.get("tenantId"), reviewLink);
  return c.json({ ok: true });
});

// Etapa 10 (superpower "Reenganche de leads fríos"): opt-in, el dueño lo
// activa/desactiva desde /console.
clientApp.get("/lead-reengagement", async (c) => {
  const settings = await getTenantSettings(c.env.DB, c.get("tenantId"));
  return c.json({ enabled: settings.leadReengagementEnabled });
});

clientApp.put("/lead-reengagement", async (c) => {
  const body = await c.req.json<{ enabled?: boolean }>();
  await setLeadReengagementEnabled(c.env.DB, c.get("tenantId"), body.enabled === true);
  return c.json({ ok: true });
});
