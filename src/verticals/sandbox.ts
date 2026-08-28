import type { VerticalTemplate } from "./types";

// Vertical genérico de demostración/fallback — sin KB ni handoff, para
// probar que el mecanismo de templates realmente cambia el comportamiento
// (D6) y no es solo metadata decorativa. Usado por segundo-tenant-test.
export const sandboxTemplate: VerticalTemplate = {
  verticalId: "sandbox",
  displayName: "Sandbox genérico (sin KB, sin handoff)",
  promptBase: "Eres un asistente virtual genérico. Responde en español, de forma breve y amable.",
  toolsEnabled: [],
  kbSchema: [],
  superpowersDefault: ["blindaje_anti_invento"],
};
