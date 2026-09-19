import { Hono } from "hono";
import { getChannelProvider } from "../channels/registry";
import { createCatalogItem, deleteCatalogItem, listCatalogItems, updateCatalogItem } from "../catalog";
import { createHandoff, isPaused, resolveHandoffByRef } from "../handoff";
import { appendMessage, getHistory } from "../messages";
import {
  addWalkInPair,
  addWalkInPlayer,
  cancelRegistrationById,
  closeTournament,
  createTournament,
  getTournamentById,
  listAllTournaments,
  listRegistrations,
  resetTournament,
  setRegistrationCheckin,
} from "../padel";
import { isPadelCategory, listCategoryConfigs, upsertCategoryConfig, getPadelSettings, upsertPadelSettings, PADEL_CATEGORIES } from "../padelCategories";
import {
  finalizeIfChampionDecided,
  generateFinal,
  generateFixture,
  generatePlayoffs,
  getMatchById,
  getStandings,
  listMatches,
  recordMatchScore,
} from "../padelMatches";
import { notifyPromotedPlayer } from "../padelTool";
import { dismissKbGap, listKbGaps } from "../rag/gaps";
import { createKbDocument, deleteKbDocument, listKbDocuments, reindexAllKbDocuments, updateKbDocument } from "../rag/kb";
import { normalizeToUtcISOString, utcToLocalDateTimeString } from "../calendar/timezone";
import { getChannelExternalId, getTenantSettings, getVerticalIdForTenant } from "../tenants";
import { getVerticalTemplate } from "../verticals/registry";
import { verifyPassword } from "../passwords";
import {
  clearAlertChatId,
  getAppointmentsForCurrentMonth,
  getHealthStatus,
  getOrCreateAlertSettings,
  getPastAppointments,
  getTenantUserByEmail,
  getTodayStats,
  getUniqueClients,
  getUpcomingAppointments,
  getWeeklyActivity,
  listConversations,
  setAutoResumeHandoffEnabled,
  setBranding,
  setCustomHandoffKeywords,
  setLeadReengagementEnabled,
  setReviewLink,
  setStaffMembers,
} from "./repository";
import { createSessionToken, verifySessionToken } from "./session";

interface Env {
  DB: D1Database;
  CLIENT_SESSION_SECRET: string;
  VECTORIZE: VectorizeIndex;
  OPENAI_API_KEY: string;
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

// Backlog de Agencia: Oscar detectó que /console mostraba las mismas
// pestañas a TODOS los tenants sin importar su giro (ej. "Torneos" para un
// dentista) — el panel nunca sabía qué vertical tenía enfrente. Expone
// SOLO lo que /console necesita para decidir qué mostrar (toolsEnabled,
// misma fuente de verdad que ya usa el core para el agente/prompt — D9,
// sin lógica nueva) — nunca el promptBase ni detalles internos.
clientApp.get("/vertical", async (c) => {
  const tenantId = c.get("tenantId");
  const verticalId = await getVerticalIdForTenant(c.env.DB, tenantId);
  const template = getVerticalTemplate(verticalId ?? "sandbox");
  return c.json({ verticalId: template.verticalId, displayName: template.displayName, toolsEnabled: template.toolsEnabled });
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
  const [upcoming, past, currentMonth] = await Promise.all([
    getUpcomingAppointments(c.env.DB, tenantId),
    getPastAppointments(c.env.DB, tenantId),
    getAppointmentsForCurrentMonth(c.env.DB, tenantId),
  ]);
  return c.json({ upcoming, past, currentMonth });
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

// Etapa Agencia ("Conocimiento", autoservicio del dueño del negocio):
// gestión propia de la base de conocimiento, sin depender de Oscar.
// Un vector por documento (sin fragmentar), decisión explícita de Oscar.
clientApp.get("/kb", async (c) => {
  const documents = await listKbDocuments(c.env.DB, c.get("tenantId"));
  return c.json({ documents });
});

clientApp.post("/kb", async (c) => {
  const body = await c.req.json<{ title?: string; content?: string }>();
  if (!body.title?.trim() || !body.content?.trim()) {
    return c.json({ error: "title y content son requeridos" }, 400);
  }
  const docId = await createKbDocument(c.env.DB, c.env.VECTORIZE, c.env.OPENAI_API_KEY, c.get("tenantId"), body.title, body.content);
  return c.json({ ok: true, docId }, 201);
});

clientApp.put("/kb/:docId", async (c) => {
  const body = await c.req.json<{ title?: string; content?: string }>();
  if (!body.title?.trim() || !body.content?.trim()) {
    return c.json({ error: "title y content son requeridos" }, 400);
  }
  await updateKbDocument(c.env.DB, c.env.VECTORIZE, c.env.OPENAI_API_KEY, c.get("tenantId"), c.req.param("docId"), body.title, body.content);
  return c.json({ ok: true });
});

clientApp.delete("/kb/:docId", async (c) => {
  await deleteKbDocument(c.env.DB, c.env.VECTORIZE, c.get("tenantId"), c.req.param("docId"));
  return c.json({ ok: true });
});

clientApp.post("/kb/reindex", async (c) => {
  const count = await reindexAllKbDocuments(c.env.DB, c.env.VECTORIZE, c.env.OPENAI_API_KEY, c.get("tenantId"));
  return c.json({ ok: true, count });
});

// Agencia (Fase 2b: catálogo con fotos) — mismo patrón CRUD que /kb, sin
// Vectorize (un catálogo de negocio es chico, LIKE alcanza). price/photoUrl
// son opcionales: string vacío se guarda como null.
clientApp.get("/catalog", async (c) => {
  const items = await listCatalogItems(c.env.DB, c.get("tenantId"));
  return c.json({ items });
});

clientApp.post("/catalog", async (c) => {
  const body = await c.req.json<{ title?: string; description?: string; price?: string; photoUrl?: string }>();
  if (!body.title?.trim() || !body.description?.trim()) {
    return c.json({ error: "title y description son requeridos" }, 400);
  }
  const itemId = await createCatalogItem(
    c.env.DB,
    c.get("tenantId"),
    body.title,
    body.description,
    body.price?.trim() || null,
    body.photoUrl?.trim() || null,
  );
  return c.json({ ok: true, itemId }, 201);
});

clientApp.put("/catalog/:itemId", async (c) => {
  const body = await c.req.json<{ title?: string; description?: string; price?: string; photoUrl?: string }>();
  if (!body.title?.trim() || !body.description?.trim()) {
    return c.json({ error: "title y description son requeridos" }, 400);
  }
  await updateCatalogItem(
    c.env.DB,
    c.get("tenantId"),
    c.req.param("itemId"),
    body.title,
    body.description,
    body.price?.trim() || null,
    body.photoUrl?.trim() || null,
  );
  return c.json({ ok: true });
});

clientApp.delete("/catalog/:itemId", async (c) => {
  await deleteCatalogItem(c.env.DB, c.get("tenantId"), c.req.param("itemId"));
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

// Agencia ("auto-reanudar tras pausa por handoff"): opt-in, mismo patrón
// que arriba — apagado por default para no interrumpir si el negocio
// sigue atendiendo al cliente por su cuenta.
clientApp.get("/auto-resume-handoff", async (c) => {
  const settings = await getTenantSettings(c.env.DB, c.get("tenantId"));
  return c.json({ enabled: settings.autoResumeHandoffEnabled });
});

clientApp.put("/auto-resume-handoff", async (c) => {
  const body = await c.req.json<{ enabled?: boolean }>();
  await setAutoResumeHandoffEnabled(c.env.DB, c.get("tenantId"), body.enabled === true);
  return c.json({ ok: true });
});

// Agencia ("palabras de handoff editables por tenant"): SE SUMAN a la
// lista base (nunca la reemplazan) — un tenant que deja esto vacío no
// pierde el blindaje de handoff de siempre.
clientApp.get("/handoff-keywords", async (c) => {
  const settings = await getTenantSettings(c.env.DB, c.get("tenantId"));
  return c.json({ keywords: settings.customHandoffKeywords });
});

clientApp.put("/handoff-keywords", async (c) => {
  const body = await c.req.json<{ keywords?: string[] }>();
  const keywords = Array.isArray(body.keywords) ? body.keywords.map((k) => k.trim()).filter(Boolean) : [];
  await setCustomHandoffKeywords(c.env.DB, c.get("tenantId"), keywords);
  return c.json({ ok: true });
});

// Agencia (White-label, alcance confirmado con Oscar: por tenant en
// /console, no multi-agencia): el dueño del negocio ve SU propio nombre/
// logo/color en su consola. Los tres son opcionales — vacío/ausente = null
// = vuelve al default de Radamantis.
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

clientApp.get("/branding", async (c) => {
  const settings = await getTenantSettings(c.env.DB, c.get("tenantId"));
  return c.json({ brandName: settings.brandName, brandLogoUrl: settings.brandLogoUrl, brandColor: settings.brandColor });
});

clientApp.put("/branding", async (c) => {
  const body = await c.req.json<{ brandName?: string | null; brandLogoUrl?: string | null; brandColor?: string | null }>();
  const brandColor = body.brandColor?.trim() || null;
  if (brandColor && !HEX_COLOR.test(brandColor)) {
    return c.json({ error: "El color debe ser un hex válido, ej. #0E9F6E" }, 400);
  }
  await setBranding(c.env.DB, c.get("tenantId"), {
    brandName: body.brandName?.trim() || null,
    brandLogoUrl: body.brandLogoUrl?.trim() || null,
    brandColor,
  });
  return c.json({ ok: true });
});

// Backlog de Agencia (White-label, "el cliente pueda subir una imagen o
// foto de su negocio como icono, no solo una URL"): intentamos aprovisionar
// un bucket R2 real para esto (2026-09-05) pero la cuenta de Cloudflare
// todavía no tiene R2 habilitado ("Please enable R2 through the Cloudflare
// Dashboard", wrangler r2 bucket create falló) — sin bloquear a Oscar por
// eso, la imagen (ya redimensionada a máx 512px del lado del navegador,
// ver consoleHtml.ts) se guarda como data URI directo en
// tenant_settings.brand_logo_url, que ya acepta cualquier URL/valor válido
// para un <img src>. Si más adelante se habilita R2, esto puede migrar a
// subir bytes reales sin cambiar el contrato de brandLogoUrl (sigue siendo
// "lo que sea que un <img src> pueda mostrar").
const ALLOWED_LOGO_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_LOGO_BYTES = 800 * 1024; // el navegador ya redimensiona antes de mandarlo — este es solo un tope defensivo.

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000; // evita "Maximum call stack size exceeded" con apply/spread en buffers grandes.
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

clientApp.post("/branding/logo", async (c) => {
  const tenantId = c.get("tenantId");
  const contentType = (c.req.header("Content-Type") || "").split(";")[0].trim();
  if (!ALLOWED_LOGO_CONTENT_TYPES.has(contentType)) {
    return c.json({ error: "Formato no soportado — usa PNG, JPG, WEBP o GIF" }, 400);
  }
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) {
    return c.json({ error: "Archivo vacío" }, 400);
  }
  if (bytes.byteLength > MAX_LOGO_BYTES) {
    return c.json({ error: `La imagen es muy grande (máx ${Math.floor(MAX_LOGO_BYTES / 1024)}KB) — intenta con una más chica` }, 400);
  }
  const brandLogoUrl = `data:${contentType};base64,${arrayBufferToBase64(bytes)}`;
  const current = await getTenantSettings(c.env.DB, tenantId);
  await setBranding(c.env.DB, tenantId, { brandName: current.brandName, brandLogoUrl, brandColor: current.brandColor });
  return c.json({ ok: true, brandLogoUrl });
});

// Agencia (Fase 2, agendar con persona específica): lista de staff, la
// mantiene el propio negocio. Vacío = agenda sin distinguir por persona,
// mismo comportamiento de siempre.
clientApp.get("/staff-members", async (c) => {
  const settings = await getTenantSettings(c.env.DB, c.get("tenantId"));
  return c.json({ staffMembers: settings.staffMembers });
});

clientApp.put("/staff-members", async (c) => {
  const body = await c.req.json<{ staffMembers?: string[] }>();
  const staffMembers = Array.isArray(body.staffMembers) ? body.staffMembers.map((s) => s.trim()).filter(Boolean) : [];
  await setStaffMembers(c.env.DB, c.get("tenantId"), staffMembers);
  return c.json({ ok: true });
});

// Backlog de Agencia (padel, Fase 1: "Convocador Bot") — un club puede tener
// varias convocatorias a la vez (categorías/fechas distintas), cada una con
// su propia lista de inscritos/lista de espera. scheduledAt/
// registrationDeadline vienen en hora LOCAL del tenant (mismo criterio que
// el calendario) — se normalizan a UTC aquí, nunca en el navegador.
//
// Devuelve TODAS las convocatorias (no solo 'abierta') — Fase 2 (check-in)
// y Fase 3-4 (marcadores/playoffs) pasan DESPUÉS de cerrar inscripciones,
// así que /console las necesita seguir mostrando. matches/standings vienen
// vacíos hasta que se genera el fixture (ver POST .../fixture).
clientApp.get("/torneos", async (c) => {
  const tenantId = c.get("tenantId");
  const [tournaments, settings] = await Promise.all([listAllTournaments(c.env.DB, tenantId), getTenantSettings(c.env.DB, tenantId)]);
  const withDetail = await Promise.all(
    tournaments.map(async (t) => ({
      ...t,
      scheduledAtLocal: utcToLocalDateTimeString(t.scheduledAtUtc, settings.timezone),
      registrationDeadlineLocal: utcToLocalDateTimeString(t.registrationDeadlineUtc, settings.timezone),
      registrations: await listRegistrations(c.env.DB, t.id),
      matches: await listMatches(c.env.DB, t.id),
      standings: await getStandings(c.env.DB, t.id),
    })),
  );
  return c.json({ tournaments: withDetail });
});

clientApp.post("/torneos", async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json<{
    label?: string;
    category?: string;
    scheduledAt?: string;
    registrationDeadline?: string;
    capacity?: number;
    registrationMode?: string;
    rounds?: number;
    courtCount?: number;
  }>();
  if (!body.label?.trim() || !body.scheduledAt || !body.registrationDeadline) {
    return c.json({ error: "label, scheduledAt y registrationDeadline son requeridos" }, 400);
  }
  if (body.category && !isPadelCategory(body.category)) {
    return c.json({ error: `category debe ser una de: ${PADEL_CATEGORIES.join(", ")}` }, 400);
  }
  if (body.registrationMode && body.registrationMode !== "individual" && body.registrationMode !== "pareja") {
    return c.json({ error: "registrationMode debe ser 'individual' o 'pareja'" }, 400);
  }
  const capacity = Number.isInteger(body.capacity) && (body.capacity as number) > 0 ? (body.capacity as number) : 20;
  // Backlog de Agencia (ronda de reestructura): rondas/canchas ahora se
  // preguntan al abrir CADA convocatoria (Oscar: distintas categorías/días
  // pueden usar distinto número) — si no se mandan, quedan NULL y
  // generateFixture cae de vuelta a los defaults de /padel-settings.
  const rounds = Number.isInteger(body.rounds) && (body.rounds as number) > 0 ? (body.rounds as number) : null;
  const courtCount = Number.isInteger(body.courtCount) && (body.courtCount as number) > 0 ? (body.courtCount as number) : null;
  const settings = await getTenantSettings(c.env.DB, tenantId);
  const tournamentId = await createTournament(c.env.DB, tenantId, {
    label: body.label.trim(),
    category: body.category ?? null,
    scheduledAtUtc: normalizeToUtcISOString(body.scheduledAt, settings.timezone),
    registrationDeadlineUtc: normalizeToUtcISOString(body.registrationDeadline, settings.timezone),
    capacity,
    registrationMode: (body.registrationMode as "individual" | "pareja" | undefined) ?? "individual",
    rounds,
    courtCount,
  });
  return c.json({ ok: true, tournamentId }, 201);
});

// Backlog de Agencia (padel, ronda de categorías): cada una de las 6
// categorías reales (6ta..1ra) tiene su propio grupo de Telegram y
// normalmente un día fijo de la semana — configurable, no fijo en código
// (Oscar: "esto debe de ser configurable"). Siempre devuelve las 6, aunque
// falte configurar algunas.
clientApp.get("/padel-categorias", async (c) => {
  const configs = await listCategoryConfigs(c.env.DB, c.get("tenantId"));
  return c.json({ categories: configs });
});

clientApp.put("/padel-categorias/:category", async (c) => {
  const category = c.req.param("category");
  if (!isPadelCategory(category)) {
    return c.json({ error: `category debe ser una de: ${PADEL_CATEGORIES.join(", ")}` }, 400);
  }
  const body = await c.req.json<{ weekday?: number | null; chatId?: string | null }>();
  const weekday = typeof body.weekday === "number" && body.weekday >= 0 && body.weekday <= 6 ? body.weekday : null;
  await upsertCategoryConfig(c.env.DB, c.get("tenantId"), category, { weekday, chatId: body.chatId?.trim() || null });
  return c.json({ ok: true });
});

// Backlog de Agencia: "las reglas deben poder modificarse si es
// necesario" — panel real, no texto libre en la KB (confirmado con
// Oscar). courtCount es real: el fixture nunca programa más partidos
// simultáneos que canchas físicas tiene el club (ver src/padelMatches.ts).
// defaultRegistrationMode solo precarga el formulario de "Nueva
// convocatoria" — la modalidad real se elige (y puede cambiar) cada vez
// que se abre una convocatoria nueva.
clientApp.get("/padel-settings", async (c) => {
  const settings = await getPadelSettings(c.env.DB, c.get("tenantId"));
  return c.json(settings);
});

clientApp.put("/padel-settings", async (c) => {
  const body = await c.req.json<{ rounds?: number; courtCount?: number; defaultRegistrationMode?: string }>();
  if (!Number.isInteger(body.rounds) || (body.rounds as number) < 1) {
    return c.json({ error: "rounds debe ser un entero mayor a 0" }, 400);
  }
  if (!Number.isInteger(body.courtCount) || (body.courtCount as number) < 1) {
    return c.json({ error: "courtCount debe ser un entero mayor a 0" }, 400);
  }
  if (body.defaultRegistrationMode && body.defaultRegistrationMode !== "individual" && body.defaultRegistrationMode !== "pareja") {
    return c.json({ error: "defaultRegistrationMode debe ser 'individual' o 'pareja'" }, 400);
  }
  await upsertPadelSettings(c.env.DB, c.get("tenantId"), {
    rounds: body.rounds as number,
    courtCount: body.courtCount as number,
    defaultRegistrationMode: (body.defaultRegistrationMode as "individual" | "pareja" | undefined) ?? "individual",
  });
  return c.json({ ok: true });
});

clientApp.post("/torneos/:id/close", async (c) => {
  await closeTournament(c.env.DB, c.get("tenantId"), Number(c.req.param("id")));
  return c.json({ ok: true });
});

// Backlog de Agencia (padel): "Limpiar / Iniciar nuevo torneo" — Oscar
// confirmó (pregunta directa) que quiere borrar de verdad inscripciones y
// marcadores de ESA convocatoria para reusarla la semana siguiente, no
// conservar el historial. Destructivo real, así que exige confirmLabel
// EXACTO igual al label real de la convocatoria — mismo patrón de doble
// confirmación que "Zona de peligro" al borrar un tenant completo.
clientApp.post("/torneos/:id/reset", async (c) => {
  const tenantId = c.get("tenantId");
  const tournamentId = Number(c.req.param("id"));
  const body = await c.req.json<{ confirmLabel?: string; scheduledAt?: string; registrationDeadline?: string }>();

  const tournament = await getTournamentById(c.env.DB, tenantId, tournamentId);
  if (!tournament) return c.json({ error: "Convocatoria no encontrada" }, 404);
  if (body.confirmLabel !== tournament.label) {
    return c.json({ error: "El nombre no coincide — escribe el nombre exacto de la convocatoria para confirmar." }, 400);
  }

  // Backlog de Agencia: fechas OPCIONALES — Oscar confirmó que escribir el
  // nombre exacto ya es suficiente confirmación; si no se mandan fechas
  // nuevas, resetTournament reabre con las mismas que ya tenía.
  const settings = await getTenantSettings(c.env.DB, tenantId);
  await resetTournament(c.env.DB, tenantId, tournamentId, {
    scheduledAtUtc: body.scheduledAt ? normalizeToUtcISOString(body.scheduledAt, settings.timezone) : null,
    registrationDeadlineUtc: body.registrationDeadline ? normalizeToUtcISOString(body.registrationDeadline, settings.timezone) : null,
  });
  return c.json({ ok: true });
});

// Cancelación manual por el club (a diferencia de la que dispara el propio
// jugador desde la tool) — misma lógica de promoción de lista de espera;
// si el promovido existe, se intenta avisarle por DM y, si falla, en el
// grupo (mismo patrón que la tool, ver src/padelTool.ts).
clientApp.delete("/torneos/registrations/:id", async (c) => {
  const tenantId = c.get("tenantId");
  const result = await cancelRegistrationById(c.env.DB, tenantId, Number(c.req.param("id")));
  if (!result) return c.json({ error: "No se encontró esa inscripción" }, 404);

  if (result.promoted) {
    const provider = getChannelProvider(result.promoted.channel);
    const externalId = provider ? await getChannelExternalId(c.env.DB, tenantId, result.promoted.channel) : null;
    if (provider && externalId) {
      await notifyPromotedPlayer(c.env.DB, tenantId, provider, externalId, result.promoted);
    }
  }

  return c.json({ ok: true, promoted: result.promoted ? { playerName: result.promoted.playerName } : null });
});

// Backlog de Agencia (padel, Fase 2: "Reception Bot" — check-in en el
// club). Actualización parcial: mandar solo `paid` no toca `attended`, y
// viceversa — el staff puede marcarlos en momentos distintos según cómo
// vaya llegando la gente.
clientApp.put("/torneos/registrations/:id/checkin", async (c) => {
  const body = await c.req.json<{ paid?: boolean; attended?: boolean | null; confirmed?: boolean | null }>();
  await setRegistrationCheckin(c.env.DB, c.get("tenantId"), Number(c.req.param("id")), body);
  return c.json({ ok: true });
});

// Backlog de Agencia (padel, Fase 2): jugador "espontáneo" que llega al
// club sin haberse inscrito antes por el grupo de Telegram — el staff lo
// agrega directo, respeta el mismo cupo/lista de espera que un registro
// normal (ver addWalkInPlayer). En torneos 'pareja' pide los 2 nombres a
// la vez (addWalkInPair) — una pareja también puede llegar espontánea.
clientApp.post("/torneos/:id/registrations", async (c) => {
  const tenantId = c.get("tenantId");
  const tournamentId = Number(c.req.param("id"));
  const body = await c.req.json<{ playerName?: string; player2Name?: string; phone?: string }>();
  if (!body.playerName?.trim()) {
    return c.json({ error: "playerName es requerido" }, 400);
  }
  const tournament = await getTournamentById(c.env.DB, tenantId, tournamentId);
  if (!tournament) return c.json({ error: "Convocatoria no encontrada" }, 404);

  if (tournament.registrationMode === "pareja") {
    if (!body.player2Name?.trim()) {
      return c.json({ error: "player2Name es requerido en un torneo de parejas" }, 400);
    }
    const result = await addWalkInPair(c.env.DB, tournament, tenantId, {
      player1Name: body.playerName.trim(),
      player2Name: body.player2Name.trim(),
      phone: body.phone?.trim() || null,
    });
    return c.json({ ok: true, ...result }, 201);
  }

  const result = await addWalkInPlayer(c.env.DB, tournament, tenantId, {
    playerName: body.playerName.trim(),
    phone: body.phone?.trim() || null,
  });
  return c.json({ ok: true, ...result }, 201);
});

// Backlog de Agencia (padel, Fase 3-4: "Score Engine"). Genera las 5 rondas
// (rotación de parejas + descansos) a partir de quien esté inscrito y ya
// confirmado presente (Fase 2) — rechaza con un error claro si el conteo no
// es múltiplo de 20 (ver src/padelMatches.ts, simplificación deliberada).
clientApp.post("/torneos/:id/fixture", async (c) => {
  const tenantId = c.get("tenantId");
  const tournament = await getTournamentById(c.env.DB, tenantId, Number(c.req.param("id")));
  if (!tournament) return c.json({ error: "Convocatoria no encontrada" }, 404);
  try {
    const matches = await generateFixture(c.env.DB, tournament, tenantId);
    return c.json({ ok: true, matches });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

// Marcador de un match — sirve para 'ronda', 'semifinal' y 'final' por
// igual (mismo shape). Si el match es la final, revisa de una vez si el
// torneo queda 'finalizado' (ganador real, sin empate).
clientApp.put("/torneos/matches/:id/score", async (c) => {
  const tenantId = c.get("tenantId");
  const matchId = Number(c.req.param("id"));
  const body = await c.req.json<{ scoreA?: number; scoreB?: number }>();
  if (!Number.isFinite(body.scoreA) || !Number.isFinite(body.scoreB)) {
    return c.json({ error: "scoreA y scoreB son requeridos y deben ser números" }, 400);
  }
  const match = await getMatchById(c.env.DB, tenantId, matchId);
  if (!match) return c.json({ error: "Match no encontrado" }, 404);

  await recordMatchScore(c.env.DB, tenantId, matchId, { scoreA: body.scoreA as number, scoreB: body.scoreB as number });

  let champion = null;
  if (match.phase === "final") {
    const tournament = await getTournamentById(c.env.DB, tenantId, match.tournamentId);
    if (tournament) champion = await finalizeIfChampionDecided(c.env.DB, tournament, tenantId);
  }
  return c.json({ ok: true, champion });
});

// Backlog de Agencia (padel, Fase 3-4): forma las 4 parejas de semifinal
// (top 8 de la tabla de posiciones) — rechaza con un error claro si faltan
// marcadores de ronda (ver generatePlayoffs).
clientApp.post("/torneos/:id/playoffs", async (c) => {
  const tenantId = c.get("tenantId");
  const tournament = await getTournamentById(c.env.DB, tenantId, Number(c.req.param("id")));
  if (!tournament) return c.json({ error: "Convocatoria no encontrada" }, 404);
  try {
    const semis = await generatePlayoffs(c.env.DB, tournament, tenantId);
    return c.json({ ok: true, matches: semis });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

// Genera el partido de la final una vez que ambas semifinales ya tienen
// marcador — rechaza con un error claro si falta alguno o hay un empate
// (ver generateFinal, sin regla de desempate definida todavía).
clientApp.post("/torneos/:id/final", async (c) => {
  const tenantId = c.get("tenantId");
  const tournament = await getTournamentById(c.env.DB, tenantId, Number(c.req.param("id")));
  if (!tournament) return c.json({ error: "Convocatoria no encontrada" }, 404);
  try {
    const final = await generateFinal(c.env.DB, tournament, tenantId);
    return c.json({ ok: true, match: final });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});
