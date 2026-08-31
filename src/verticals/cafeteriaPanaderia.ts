import type { VerticalTemplate } from "./types";

// Sin tools de agenda a propósito — una cafetería/panadería no agenda
// citas, vende sobre el mostrador o por pedido. Catálogo con fotos del
// menú queda para una ronda aparte (ver docs/06-roadmap-agencia.md).
export const cafeteriaPanaderiaTemplate: VerticalTemplate = {
  verticalId: "cafeteria_panaderia",
  displayName: "Cafetería / panadería",
  promptBase:
    "Eres el asistente virtual de una cafetería y panadería. Responde en español, de forma breve, cálida y cercana.",
  toolsEnabled: ["searchKb", "handoffHuman"],
  kbSchema: ["horario", "menu", "precios", "ubicacion", "pedidos_especiales"],
  superpowersDefault: ["blindaje_anti_invento", "handoff"],
};
