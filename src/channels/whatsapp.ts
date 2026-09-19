import { sendWhatsAppMessage, sendWhatsAppPhoto, subscribeWabaToApp } from "./meta";
import type { ChannelProvider, WebhookRegistrationResult } from "./provider";

// Backlog de Agencia (WhatsApp, "listo para todos los tipos de clientes, no
// solo pádel"): a diferencia de Facebook/Instagram (external_id = un solo
// Page Access Token, obtenido vía OAuth por tenant), WhatsApp necesita DOS
// datos para mandar un mensaje — DE qué número se manda (phone_number_id) y
// CON qué token (el System User token del negocio de Oscar, que un cliente
// autoriza dándole acceso de Partner a su WABA) — y ChannelProvider.sendMessage
// solo recibe un externalId, sin un segundo parámetro. En vez de cambiar esa
// interfaz compartida (usada también por Telegram/Facebook/Instagram/Web),
// ambos valores viajan juntos en external_id separados por "|" (ninguno de
// los dos contiene ese carácter en la vida real) — el WABA ID (necesario
// solo para suscribir el número al webhook, una vez, al vincular el canal)
// va como tercer segmento. channel_bindings.route_key sigue guardando el
// phone_number_id por separado, igual que Facebook/Instagram guardan su Page
// ID / IG Business Account ID ahí — es lo que resuelve el tenant al recibir
// un webhook, ver resolveTenantByRouteKey.
export interface WhatsAppCredentials {
  phoneNumberId: string;
  accessToken: string;
  wabaId: string;
}

export function buildWhatsAppExternalId(creds: WhatsAppCredentials): string {
  return `${creds.phoneNumberId}|${creds.accessToken}|${creds.wabaId}`;
}

export function parseWhatsAppExternalId(externalId: string): WhatsAppCredentials {
  const [phoneNumberId = "", accessToken = "", wabaId = ""] = externalId.split("|");
  return { phoneNumberId, accessToken, wabaId };
}

export const whatsappChannelProvider: ChannelProvider = {
  channel: "whatsapp",
  displayName: "WhatsApp",
  async sendMessage(externalId, chatId, text) {
    const { phoneNumberId, accessToken } = parseWhatsAppExternalId(externalId);
    await sendWhatsAppMessage(phoneNumberId, accessToken, chatId, text);
  },
  async sendPhoto(externalId, chatId, photoUrl, caption) {
    const { phoneNumberId, accessToken } = parseWhatsAppExternalId(externalId);
    await sendWhatsAppPhoto(phoneNumberId, accessToken, chatId, photoUrl, caption);
  },
  async registerWebhook(_origin, externalId): Promise<WebhookRegistrationResult> {
    const { accessToken, wabaId } = parseWhatsAppExternalId(externalId);
    if (!wabaId) return { ok: false, error: "Falta el WABA ID" };
    return subscribeWabaToApp(wabaId, accessToken);
  },
};
