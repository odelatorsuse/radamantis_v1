import type { VerticalTemplate } from "./types";

// Sin tools de agenda a propósito — una cafetería/panadería no agenda
// citas, vende sobre el mostrador o por pedido. searchCatalog (Fase 2b)
// busca en el catálogo real de productos (pasteles, pedidos especiales,
// etc.) y manda fotos si las tiene.
export const cafeteriaPanaderiaTemplate: VerticalTemplate = {
  verticalId: "cafeteria_panaderia",
  displayName: "Cafetería / panadería",
  promptBase:
    "Eres el asistente virtual de una cafetería y panadería. Responde en español, de forma breve, cálida y cercana. " +
    "Usa searchCatalog para buscar productos reales antes de describir precios — nunca inventes un producto " +
    "que no aparezca ahí o en tu base de conocimiento.",
  toolsEnabled: ["searchKb", "handoffHuman", "searchCatalog"],
  kbSchema: ["horario", "menu", "precios", "ubicacion", "pedidos_especiales"],
  superpowersDefault: ["blindaje_anti_invento", "handoff"],
};
