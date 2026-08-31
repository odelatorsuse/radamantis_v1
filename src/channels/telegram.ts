import { sendTelegramMessage, sendTelegramPhoto } from "../telegram";
import type { ChannelProvider, WebhookRegistrationResult } from "./provider";

// Etapa 9 (D8): registrar el webhook de Telegram es parte de la transacción
// de alta/edición de canal — sin esto, "alta en <5 min sin tocar código"
// seguía requiriendo un curl manual a la API de Telegram. Movido aquí desde
// admin/telegramSetup.ts en Etapa 10 al generalizar a ChannelProvider — es
// lógica de la plataforma Telegram, no del panel de admin.
interface TelegramSetWebhookResponse {
  ok?: boolean;
  description?: string;
  parameters?: { retry_after?: number };
}

const MAX_ATTEMPTS = 3;

export async function registerTelegramWebhook(
  workerOrigin: string,
  botToken: string,
  webhookSecret: string,
  attempt = 1,
): Promise<WebhookRegistrationResult> {
  const url = `${workerOrigin}/webhook/telegram/${botToken}`;
  const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, secret_token: webhookSecret }),
  });
  const data = (await res.json().catch(() => null)) as TelegramSetWebhookResponse | null;

  // Telegram rate-limita setWebhook (429) — reintenta respetando retry_after
  // en vez de fallarle la operación al operador por algo transitorio.
  if (res.status === 429 && attempt < MAX_ATTEMPTS) {
    const retryAfterSeconds = data?.parameters?.retry_after ?? 1;
    await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1000));
    return registerTelegramWebhook(workerOrigin, botToken, webhookSecret, attempt + 1);
  }

  if (!res.ok || !data) {
    return { ok: false, error: `Telegram respondió ${res.status}${data?.description ? `: ${data.description}` : ""}` };
  }
  return data.ok ? { ok: true } : { ok: false, error: data.description ?? "setWebhook falló" };
}

export const telegramChannelProvider: ChannelProvider = {
  channel: "telegram",
  displayName: "Telegram",
  async sendMessage(externalId, chatId, text) {
    await sendTelegramMessage(externalId, Number(chatId), text);
  },
  async sendPhoto(externalId, chatId, photoUrl, caption) {
    await sendTelegramPhoto(externalId, Number(chatId), photoUrl, caption);
  },
  registerWebhook: registerTelegramWebhook,
};
