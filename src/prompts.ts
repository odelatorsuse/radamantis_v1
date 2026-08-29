import { formatBusinessHours } from "./calendar/businessHours";
import { getCurrentLocalDateTimeString } from "./calendar/timezone";
import type { KbMatch } from "./rag/search";
import type { TenantSettings } from "./tenants";

// Etapa 6 (superpower CORE, D7): blindaje anti-invento — aplica siempre,
// para cualquier vertical, no solo cuando hay contexto de KB. Cubre los
// casos donde el modelo tiende a alucinar aunque no haya nada que buscar
// (disponibilidad de citas, diagnósticos, datos de una mascota específica).
// No es overridable por el tenant (ver Etapa 8.5 más abajo).
export const CORE_ANTI_INVENTION_RULES =
  "Reglas obligatorias, sin excepción:\n" +
  "1. Nunca inventes disponibilidad de citas, horarios de un doctor específico, " +
  "precios ni datos de una mascota o cliente que no estén en el contexto que te dieron.\n" +
  "2. Si la pregunta requiere un sistema al que no tienes acceso (agenda en tiempo real, " +
  "historial médico, pagos), dilo explícitamente y sugiere que un miembro del equipo lo confirme.\n" +
  "3. Nunca des un diagnóstico veterinario definitivo. Puedes orientar de forma general, " +
  "pero ante síntomas de una mascota siempre recomienda una consulta presencial.";

// Etapa 5/9: umbral de similitud coseno por debajo del cual tratamos un match
// como ruido. Calibrado en Etapa 9: con text-embedding-3-small, preguntas
// reales en español contra documentos cortos de KB dan scores en el rango
// 0.4-0.6 incluso cuando SÍ son el match correcto (0.5 descartaba respuestas
// legítimas — caso real: "¿Cuál es el horario?" contra el doc de horario dio
// 0.486 y se filtró por error). 0.35 deja pasar esos casos; el "úsalo
// EXCLUSIVAMENTE / si no está ahí dilo" de abajo + CORE_ANTI_INVENTION_RULES
// son la segunda capa de defensa contra contexto poco relevante.
const MIN_RELEVANCE_SCORE = 0.35;

// Etapa 7: promptBase viene del Vertical Template del tenant (D6). Etapa 8.5:
// tenantSettings.promptOverride, si existe, reemplaza promptBase — pero
// CORE_ANTI_INVENTION_RULES siempre se aplica, el tenant no puede quitarlo.
// kbMatches === null significa que ese vertical no tiene la tool "searchKb"
// habilitada (no se buscó nada, a diferencia de buscar y no encontrar nada).
export function buildSystemPrompt(
  promptBase: string,
  kbMatches: KbMatch[] | null,
  tenantSettings?: TenantSettings,
  calendarEnabled = false,
): string {
  const effectiveBase = tenantSettings?.promptOverride || promptBase;
  let prompt = `${effectiveBase}\n\n${CORE_ANTI_INVENTION_RULES}`;

  if (tenantSettings) {
    prompt += `\n\nTono: ${tenantSettings.tone}. Responde en el idioma "${tenantSettings.language}". Usa "${tenantSettings.currency}" como moneda para precios.`;
  }

  // Etapa 10 (Fase B): cuando el tenant tiene calendario conectado, sí hay
  // acceso real a la agenda — la regla CORE de arriba sigue aplicando para
  // cuando NO hay tools (o para datos que la agenda no cubre, como historial
  // médico), pero aquí el modelo debe usar las tools en vez de declinar.
  //
  // Bug real encontrado en producción: sin decirle la zona horaria del
  // negocio, el modelo confundió tanto el día ("mañana") como la hora
  // (agendó 12:30 cuando el cliente pidió 13:30) al convertir a UTC por su
  // cuenta. Ahora se le pide SIEMPRE hora local sin offset — la conversión
  // real a UTC la hace src/calendar/timezone.ts, no el modelo.
  if (calendarEnabled && tenantSettings) {
    const timezone = tenantSettings.timezone;
    prompt +=
      "\n\nTienes acceso a herramientas reales de calendario: \"checkAvailability\" para consultar horarios " +
      "libres y \"bookAppointment\" para agendar. Úsalas siempre que el cliente pregunte por disponibilidad " +
      "o quiera agendar una cita — nunca inventes ni asumas un horario sin consultarlas primero. Al consultar " +
      "disponibilidad, pide siempre un rango amplio (el día completo) — el sistema ya filtra automáticamente " +
      "por el horario real de atención, tú no decidas qué parte del día consultar. IMPORTANTE: llama a " +
      "checkAvailability CADA VEZ que el cliente pregunte por disponibilidad, incluso si ya preguntó algo " +
      "parecido antes en la misma conversación — nunca reuses de memoria ni completes con horarios típicos " +
      "una lista que no viene de una llamada real a la herramienta.\n" +
      `La zona horaria del negocio es "${timezone}" y su horario de atención por día es: ` +
      `${formatBusinessHours(tenantSettings.businessHours)}. Cuando llames a estas herramientas, da las ` +
      'fechas/horas SIEMPRE en hora LOCAL de esa zona, formato "YYYY-MM-DDTHH:MM:SS" (sin "Z" ni offset) — ' +
      "el sistema se encarga de convertirlas a UTC correctamente y de rechazar horarios fuera de atención. " +
      `Fecha y hora actual en esa zona: ${getCurrentLocalDateTimeString(timezone)}.\n` +
      "Antes de agendar (bookAppointment), es OBLIGATORIO tener: (1) la fecha y hora exacta, (2) el nombre " +
      "completo del cliente, (3) un teléfono o contacto de vuelta, y (4) el motivo de la cita. Si falta alguno " +
      "de estos datos, pregúntalo antes de intentar agendar. IMPORTANTE: si el cliente ya te dio su nombre, " +
      "contacto o el motivo en algún mensaje anterior de esta misma conversación, reutiliza esos datos — no " +
      "los vuelvas a pedir ni le hagas repetirse.";
  }

  if (kbMatches !== null) {
    const relevant = kbMatches.filter((m) => m.score >= MIN_RELEVANCE_SCORE);
    const contextBlock =
      relevant.length > 0
        ? relevant.map((m, i) => `[${i + 1}] ${m.content}`).join("\n")
        : "(sin resultados relevantes en la base de conocimiento)";

    prompt +=
      "\n\nPara preguntas sobre el negocio (horarios, precios, servicios, ubicación, políticas), " +
      "usa EXCLUSIVAMENTE la información de la base de conocimiento de abajo. Si no está ahí, " +
      "dilo explícitamente y sugiere que contacten directamente.\n\n" +
      `Contexto:\n${contextBlock}`;
  }

  return prompt;
}
