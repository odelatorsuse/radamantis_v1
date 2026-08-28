import { Hono } from "hono";
import { extractIncomingMessage, sendTelegramMessage } from "./telegram";

interface Env {
  DB: D1Database;
  AGENT: DurableObjectNamespace;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  OPENAI_API_KEY: string;
}

// Etapa 3: un solo tenant sandbox hardcodeado. La resolución real de
// tenant/canal (D2, channel_bindings) llega en Etapa 4.
const SANDBOX_TENANT_ID = "sandbox";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ status: "ok", stage: "etapa-3" }));

app.post("/webhook/telegram", async (c) => {
  const secretHeader = c.req.header("X-Telegram-Bot-Api-Secret-Token");
  if (secretHeader !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.text("Unauthorized", 401);
  }

  const update = await c.req.json();
  const incoming = extractIncomingMessage(update);
  if (!incoming) {
    // Telegram reintenta si no responde 200, aunque el update no traiga texto.
    return c.text("ok");
  }

  const chatId = String(incoming.chatId);
  const conversationKey = `${SANDBOX_TENANT_ID}:telegram:${chatId}`;
  const stub = c.env.AGENT.get(c.env.AGENT.idFromName(conversationKey));

  const agentRes = await stub.fetch("https://agent/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenantId: SANDBOX_TENANT_ID,
      channel: "telegram",
      chatId,
      userText: incoming.text,
    }),
  });
  const { replyText } = await agentRes.json<{ replyText: string }>();

  await sendTelegramMessage(c.env.TELEGRAM_BOT_TOKEN, incoming.chatId, replyText);

  return c.text("ok");
});

export { ConversationAgent } from "./agent";
export default app;
