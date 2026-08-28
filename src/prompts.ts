import type { KbMatch } from "./rag/search";

// Etapa 6 (superpower CORE, D7): blindaje anti-invento — aplica siempre,
// para cualquier vertical, no solo cuando hay contexto de KB. Cubre los
// casos donde el modelo tiende a alucinar aunque no haya nada que buscar
// (disponibilidad de citas, diagnósticos, datos de una mascota específica).
export const CORE_ANTI_INVENTION_RULES =
  "Reglas obligatorias, sin excepción:\n" +
  "1. Nunca inventes disponibilidad de citas, horarios de un doctor específico, " +
  "precios ni datos de una mascota o cliente que no estén en el contexto que te dieron.\n" +
  "2. Si la pregunta requiere un sistema al que no tienes acceso (agenda en tiempo real, " +
  "historial médico, pagos), dilo explícitamente y sugiere que un miembro del equipo lo confirme.\n" +
  "3. Nunca des un diagnóstico veterinario definitivo. Puedes orientar de forma general, " +
  "pero ante síntomas de una mascota siempre recomienda una consulta presencial.";

// Etapa 5: umbral de similitud coseno por debajo del cual tratamos un match
// como ruido, no como contexto real — evita que un resultado débil de
// Vectorize se cuele y el modelo lo use como si fuera información confiable.
const MIN_RELEVANCE_SCORE = 0.5;

// Etapa 7: promptBase viene del Vertical Template del tenant (D6), ya no
// hardcodeado aquí. kbMatches === null significa que ese vertical no tiene
// la tool "searchKb" habilitada (no se buscó nada, a diferencia de buscar
// y no encontrar resultados relevantes).
export function buildSystemPrompt(promptBase: string, kbMatches: KbMatch[] | null): string {
  let prompt = `${promptBase}\n\n${CORE_ANTI_INVENTION_RULES}`;

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
