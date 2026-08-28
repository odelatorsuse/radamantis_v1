export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
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
      "SELECT role, content FROM messages WHERE tenant_id = ? AND channel = ? AND chat_id = ? ORDER BY id DESC LIMIT ?",
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
    .prepare("INSERT INTO messages (tenant_id, channel, chat_id, role, content) VALUES (?, ?, ?, ?, ?)")
    .bind(ref.tenantId, ref.channel, ref.chatId, message.role, message.content)
    .run();
}
