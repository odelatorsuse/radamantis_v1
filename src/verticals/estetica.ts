import type { VerticalTemplate } from "./types";

// Segundo giro real (Etapa 9, prueba de alta de cliente). Mismo shape que
// veterinaria.ts — demuestra D6 con contenido propio, sin copiar nada de Forja.
export const esteticaTemplate: VerticalTemplate = {
  verticalId: "estetica",
  displayName: "Estética / salón de belleza",
  promptBase:
    "Eres el asistente virtual de un salón de estética. Responde en español, de forma breve, " +
    "cálida y profesional.",
  toolsEnabled: ["searchKb", "handoffHuman"],
  kbSchema: ["horario", "precios", "servicios", "ubicacion", "politicas_cancelacion"],
  superpowersDefault: ["blindaje_anti_invento", "handoff"],
};
