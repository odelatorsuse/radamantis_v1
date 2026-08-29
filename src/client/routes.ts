import { Hono } from "hono";
import { createHandoff, resolveHandoffByRef } from "../handoff";
import { getHistory } from "../messages";
import { verifyPassword } from "./passwords";
import {
  getHealthStatus,
  getPastAppointments,
  getTenantUserByEmail,
  getTodayStats,
  getUniqueClients,
  getUpcomingAppointments,
  getWeeklyActivity,
  listConversations,
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
