import type { ConversationRef } from "./messages";

// Etapa 6 (CORE, D7): detección determinista y curada — preferible a que el
// propio LLM decida, para que el disparo sea auditable y predecible. Se
// amplía con evidencia real de conversaciones, no por adivinanza.
const HANDOFF_KEYWORDS = [
  "hablar con una persona",
  "hablar con alguien real",
  "hablar con un humano",
  "hablar con un operador",
  "hablar con el doctor",
  "hablar con el veterinario",
  "atención humana",
  "operador",
  "es una emergencia",
  "es urgente",
  "emergencia",
];

export function detectsHandoffRequest(text: string): boolean {
  const normalized = text.toLowerCase();
  return HANDOFF_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

// Etapa 10 (superpower "Vigilante"): mismo principio que arriba — detección
// determinista y curada de un cliente molesto/frustrado, no un modelo de
// sentimiento con IA (eso queda como TOGGLE futuro más preciso, ver
// docs/05-arquitectura-radamantis.md §7). También dispara un handoff — un
// cliente molesto necesita un humano igual que uno que lo pide explícito.
const URGENT_SENTIMENT_KEYWORDS = [
  "pésimo servicio",
  "pésima atención",
  "muy mal servicio",
  "qué mal servicio",
  "esto es una estafa",
  "quiero mi dinero de vuelta",
  "voy a poner una queja",
  "voy a demandar",
  "nunca voy a volver",
  "esto es el colmo",
  "estoy muy molesto",
  "estoy muy enojado",
  "es una vergüenza",
  "quiero cancelar todo",
];

export function detectsUrgentSentiment(text: string): boolean {
  const normalized = text.toLowerCase();
  return URGENT_SENTIMENT_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export const HANDOFF_REPLY_MESSAGE =
  "Voy a conectarte con un miembro del equipo — en breve te contactarán directamente. " +
  "Mientras tanto, cualquier mensaje que envíes aquí quedará registrado para que lo vean.";

export async function isPaused(db: D1Database, ref: ConversationRef): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT id FROM handoffs WHERE tenant_id = ? AND channel = ? AND chat_id = ? AND resolved_at IS NULL LIMIT 1",
    )
    .bind(ref.tenantId, ref.channel, ref.chatId)
    .first();
  return row !== null;
}

export async function createHandoff(db: D1Database, ref: ConversationRef, reason: string): Promise<void> {
  await db
    .prepare("INSERT INTO handoffs (tenant_id, channel, chat_id, reason) VALUES (?, ?, ?, ?)")
    .bind(ref.tenantId, ref.channel, ref.chatId, reason)
    .run();
}

// Etapa 10 (consola del cliente): a diferencia de resolveHandoff (admin,
// por id de handoff), la consola del cliente solo conoce channel+chatId de
// la conversación que quiere reactivar, no el id interno del handoff.
export async function resolveHandoffByRef(db: D1Database, ref: ConversationRef): Promise<void> {
  await db
    .prepare(
      "UPDATE handoffs SET resolved_at = datetime('now') WHERE tenant_id = ? AND channel = ? AND chat_id = ? AND resolved_at IS NULL",
    )
    .bind(ref.tenantId, ref.channel, ref.chatId)
    .run();
}
