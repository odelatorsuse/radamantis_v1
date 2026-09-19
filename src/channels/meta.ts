import type { WebhookRegistrationResult } from "./provider";

// Agencia (conectores Facebook Messenger + Instagram): Facebook Messenger e
// Instagram (modo clásico, vinculado a la misma Página) comparten TODA esta
// infraestructura de Meta — mismo Send API, misma forma de suscribir la
// Página, misma verificación de firma de webhook. Solo cambia el tipo de
// objeto del payload del webhook ("page" vs "instagram"), manejado en
// facebook.ts/instagram.ts e index.ts, no aquí.

const GRAPH_API_VERSION = "v21.0";

export async function sendMetaMessage(pageAccessToken: string, recipientId: string, text: string): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  });
  if (!res.ok) {
    throw new Error(`Meta Send API falló: ${res.status} ${await res.text()}`);
  }
}

// Agencia (Fase 2b: catálogo con fotos) — mismo Send API, un adjunto tipo
// "image" con una URL en vez de subir bytes (is_reusable evita que Meta
// vuelva a descargar la misma imagen si se manda varias veces).
export async function sendMetaPhoto(pageAccessToken: string, recipientId: string, photoUrl: string): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { attachment: { type: "image", payload: { url: photoUrl, is_reusable: true } } },
    }),
  });
  if (!res.ok) {
    throw new Error(`Meta Send API (foto) falló: ${res.status} ${await res.text()}`);
  }
}

// Suscribe la Página al App de Meta para que sus eventos lleguen al webhook
// compartido — equivalente al setWebhook de Telegram, pero por Página en
// vez de por bot. subscribed_fields "messages" cubre tanto Messenger como
// Instagram en el modo clásico (Instagram vinculado a la Página).
export async function subscribePageToApp(pageAccessToken: string): Promise<WebhookRegistrationResult> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/me/subscribed_apps?subscribed_fields=messages&access_token=${encodeURIComponent(pageAccessToken)}`;
  const res = await fetch(url, { method: "POST" });
  const data = (await res.json().catch(() => null)) as { success?: boolean; error?: { message?: string } } | null;
  if (!res.ok || !data?.success) {
    return { ok: false, error: data?.error?.message ?? `Meta respondió ${res.status}` };
  }
  return { ok: true };
}

// HMAC-SHA256 del body crudo con el App Secret — Meta firma cada POST con
// X-Hub-Signature-256 (prefijo "sha256="). Usa Web Crypto (mismo patrón que
// src/passwords.ts), sin dependencias externas.
export async function verifyMetaSignature(appSecret: string, rawBody: string, signatureHeader: string | undefined | null): Promise<boolean> {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expectedHex = signatureHeader.slice("sha256=".length);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const actualHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return actualHex === expectedHex;
}

// Backlog de Agencia (WhatsApp, "tan fácil como Telegram"): investigado
// contra la documentación real de Meta antes de construir (no adivinado) —
// el envío/recepción de WhatsApp Cloud API comparte la MISMA infraestructura
// de firma de webhook (HMAC-SHA256, X-Hub-Signature-256) y el mismo App de
// Meta que Messenger/Instagram, pero: (1) el Send API es un endpoint
// distinto (`/{phone_number_id}/messages`, no `/me/messages`), y (2) la
// autenticación es un token de "System User" del NEGOCIO de Oscar (no un
// token por-Página emitido vía OAuth por cliente) — un cliente le da acceso
// de Partner a Oscar sobre SU WhatsApp Business Account (WABA), y ese
// System User token sirve para mandar mensajes a nombre de CUALQUIER número
// que le haya dado acceso, sin importar de qué cliente sea.
export async function sendWhatsAppMessage(phoneNumberId: string, accessToken: string, toPhone: string, text: string): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: toPhone, type: "text", text: { body: text } }),
  });
  if (!res.ok) {
    throw new Error(`WhatsApp Send API falló: ${res.status} ${await res.text()}`);
  }
}

export async function sendWhatsAppPhoto(phoneNumberId: string, accessToken: string, toPhone: string, photoUrl: string, caption?: string): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toPhone,
      type: "image",
      image: { link: photoUrl, ...(caption ? { caption } : {}) },
    }),
  });
  if (!res.ok) {
    throw new Error(`WhatsApp Send API (foto) falló: ${res.status} ${await res.text()}`);
  }
}

// Equivalente de subscribePageToApp, pero a nivel WABA (no Página) — suscribe
// el WhatsApp Business Account del cliente al App de Meta de Oscar para que
// sus mensajes entrantes lleguen al webhook compartido. Se llama con el
// mismo System User token, en el momento de vincular el canal (Alta de
// canal en /admin) — no requiere que el cliente haga nada más en Meta
// aparte de haber agregado a Oscar como Partner de su WABA.
export async function subscribeWabaToApp(wabaId: string, accessToken: string): Promise<WebhookRegistrationResult> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/subscribed_apps`;
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
  const data = (await res.json().catch(() => null)) as { success?: boolean; error?: { message?: string } } | null;
  if (!res.ok || !data?.success) {
    return { ok: false, error: data?.error?.message ?? `Meta respondió ${res.status}` };
  }
  return { ok: true };
}

export interface MetaIncomingMessage {
  pageId: string;
  senderId: string;
  text: string;
}

export interface WhatsAppIncomingMessage {
  phoneNumberId: string;
  senderId: string;
  text: string;
}

// Forma del payload de WhatsApp Cloud API — completamente distinta a la de
// Messenger/Instagram (entry[].changes[].value.messages[], no
// entry[].messaging[]). value.statuses[] (confirmaciones de entrega/lectura)
// se ignora a propósito, solo entra lo que trae value.messages. Solo texto
// por ahora, mismo criterio que Facebook/Instagram — voz/imagen entrante
// queda para cuando Oscar lo pida para estos canales.
export function parseWhatsAppWebhookMessages(body: unknown): WhatsAppIncomingMessage[] {
  const parsed = body as {
    object?: string;
    entry?: {
      changes?: {
        value?: {
          metadata?: { phone_number_id?: string };
          messages?: { from?: string; type?: string; text?: { body?: string } }[];
        };
      }[];
    }[];
  };
  if (parsed.object !== "whatsapp_business_account") return [];

  const messages: WhatsAppIncomingMessage[] = [];
  for (const entry of parsed.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;
      for (const msg of change.value?.messages ?? []) {
        if (msg.type === "text" && msg.from && msg.text?.body) {
          messages.push({ phoneNumberId, senderId: msg.from, text: msg.text.body });
        }
      }
    }
  }
  return messages;
}

// Solo mensajes de texto por ahora — igual que el resto del pipeline, un
// mensaje sin texto (imagen/sticker/etc.) simplemente se ignora en vez de
// fallar; Telegram sí soporta voz/imagen porque ya tenía ese requisito de
// negocio (Etapa 10, "Oído y vista") — extenderlo aquí es un cambio futuro
// si Oscar lo pide para estos canales.
export function parseMetaWebhookMessages(body: unknown, expectedObject: "page" | "instagram"): MetaIncomingMessage[] {
  const parsed = body as { object?: string; entry?: { id?: string; messaging?: { sender?: { id?: string }; message?: { text?: string; is_echo?: boolean } }[] }[] };
  if (parsed.object !== expectedObject) return [];

  const messages: MetaIncomingMessage[] = [];
  for (const entry of parsed.entry ?? []) {
    if (!entry.id) continue;
    for (const event of entry.messaging ?? []) {
      // is_echo: eco del propio mensaje que Radamantis mandó — Meta lo
      // reenvía por el mismo webhook; ignorarlo evita que el bot se
      // responda a sí mismo en un loop.
      if (event.message?.is_echo) continue;
      if (event.sender?.id && event.message?.text) {
        messages.push({ pageId: entry.id, senderId: event.sender.id, text: event.message.text });
      }
    }
  }
  return messages;
}
