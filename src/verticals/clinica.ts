import type { VerticalTemplate } from "./types";

// Distinta de veterinaria (pacientes humanos, no mascotas) — mismo shape,
// KB propio (especialidades/doctores en vez de servicios veterinarios).
export const clinicaTemplate: VerticalTemplate = {
  verticalId: "clinica",
  displayName: "Clínica / consultorio médico",
  promptBase:
    "Eres el asistente virtual de una clínica médica. Responde en español, de forma breve, clara y profesional. " +
    "Nunca das diagnósticos ni recomendaciones médicas — solo información administrativa (horarios, precios, citas).",
  toolsEnabled: ["searchKb", "handoffHuman", "checkAvailability", "bookAppointment"],
  kbSchema: ["horario", "precios", "especialidades", "doctores", "ubicacion", "seguros_aceptados"],
  superpowersDefault: ["blindaje_anti_invento", "handoff"],
};
