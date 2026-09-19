import { facebookChannelProvider } from "./facebook";
import { instagramChannelProvider } from "./instagram";
import { telegramChannelProvider } from "./telegram";
import { webChannelProvider } from "./web";
import { whatsappChannelProvider } from "./whatsapp";
import type { ChannelProvider } from "./provider";

// Registro de canales soportados — agregar un canal nuevo (WhatsApp) es
// escribir un archivo aquí al lado de telegram.ts implementando
// ChannelProvider y sumarlo a este mapa. Nada en noShowSweep.ts,
// client/routes.ts ni admin/routes.ts necesita cambiar.
const PROVIDERS: Record<string, ChannelProvider> = {
  [telegramChannelProvider.channel]: telegramChannelProvider,
  [webChannelProvider.channel]: webChannelProvider,
  [facebookChannelProvider.channel]: facebookChannelProvider,
  [instagramChannelProvider.channel]: instagramChannelProvider,
  [whatsappChannelProvider.channel]: whatsappChannelProvider,
};

export function getChannelProvider(channel: string): ChannelProvider | null {
  return PROVIDERS[channel] ?? null;
}

export function listSupportedChannels(): ChannelProvider[] {
  return Object.values(PROVIDERS);
}
