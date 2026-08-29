import { Hono } from "hono";
import { adminApp } from "./admin/routes";
import { DASHBOARD_HTML } from "./admin/dashboardHtml";
import { exchangeCodeForTokens } from "./calendar/oauth";
import { saveCalendarConnection } from "./calendar/repository";
import { CONSOLE_HTML } from "./client/consoleHtml";
import { setAlertChatId } from "./client/repository";
import { clientApp } from "./client/routes";
import { runColdLeadSweep } from "./coldLeads";
import { runDailyReportSweep } from "./dailyReport";
import { runNoShowSweep } from "./noShowSweep";
import { extractIncomingMessage, sendTelegramMessage } from "./telegram";
import { getTenantSettings, resolveTenant } from "./tenants";

interface Env {
  DB: D1Database;
  AGENT: DurableObjectNamespace;
  VECTORIZE: VectorizeIndex;
  TELEGRAM_WEBHOOK_SECRET: string;
  OPENAI_API_KEY: string;
  ADMIN_API_KEY: string;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  CLIENT_SESSION_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ status: "ok", stage: "etapa-10" }));

// Etapa 8 (D9): toda gestión de tenants/verticales vive primero como API;
// el dashboard (y el futuro Skill) son clientes de esta misma API, nunca
// lógica duplicada.
app.route("/api/admin", adminApp);
app.get("/admin", (c) => c.html(DASHBOARD_HTML));

// Etapa 10 (consola del cliente, D10): superficie separada del panel de
// super-admin — auth propia por tenant (usuario/contraseña), nunca el
// ADMIN_API_KEY compartido.
app.route("/api/client", clientApp);
app.get("/console", (c) => c.html(CONSOLE_HTML));

// Etapa 10 (Fase A): callback público de OAuth de Google — Google redirige
// el navegador aquí directo (sin nuestro Bearer token), con ?state=tenantId.
app.get("/oauth/google/callback", async (c) => {
  const code = c.req.query("code");
  const tenantId = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    return c.html(`<p>Autorización cancelada o rechazada: ${error}. Puedes cerrar esta pestaña.</p>`);
  }
  if (!code || !tenantId) {
    return c.text("Faltan parámetros code/state en el callback de Google", 400);
  }

  const origin = new URL(c.req.url).origin;
  const redirectUri = `${origin}/oauth/google/callback`;
  try {
    const tokens = await exchangeCodeForTokens(
      c.env.GOOGLE_OAUTH_CLIENT_ID,
      c.env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirectUri,
      code,
    );
    await saveCalendarConnection(c.env.DB, {
      tenantId,
      provider: "google",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      calendarId: "primary",
    });
    return c.html("<p>Calendario conectado correctamente. Puedes cerrar esta pestaña y volver al panel.</p>");
  } catch (err) {
    return c.html(`<p>Error al conectar el calendario: ${(err as Error).message}</p>`, 500);
  }
});

// D2: el bot_token en la URL identifica el canal (patrón recomendado por
// Telegram) y a la vez resuelve tenant + vertical vía channel_bindings/tenants,
// sin hardcodear ningún tenant ni vertical en el core.
app.post("/webhook/telegram/:botToken", async (c) => {
  const secretHeader = c.req.header("X-Telegram-Bot-Api-Secret-Token");
  if (secretHeader !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.text("Unauthorized", 401);
  }

  const botToken = c.req.param("botToken");
  const resolved = await resolveTenant(c.env.DB, "telegram", botToken);
  if (!resolved) {
    return c.text("Unknown channel", 404);
  }
  const { tenantId, verticalId } = resolved;

  const update = await c.req.json();
  const incoming = extractIncomingMessage(update);
  if (!incoming) {
    // Telegram reintenta si no responde 200, aunque el update no traiga texto.
    return c.text("ok");
  }

  // Etapa 10 (superpower "Vigilante"): el código de activación de alertas
  // se detecta ANTES de entrar al agente normal — es un mensaje de
  // configuración, no una conversación con el bot. Solo funciona si
  // coincide EXACTO con el código de ESE tenant (generado desde /console),
  // así que un cliente cualquiera escribiendo texto al azar nunca lo activa.
  const settings = await getTenantSettings(c.env.DB, tenantId);
  if (settings.alertActivationCode && incoming.text.trim() === settings.alertActivationCode) {
    await setAlertChatId(c.env.DB, tenantId, String(incoming.chatId));
    await sendTelegramMessage(botToken, incoming.chatId, "Listo — a partir de ahora te voy a avisar por aquí cuando un cliente necesite atención.");
    return c.text("ok");
  }

  const chatId = String(incoming.chatId);
  const conversationKey = `${tenantId}:telegram:${chatId}`;
  const stub = c.env.AGENT.get(c.env.AGENT.idFromName(conversationKey));

  const agentRes = await stub.fetch("https://agent/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, channel: "telegram", chatId, userText: incoming.text, verticalId }),
  });
  const { replyText } = await agentRes.json<{ replyText: string | null }>();

  // Etapa 6: replyText es null mientras la conversación está en handoff —
  // el bot se calla a propósito, un humano se hace cargo.
  if (replyText) {
    await sendTelegramMessage(botToken, incoming.chatId, replyText);
  }

  return c.text("ok");
});

export { ConversationAgent } from "./agent";

export default {
  fetch: app.fetch,
  // Etapa 10 (superpowers "Recupera no-shows", "Reporte diario" y
  // "Reenganche de leads fríos"): mismo Cron Trigger (wrangler.toml) corre
  // los tres barridos — cada uno hace su propio chequeo de "¿me toca hacer
  // algo ahora?" y es barato si no.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runNoShowSweep(env.DB));
    ctx.waitUntil(runDailyReportSweep(env.DB));
    ctx.waitUntil(runColdLeadSweep(env.DB));
  },
};
