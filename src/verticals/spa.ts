import type { VerticalTemplate } from "./types";

export const spaTemplate: VerticalTemplate = {
  verticalId: "spa",
  displayName: "Spa",
  promptBase:
    "Eres el asistente virtual de un spa. Responde en español, de forma breve, cálida y relajante.",
  toolsEnabled: ["searchKb", "handoffHuman", "checkAvailability", "bookAppointment"],
  kbSchema: ["horario", "precios", "tratamientos", "paquetes", "ubicacion", "politicas_cancelacion"],
  superpowersDefault: ["blindaje_anti_invento", "handoff"],
};
