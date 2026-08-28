import { Hono } from "hono";
import { extractIncomingMessage, sendTelegramMessage } from "./telegram";

interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ status: "ok", stage: "etapa-1" }));

// Etapa 1: un solo bot sandbox, sin resolución de tenant todavía (llega en Etapa 4).
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

  await sendTelegramMessage(c.env.TELEGRAM_BOT_TOKEN, incoming.chatId, incoming.text);
  return c.text("ok");
});

export default app;
