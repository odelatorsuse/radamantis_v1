import { sendMetaMessage, sendMetaPhoto, subscribePageToApp } from "./meta";
import type { ChannelProvider } from "./provider";

// Agencia (conectores): Instagram en modo clásico (cuenta profesional
// vinculada a la misma Página de Facebook) — reutiliza el mismo Send API y
// el mismo Page Access Token que Messenger (decisión confirmada con Oscar:
// clásico en vez de "Instagram API with Instagram Login", menos superficie
// nueva). external_id = Page Access Token; routeKey = Instagram Business
// Account ID (distinto del Page ID de Facebook, aunque comparten token).
export const instagramChannelProvider: ChannelProvider = {
  channel: "instagram",
  displayName: "Instagram",
  async sendMessage(externalId, chatId, text) {
    await sendMetaMessage(externalId, chatId, text);
  },
  async sendPhoto(externalId, chatId, photoUrl) {
    await sendMetaPhoto(externalId, chatId, photoUrl);
  },
  async registerWebhook(_origin, externalId) {
    return subscribePageToApp(externalId);
  },
};
