import { telegramChannelProvider } from "./telegram";
import type { ChannelProvider } from "./provider";

// Registro de canales soportados — agregar un canal nuevo (WhatsApp,
// Messenger, Instagram) es escribir un archivo aquí al lado de telegram.ts
// implementando ChannelProvider y sumarlo a este mapa. Nada en
// noShowSweep.ts, client/routes.ts ni admin/routes.ts necesita cambiar.
const PROVIDERS: Record<string, ChannelProvider> = {
  [telegramChannelProvider.channel]: telegramChannelProvider,
};

export function getChannelProvider(channel: string): ChannelProvider | null {
  return PROVIDERS[channel] ?? null;
}

export function listSupportedChannels(): ChannelProvider[] {
  return Object.values(PROVIDERS);
}
