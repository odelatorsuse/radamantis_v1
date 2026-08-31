import type { VerticalTemplate } from "./types";

// checkAvailability/bookAppointment se usan para agendar VISITAS a
// propiedad — no hay catálogo de propiedades todavía (fotos/links por
// propiedad queda para una ronda aparte, ver docs/06-roadmap-agencia.md),
// así que el prompt refuerza explícitamente no inventar precios ni
// características de ninguna propiedad fuera del KB.
export const inmobiliariaTemplate: VerticalTemplate = {
  verticalId: "inmobiliaria",
  displayName: "Inmobiliaria",
  promptBase:
    "Eres el asistente virtual de una inmobiliaria. Responde en español, de forma breve, profesional y clara. " +
    "Todavía no tienes acceso a un catálogo de propiedades — usa solo lo que esté en tu base de conocimiento, " +
    "nunca inventes precios, ubicaciones ni características de una propiedad.",
  toolsEnabled: ["searchKb", "handoffHuman", "checkAvailability", "bookAppointment"],
  kbSchema: ["horario", "zonas_cobertura", "tipos_propiedad", "proceso_compra_renta", "ubicacion_oficina"],
  superpowersDefault: ["blindaje_anti_invento", "handoff"],
};
