// Etapa 10: abstracción de canal de mensajería — mismo patrón D5 que
// LLMProvider (src/llm/provider.ts) y CalendarProvider (src/calendar/provider.ts).
// Hoy solo Telegram tiene un adaptador real, pero cada tenant va a elegir su
// propio canal (WhatsApp, Messenger, Instagram) según lo que le convenga a
// SU negocio — nunca va a ser "un canal fijo para todo el producto". El
// resto del código (respuesta manual desde la consola, recupera no-shows,
// alta de canal) debe pasar SIEMPRE por getChannelProvider(), nunca
// comparar channel === "telegram" directamente — así, agregar un canal
// nuevo es escribir un adaptador aquí + registrarlo, sin tocar esos módulos.
export interface WebhookRegistrationResult {
  ok: boolean;
  error?: string;
}

export interface ChannelProvider {
  readonly channel: string;
  readonly displayName: string;
  sendMessage(externalId: string, chatId: string, text: string): Promise<void>;
  // Opcional: no todos los canales necesariamente registran un webhook de la
  // misma forma (Telegram usa un secret_token simple; Meta — WhatsApp/
  // Messenger/Instagram comparten su Graph API — verifica webhooks distinto,
  // con un verify token fijo en su App Dashboard, no un secret enviado aquí).
  // La forma exacta de este método probablemente cambie cuando se construya
  // el segundo adaptador real — hoy solo hay evidencia de un caso (Telegram),
  // generalizar más que esto ahora sería adivinar.
  registerWebhook?(origin: string, externalId: string, webhookSecret: string): Promise<WebhookRegistrationResult>;
}
