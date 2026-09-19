export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    // Backlog de Agencia (padel, Fase 1): "type" distingue un chat 1:1
    // ("private") de un GRUPO compartido ("group"/"supergroup") — lo
    // necesitamos para saber cuándo etiquetar los mensajes con quién los
    // escribió (index.ts). "from" es el remitente individual real, distinto
    // del chat en un grupo (todos comparten el mismo chat.id).
    chat: { id: number; type?: string };
    from?: { id: number; first_name?: string; username?: string };
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
  chatType: string;
  senderId: number;
  senderName: string;
  text?: string;
  voice?: { fileId: string; mimeType: string };
  photo?: { fileId: string };
}

export function extractIncomingMessage(update: TelegramUpdate): IncomingMessage | null {
  const message = update.message;
  if (!message) return null;
  const base = {
    chatId: message.chat.id,
    chatType: message.chat.type ?? "private",
    // Sin "from" (raro, pero Telegram no lo garantiza en todos los tipos de
    // update) se asume que el remitente es el propio chat — mismo
    // comportamiento de siempre para una conversación 1:1.
    senderId: message.from?.id ?? message.chat.id,
    senderName: message.from?.first_name || message.from?.username || "Alguien",
  };
  if (message.text) return { ...base, text: message.text };
  if (message.voice) {
    return { ...base, voice: { fileId: message.voice.file_id, mimeType: message.voice.mime_type ?? "audio/ogg" } };
  }
  if (message.photo && message.photo.length > 0) {
    // Telegram manda el mismo archivo en varias resoluciones — la última es
    // siempre la de mayor calidad disponible.
    const largest = message.photo[message.photo.length - 1];
    return { ...base, photo: { fileId: largest.file_id } };
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

// Agencia (Fase 2b: catálogo con fotos) — Telegram acepta una URL
// directamente en "photo" (él mismo la descarga), no hace falta subir
// bytes desde nuestro Worker.
export async function sendTelegramPhoto(botToken: string, chatId: number, photoUrl: string, caption?: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption }),
  });
  if (!res.ok) {
    throw new Error(`Telegram sendPhoto falló: ${res.status} ${await res.text()}`);
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
