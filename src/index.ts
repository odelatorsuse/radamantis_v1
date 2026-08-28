import { Hono } from "hono";
import { OpenAIProvider } from "./llm/openai";
import { buildMessages } from "./llm/provider";
import { SANDBOX_SYSTEM_PROMPT } from "./prompts";
import { extractIncomingMessage, sendTelegramMessage } from "./telegram";
import { logUsage } from "./usage";

interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  OPENAI_API_KEY: string;
}

// Etapa 2: un solo tenant sandbox hardcodeado. La resolución real de
// tenant/canal (D2) llega en Etapa 4.
const SANDBOX_TENANT_ID = "sandbox";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ status: "ok", stage: "etapa-2" }));

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

  const llm = new OpenAIProvider(c.env.OPENAI_API_KEY);
  const messages = buildMessages(SANDBOX_SYSTEM_PROMPT, incoming.text);
  const completion = await llm.complete(messages);

  await sendTelegramMessage(c.env.TELEGRAM_BOT_TOKEN, incoming.chatId, completion.text);

  await logUsage(c.env.DB, {
    tenantId: SANDBOX_TENANT_ID,
    channel: "telegram",
    model: llm.model,
    usage: completion.usage,
  });

  return c.text("ok");
});

export default app;
