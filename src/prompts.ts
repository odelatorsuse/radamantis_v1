import type { KbMatch } from "./rag/search";

// Etapa 2: prompt fijo de sandbox. El Vertical Template (Etapa 7) lo reemplaza por giro.
export const SANDBOX_SYSTEM_PROMPT =
  "Eres el asistente virtual de una veterinaria. Responde en español, de forma breve, " +
  "clara y amable.";

// Etapa 5: umbral de similitud coseno por debajo del cual tratamos un match
// como ruido, no como contexto real — evita que un resultado débil de
// Vectorize se cuele y el modelo lo use como si fuera información confiable.
const MIN_RELEVANCE_SCORE = 0.5;

// Etapa 5 (RAG): el modelo responde solo con lo que trae el contexto y
// rechaza inventar cuando la base de conocimiento no cubre la pregunta.
// El blindaje anti-invento completo (superpower CORE) llega en Etapa 6.
export function buildRagSystemPrompt(matches: KbMatch[]): string {
  const relevant = matches.filter((m) => m.score >= MIN_RELEVANCE_SCORE);

  const contextBlock =
    relevant.length > 0
      ? relevant.map((m, i) => `[${i + 1}] ${m.content}`).join("\n")
      : "(sin resultados relevantes en la base de conocimiento)";

  return (
    `${SANDBOX_SYSTEM_PROMPT}\n\n` +
    "Usa EXCLUSIVAMENTE la siguiente información de la base de conocimiento para responder " +
    "preguntas sobre el consultorio (horarios, precios, servicios, ubicación, políticas). " +
    "Si la respuesta no está en este contexto, dilo explícitamente y sugiere que contacten " +
    "directamente al consultorio — nunca inventes un dato que no esté aquí.\n\n" +
    `Contexto:\n${contextBlock}`
  );
}
