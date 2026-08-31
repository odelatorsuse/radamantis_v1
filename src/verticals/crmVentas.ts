import type { VerticalTemplate } from "./types";

// Interpretación de trabajo (pendiente de confirmar con Oscar, ver
// docs/06-roadmap-agencia.md): bot calificador de leads para un vendedor/
// negocio independiente — entiende necesidad/presupuesto/urgencia del
// prospecto y deriva a un humano cuando está listo, en vez de agendar
// citas de servicio. Sin tools de calendario a propósito.
export const crmVentasTemplate: VerticalTemplate = {
  verticalId: "crm_ventas",
  displayName: "CRM / calificación de leads",
  promptBase:
    "Eres el asistente virtual de un vendedor o negocio independiente. Tu objetivo es entender qué necesita " +
    "el prospecto, su presupuesto y su urgencia — no cierras ventas ni agendas citas, solo calificas al " +
    "prospecto y avisas al dueño cuando esté listo para hablar con una persona. Responde en español, de " +
    "forma breve y profesional.",
  toolsEnabled: ["searchKb", "handoffHuman"],
  kbSchema: ["servicios", "precios_generales", "preguntas_frecuentes"],
  superpowersDefault: ["blindaje_anti_invento", "handoff"],
};
