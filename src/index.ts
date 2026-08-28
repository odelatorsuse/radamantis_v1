import { Hono } from "hono";
import { extractIncomingMessage, sendTelegramMessage } from "./telegram";
import { resolveTenantId } from "./tenants";

interface Env {
  DB: D1Database;
  AGENT: DurableObjectNamespace;
  TELEGRAM_WEBHOOK_SECRET: string;
  OPENAI_API_KEY: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ status: "ok", stage: "etapa-6" }));

// D2: el bot_token en la URL identifica el canal (patrón recomendado por
// Telegram) y a la vez resuelve el tenant vía channel_bindings, sin
// hardcodear ningún tenant en el core.
app.post("/webhook/telegram/:botToken", async (c) => {
  const secretHeader = c.req.header("X-Telegram-Bot-Api-Secret-Token");
  if (secretHeader !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.text("Unauthorized", 401);
  }

  const botToken = c.req.param("botToken");
  const tenantId = await resolveTenantId(c.env.DB, "telegram", botToken);
  if (!tenantId) {
    return c.text("Unknown channel", 404);
  }

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
    body: JSON.stringify({ tenantId, channel: "telegram", chatId, userText: incoming.text }),
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
