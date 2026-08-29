import { Hono } from "hono";
import { listVerticalTemplates } from "../verticals/registry";
import {
  addChannelBinding,
  createTenant,
  getTenantDetail,
  getUsageSummary,
  listHandoffs,
  listTenants,
  logAdminAction,
  resolveHandoff,
  upsertTenantSettings,
} from "./repository";

interface Env {
  DB: D1Database;
  ADMIN_API_KEY: string;
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
  return c.json({ ok: true }, 201);
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
