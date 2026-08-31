import type { VerticalTemplate } from "./types";

// Reservación de mesa modelada con las mismas tools de cita (checkAvailability/
// bookAppointment) — un catálogo real de menú con fotos queda para una
// ronda aparte (ver docs/06-roadmap-agencia.md), por ahora el menú vive
// como texto en el KB.
export const restauranteTemplate: VerticalTemplate = {
  verticalId: "restaurante",
  displayName: "Restaurante",
  promptBase:
    "Eres el asistente virtual de un restaurante. Responde en español, de forma breve, cálida y apetitosa. " +
    "Si no tienes el dato exacto de un platillo o precio en tu base de conocimiento, dilo — nunca inventes el menú.",
  toolsEnabled: ["searchKb", "handoffHuman", "checkAvailability", "bookAppointment"],
  kbSchema: ["horario", "menu", "precios", "ubicacion", "politicas_reservacion"],
  superpowersDefault: ["blindaje_anti_invento", "handoff"],
};
