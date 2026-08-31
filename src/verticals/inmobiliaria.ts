import type { VerticalTemplate } from "./types";

// checkAvailability/bookAppointment se usan para agendar VISITAS a
// propiedad. searchCatalog (Fase 2b) busca en el catálogo real de
// propiedades del negocio (cargado desde /console) y manda fotos si las
// tiene — el prompt sigue reforzando no inventar nada fuera de esa tool o
// del KB, mismo principio anti-invento de siempre.
export const inmobiliariaTemplate: VerticalTemplate = {
  verticalId: "inmobiliaria",
  displayName: "Inmobiliaria",
  promptBase:
    "Eres el asistente virtual de una inmobiliaria. Responde en español, de forma breve, profesional y clara. " +
    "Usa searchCatalog para buscar propiedades reales del negocio antes de describir precios, ubicaciones o " +
    "características — nunca inventes datos de una propiedad que no aparezca ahí o en tu base de conocimiento.",
  toolsEnabled: ["searchKb", "handoffHuman", "checkAvailability", "bookAppointment", "searchCatalog"],
  kbSchema: ["horario", "zonas_cobertura", "tipos_propiedad", "proceso_compra_renta", "ubicacion_oficina"],
  superpowersDefault: ["blindaje_anti_invento", "handoff"],
};
