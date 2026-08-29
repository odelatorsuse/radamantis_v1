import { Hono } from "hono";
import { adminApp } from "./admin/routes";
import { DASHBOARD_HTML } from "./admin/dashboardHtml";
import { exchangeCodeForTokens } from "./calendar/oauth";
import { saveCalendarConnection } from "./calendar/repository";
import { extractIncomingMessage, sendTelegramMessage } from "./telegram";
import { resolveTenant } from "./tenants";

interface Env {
  DB: D1Database;
  AGENT: DurableObjectNamespace;
  VECTORIZE: VectorizeIndex;
  TELEGRAM_WEBHOOK_SECRET: string;
  OPENAI_API_KEY: string;
  ADMIN_API_KEY: string;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ status: "ok", stage: "etapa-10" }));

// Etapa 8 (D9): toda gestión de tenants/verticales vive primero como API;
// el dashboard (y el futuro Skill) son clientes de esta misma API, nunca
// lógica duplicada.
app.route("/api/admin", adminApp);
app.get("/admin", (c) => c.html(DASHBOARD_HTML));

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
export default app;
