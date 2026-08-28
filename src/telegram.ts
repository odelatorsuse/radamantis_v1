export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
  };
}

export interface IncomingMessage {
  chatId: number;
  text: string;
}

export function extractIncomingMessage(update: TelegramUpdate): IncomingMessage | null {
  const message = update.message;
  if (!message?.text) return null;
  return { chatId: message.chat.id, text: message.text };
}

export async function sendTelegramMessage(botToken: string, chatId: number, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    throw new Error(`Telegram sendMessage falló: ${res.status} ${await res.text()}`);
  }
}
