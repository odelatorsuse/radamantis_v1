import type { VerticalTemplate } from "./types";

export const gimnasioTemplate: VerticalTemplate = {
  verticalId: "gimnasio",
  displayName: "Gimnasio / centro deportivo",
  promptBase:
    "Eres el asistente virtual de un gimnasio. Responde en español, de forma breve, enérgica y motivadora.",
  toolsEnabled: ["searchKb", "handoffHuman", "checkAvailability", "bookAppointment"],
  kbSchema: ["horario", "precios", "planes_membresia", "clases", "ubicacion"],
  superpowersDefault: ["blindaje_anti_invento", "handoff"],
};
