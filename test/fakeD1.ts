// Doble de prueba mínimo para D1: suficiente para ejercitar el filtrado real
// de src/messages.ts contra las mismas sentencias SQL que usa producción,
// sin depender de mocks por-llamada que puedan ocultar un bug de filtrado.
interface MessageRow {
  id: number;
  tenant_id: string;
  channel: string;
  chat_id: string;
  role: string;
  content: string;
}

export function createFakeD1() {
  const messages: MessageRow[] = [];

  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async run() {
              if (/INSERT INTO messages/i.test(sql)) {
                const [tenant_id, channel, chat_id, role, content] = params as string[];
                messages.push({ id: messages.length + 1, tenant_id, channel, chat_id, role, content });
              }
              return { success: true };
            },
            async all<T>() {
              if (/FROM messages/i.test(sql)) {
                // La query real es `ORDER BY id DESC LIMIT ?`; replicamos ese
                // orden aquí porque getHistory() espera revertirlo él mismo.
                const [tenantId, channel, chatId, limit] = params as [string, string, string, number];
                const results = messages
                  .filter((m) => m.tenant_id === tenantId && m.channel === channel && m.chat_id === chatId)
                  .sort((a, b) => b.id - a.id)
                  .slice(0, limit)
                  .map((m) => ({ role: m.role, content: m.content }));
                return { results: results as unknown as T[] };
              }
              return { results: [] as T[] };
            },
          };
        },
      };
    },
  };

  return db as unknown as D1Database;
}
