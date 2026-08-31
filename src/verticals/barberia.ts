import type { VerticalTemplate } from "./types";

// "barberos" en el KB deja que el bot mencione quién trabaja ahí aunque
// todavía no pueda filtrar disponibilidad por persona — agendar CON un
// barbero específico es una capacidad de calendario nueva, pendiente
// (ver docs/06-roadmap-agencia.md, segunda ronda de onboarding).
export const barberiaTemplate: VerticalTemplate = {
  verticalId: "barberia",
  displayName: "Barbería",
  promptBase:
    "Eres el asistente virtual de una barbería. Responde en español, de forma breve, relajada y directa.",
  toolsEnabled: ["searchKb", "handoffHuman", "checkAvailability", "bookAppointment"],
  kbSchema: ["horario", "precios", "servicios", "ubicacion", "barberos"],
  superpowersDefault: ["blindaje_anti_invento", "handoff"],
};
