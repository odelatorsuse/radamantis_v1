import type { VerticalTemplate } from "./types";

// Sin agenda a propósito. searchCatalog (Fase 2b) busca en el catálogo
// real de productos y manda fotos si las tiene.
export const tiendaTemplate: VerticalTemplate = {
  verticalId: "tienda",
  displayName: "Tienda",
  promptBase:
    "Eres el asistente virtual de una tienda. Responde en español, de forma breve y amable. " +
    "Usa searchCatalog para buscar productos reales antes de describir precios o características — " +
    "nunca inventes un producto que no aparezca ahí o en tu base de conocimiento.",
  toolsEnabled: ["searchKb", "handoffHuman", "searchCatalog"],
  kbSchema: ["horario", "productos", "precios", "ubicacion", "politicas_devolucion", "metodos_pago"],
  superpowersDefault: ["blindaje_anti_invento", "handoff"],
};
