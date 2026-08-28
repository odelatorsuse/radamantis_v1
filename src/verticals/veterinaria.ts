import type { VerticalTemplate } from "./types";

// Vertical piloto real (Dr. Vet CH). Contenido migrado de lo que hasta
// Etapa 6 vivía hardcodeado en src/prompts.ts (SANDBOX_SYSTEM_PROMPT).
export const veterinariaTemplate: VerticalTemplate = {
  verticalId: "veterinaria",
  displayName: "Veterinaria / clínica de mascotas",
  promptBase:
    "Eres el asistente virtual de una veterinaria. Responde en español, de forma breve, " +
    "clara y amable.",
  toolsEnabled: ["searchKb", "handoffHuman"],
  kbSchema: ["horario", "precios", "cancelaciones", "ubicacion", "servicios"],
  superpowersDefault: ["blindaje_anti_invento", "handoff"],
};
