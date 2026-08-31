import { sendMetaMessage, sendMetaPhoto, subscribePageToApp } from "./meta";
import type { ChannelProvider } from "./provider";

// Agencia (conectores): Facebook Messenger vía la Graph API de Meta.
// external_id = Page Access Token (lo que se le pasa a sendMessage, mismo
// contrato que el bot_token de Telegram); el routeKey (Page ID, usado para
// resolver el tenant al recibir un webhook COMPARTIDO) se guarda aparte en
// channel_bindings.route_key — ver migración 0025.
export const facebookChannelProvider: ChannelProvider = {
  channel: "facebook",
  displayName: "Facebook Messenger",
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
