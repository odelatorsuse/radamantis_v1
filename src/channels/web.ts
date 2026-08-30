import type { ChannelProvider } from "./provider";

// Etapa Agencia (widget de sitio web): a diferencia de Telegram, no hay una
// API externa a la que "empujarle" un mensaje — el visitante recibe la
// respuesta del bot en la misma petición HTTP que mandó (ver src/widget.ts).
// sendMessage es un no-op a propósito: el mensaje ya queda guardado en
// `messages` por quien llama (ver client/routes.ts, misma ruta que usan
// todos los canales), así que una respuesta humana desde /console
// simplemente espera a que el visitante vuelva a escribir — decisión de
// alcance confirmada con Oscar: sin tiempo real en esta primera versión.
// external_id para este canal es el dominio permitido (ver src/widget.ts),
// no un token secreto — mismo campo de siempre, significado distinto.
export const webChannelProvider: ChannelProvider = {
  channel: "web",
  displayName: "Sitio web",
  async sendMessage(): Promise<void> {
    // no-op — ver comentario arriba.
  },
};
