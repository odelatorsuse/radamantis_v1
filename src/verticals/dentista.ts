import type { VerticalTemplate } from "./types";

// Agencia (onboarding de clientes): mismo shape que veterinaria/estetica
// (D6) — reserva de citas real vía checkAvailability/bookAppointment, sin
// cambios al core.
export const dentistaTemplate: VerticalTemplate = {
  verticalId: "dentista",
  displayName: "Dentista / clínica dental",
  promptBase:
    "Eres el asistente virtual de un consultorio dental. Responde en español, de forma breve, " +
    "clara y tranquilizadora — muchos pacientes le tienen nervios al dentista.",
  toolsEnabled: ["searchKb", "handoffHuman", "checkAvailability", "bookAppointment"],
  kbSchema: ["horario", "precios", "servicios", "ubicacion", "politicas_cancelacion", "seguros_aceptados"],
  superpowersDefault: ["blindaje_anti_invento", "handoff"],
};
