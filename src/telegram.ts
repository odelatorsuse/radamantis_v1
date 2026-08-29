export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
    // Etapa 10 (superpower "Oído y vista"): Telegram manda el audio/imagen
    // como un file_id — hay que pedirle a su API la URL real de descarga
    // (getTelegramFileUrl) antes de poder leerlo.
    voice?: { file_id: string; mime_type?: string };
    photo?: { file_id: string; file_size?: number }[];
  };
}

export interface IncomingMessage {
  chatId: number;
  text?: string;
  voice?: { fileId: string; mimeType: string };
  photo?: { fileId: string };
}

export function extractIncomingMessage(update: TelegramUpdate): IncomingMessage | null {
  const message = update.message;
  if (!message) return null;
  if (message.text) return { chatId: message.chat.id, text: message.text };
  if (message.voice) {
    return { chatId: message.chat.id, voice: { fileId: message.voice.file_id, mimeType: message.voice.mime_type ?? "audio/ogg" } };
  }
  if (message.photo && message.photo.length > 0) {
    // Telegram manda el mismo archivo en varias resoluciones — la última es
    // siempre la de mayor calidad disponible.
    const largest = message.photo[message.photo.length - 1];
    return { chatId: message.chat.id, photo: { fileId: largest.file_id } };
  }
  return null;
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

interface TelegramGetFileResponse {
  ok: boolean;
  result?: { file_path: string };
  description?: string;
}

// Etapa 10 (superpower "Oído y vista"): un file_id no es una URL — hay que
// resolverlo primero contra getFile, y la descarga real requiere el bot
// token otra vez en la URL (patrón estándar de la API de archivos de Telegram).
export async function downloadTelegramFile(botToken: string, fileId: string): Promise<ArrayBuffer> {
  const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
  const fileData = (await fileRes.json()) as TelegramGetFileResponse;
  if (!fileRes.ok || !fileData.ok || !fileData.result) {
    throw new Error(`Telegram getFile falló: ${fileRes.status} ${fileData.description ?? ""}`);
  }

  const downloadRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`);
  if (!downloadRes.ok) {
    throw new Error(`Telegram file download falló: ${downloadRes.status}`);
  }
  return downloadRes.arrayBuffer();
}
