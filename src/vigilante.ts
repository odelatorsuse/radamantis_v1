import { getChannelProvider } from "./channels/registry";
import type { ConversationRef } from "./messages";
import { getChannelExternalId, getTenantSettings } from "./tenants";

// Etapa 10 (superpower "Vigilante", parcial — la mitad "avisa al dueño",
// ver docs/05-arquitectura-radamantis.md §7: el scoring de sentimiento con
// IA queda como TOGGLE futuro más preciso; esta versión usa detección
// determinista, ver src/handoff.ts). Se llama justo después de crear un
// handoff (agent.ts) — best-effort: la alerta nunca debe poder romper la
// respuesta al cliente, el handoff ya se creó, eso es lo que de verdad
// importa; si la alerta falla, el dueño simplemente no se entera a tiempo,
// pero puede ver el handoff en /admin o /console.
export async function notifyBusinessOwner(db: D1Database, ref: ConversationRef, triggerMessage: string): Promise<void> {
  try {
    const settings = await getTenantSettings(db, ref.tenantId);
    if (!settings.alertChatId) return;

    const provider = getChannelProvider("telegram");
    const externalId = await getChannelExternalId(db, ref.tenantId, "telegram");
    if (!provider || !externalId) return;

    const alertText =
      `Un cliente necesita atención en tu bot (conversación ${ref.channel} #${ref.chatId}).\n` +
      `Mensaje: "${triggerMessage}"`;
    await provider.sendMessage(externalId, settings.alertChatId, alertText);
  } catch {
    // best-effort — nunca romper la respuesta al cliente por esto.
  }
}
