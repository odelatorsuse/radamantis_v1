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
import { describeImage, transcribeVoice } from "./media";
import { runNoShowSweep } from "./noShowSweep";
import { downloadTelegramFile, extractIncomingMessage, sendTelegramMessage } from "./telegram";
import { getTenantSettings, resolveTenant } from "./tenants";
import { WIDGET_JS, widgetApp } from "./widget";

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

// Agencia ("velocidad de respuesta"): valor fijo por ahora, no configurable
// por tenant todavía — si se necesita distinto por tenant, es un solo
// cambio (leer de tenantSettings en vez de esta constante), sin tocar
// nada del mecanismo de buffer en sí (src/agent.ts).
const TELEGRAM_BUFFER_SECONDS = 12;

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

// Agencia (widget de sitio web, v1): público a propósito — lo llama la
// página del NEGOCIO, nunca nuestro panel. La protección real está en
// src/widget.ts (chequeo de Origin contra el dominio configurado al
// vincular el canal), no en estas rutas.
app.route("/api/widget", widgetApp);
app.get("/widget.js", (c) => c.body(WIDGET_JS, 200, { "Content-Type": "application/javascript; charset=utf-8" }));

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

  // Etapa 10 (superpower "Oído y vista"): voz e imágenes se convierten a
  // texto ANTES de todo lo demás (incluida la detección del código de
  // activación) — así el resto del flujo nunca necesita saber que el
  // mensaje original no era texto plano.
  let userText: string;
  if (incoming.text) {
    userText = incoming.text;
  } else if (incoming.voice) {
    try {
      const audio = await downloadTelegramFile(botToken, incoming.voice.fileId);
      userText = await transcribeVoice(c.env.OPENAI_API_KEY, audio, incoming.voice.mimeType);
    } catch {
      await sendTelegramMessage(botToken, incoming.chatId, "No pude escuchar tu nota de voz, ¿me la puedes escribir?");
      return c.text("ok");
    }
  } else if (incoming.photo) {
    try {
      const image = await downloadTelegramFile(botToken, incoming.photo.fileId);
      const description = await describeImage(c.env.OPENAI_API_KEY, image, "image/jpeg");
      // Sin este encabezado, el modelo ve la descripción como si el cliente
      // la hubiera escrito literalmente — en el siguiente turno se confunde
      // y cree que le están "describiendo una imagen" en vez de que envió una foto.
      userText = `[El cliente envió una imagen] ${description}`;
    } catch {
      await sendTelegramMessage(botToken, incoming.chatId, "No pude ver tu imagen, ¿me puedes contar qué es?");
      return c.text("ok");
    }
  } else {
    return c.text("ok");
  }

  // Etapa 10 (superpower "Vigilante"): el código de activación de alertas
  // se detecta ANTES de entrar al agente normal — es un mensaje de
  // configuración, no una conversación con el bot. Solo funciona si
  // coincide EXACTO con el código de ESE tenant (generado desde /console),
  // así que un cliente cualquiera escribiendo texto al azar nunca lo activa.
  const settings = await getTenantSettings(c.env.DB, tenantId);
  if (settings.alertActivationCode && userText.trim() === settings.alertActivationCode) {
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
    // Agencia ("velocidad de respuesta"): Telegram sí puede recibir la
    // respuesta después por su cuenta (push, sendTelegramMessage), así que
    // agrupa mensajes seguidos del mismo cliente en vez de contestar cada
    // uno por separado — a diferencia del widget de sitio web, que necesita
    // la respuesta en la misma petición y nunca manda este campo.
    body: JSON.stringify({ tenantId, channel: "telegram", chatId, userText, verticalId, bufferSeconds: TELEGRAM_BUFFER_SECONDS }),
  });
  const { replyText } = await agentRes.json<{ replyText: string | null }>();

  // Etapa 6: replyText es null mientras la conversación está en handoff, o
  // mientras el mensaje quedó encolado esperando el resto del lote — en
  // ambos casos el bot se calla a propósito.
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
