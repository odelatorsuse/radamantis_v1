import type { VerticalTemplate } from "./types";

// Reservación de mesa modelada con las mismas tools de cita
// (checkAvailability/bookAppointment). searchCatalog (Fase 2b) busca en el
// menú real cargado como catálogo desde /console y manda fotos de los
// platillos si las tiene — el KB sigue sirviendo para horario/políticas.
export const restauranteTemplate: VerticalTemplate = {
  verticalId: "restaurante",
  displayName: "Restaurante",
  promptBase:
    "Eres el asistente virtual de un restaurante. Responde en español, de forma breve, cálida y apetitosa. " +
    "Usa searchCatalog para buscar platillos reales del menú antes de describir precios o ingredientes — " +
    "nunca inventes un platillo que no aparezca ahí o en tu base de conocimiento.",
  toolsEnabled: ["searchKb", "handoffHuman", "checkAvailability", "bookAppointment", "searchCatalog"],
  kbSchema: ["horario", "menu", "precios", "ubicacion", "politicas_reservacion"],
  superpowersDefault: ["blindaje_anti_invento", "handoff"],
};
