import { Hono } from "hono";
import { adminApp } from "./admin/routes";
import { DASHBOARD_HTML } from "./admin/dashboardHtml";
import { extractIncomingMessage, sendTelegramMessage } from "./telegram";
import { resolveTenant } from "./tenants";

interface Env {
  DB: D1Database;
  AGENT: DurableObjectNamespace;
  TELEGRAM_WEBHOOK_SECRET: string;
  OPENAI_API_KEY: string;
  ADMIN_API_KEY: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ status: "ok", stage: "etapa-8" }));

// Etapa 8 (D9): toda gestión de tenants/verticales vive primero como API;
// el dashboard (y el futuro Skill) son clientes de esta misma API, nunca
// lógica duplicada.
app.route("/api/admin", adminApp);
app.get("/admin", (c) => c.html(DASHBOARD_HTML));

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
