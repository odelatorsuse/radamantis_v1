import type { VerticalTemplate } from "./types";

export const coachTemplate: VerticalTemplate = {
  verticalId: "coach",
  displayName: "Coach / consultor independiente",
  promptBase:
    "Eres el asistente virtual de un coach o consultor independiente. Responde en español, de forma breve, cercana y profesional.",
  toolsEnabled: ["searchKb", "handoffHuman", "checkAvailability", "bookAppointment"],
  kbSchema: ["precios", "servicios", "metodologia", "horario_disponible"],
  superpowersDefault: ["blindaje_anti_invento", "handoff"],
};
