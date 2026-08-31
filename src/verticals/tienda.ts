import type { VerticalTemplate } from "./types";

// Sin agenda ni catálogo todavía — un catálogo real de productos con
// fotos queda para una ronda aparte (ver docs/06-roadmap-agencia.md).
export const tiendaTemplate: VerticalTemplate = {
  verticalId: "tienda",
  displayName: "Tienda",
  promptBase: "Eres el asistente virtual de una tienda. Responde en español, de forma breve y amable.",
  toolsEnabled: ["searchKb", "handoffHuman"],
  kbSchema: ["horario", "productos", "precios", "ubicacion", "politicas_devolucion", "metodos_pago"],
  superpowersDefault: ["blindaje_anti_invento", "handoff"],
};
