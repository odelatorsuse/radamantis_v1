export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  // Etapa 10 (consola del cliente — manejo de chats): "human" cuando el
  // negocio respondió a mano desde /console en vez de ser el LLM. Se guarda
  // igual con role="assistant" (así lo ve el cliente y el LLM si se
  // reactiva la conversación) — sentBy es solo para distinguirlo en la UI.
  sentBy?: "human" | null;
}

export interface ConversationRef {
  tenantId: string;
  channel: string;
  chatId: string;
}

// D3: siempre filtrado por tenant_id, aunque hoy solo exista el tenant sandbox.
export async function getHistory(
  db: D1Database,
  ref: ConversationRef,
  limit = 20,
): Promise<StoredMessage[]> {
  const { results } = await db
    .prepare(
      "SELECT role, content, sent_by AS sentBy FROM messages WHERE tenant_id = ? AND channel = ? AND chat_id = ? ORDER BY id DESC LIMIT ?",
    )
    .bind(ref.tenantId, ref.channel, ref.chatId, limit)
    .all<StoredMessage>();
  return results.reverse();
}

export async function appendMessage(
  db: D1Database,
  ref: ConversationRef,
  message: StoredMessage,
): Promise<void> {
  await db
    .prepare("INSERT INTO messages (tenant_id, channel, chat_id, role, content, sent_by) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(ref.tenantId, ref.channel, ref.chatId, message.role, message.content, message.sentBy ?? null)
    .run();
}

// Agencia ("Flujo"): indicador de "actividad reciente" en el diagrama —
// no es monitoreo en vivo, es "¿hubo algún mensaje real en los últimos N
// minutos?" contra D1.
export async function hasRecentActivity(db: D1Database, tenantId: string, minutes = 5): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 FROM messages WHERE tenant_id = ? AND created_at >= datetime('now', ?) LIMIT 1`)
    .bind(tenantId, `-${minutes} minutes`)
    .first();
  return row !== null;
}
