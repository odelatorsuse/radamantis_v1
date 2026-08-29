import { formatBusinessHours } from "./calendar/businessHours";
import { extractMentionedDates, formatDateMentionsNote } from "./calendar/dateParser";
import { getCurrentLocalDateTimeString, upcomingWeekdaysEs, weekdayNameEs } from "./calendar/timezone";
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
// Exportado para que agent.ts (superpower "Mejoras") pueda saber si un
// kbMatches "no tuvo nada relevante" con el MISMO criterio que usa el
// prompt — una sola fuente de verdad para el umbral.
export const MIN_RELEVANCE_SCORE = 0.35;

export function hasRelevantMatch(kbMatches: KbMatch[]): boolean {
  return kbMatches.some((m) => m.score >= MIN_RELEVANCE_SCORE);
}

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
  userText?: string,
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
      `Hoy es ${weekdayNameEs(getCurrentLocalDateTimeString(timezone))}. Fecha y hora actual en esa zona: ` +
      `${getCurrentLocalDateTimeString(timezone)}. NUNCA calcules tú qué día de la semana cae una fecha — ` +
      "sueles equivocarte. Usa exclusivamente esta tabla ya calculada (formato fecha=día): " +
      `${upcomingWeekdaysEs(timezone, 21)}. Si el cliente menciona una fecha (ej. "el 31 de agosto") o un día ` +
      "relativo (ej. \"el próximo lunes\"), búscalo en esta tabla para saber a qué fecha exacta corresponde " +
      "y qué día de la semana es — nunca lo asumas ni lo calcules de memoria. Esta tabla es la única fuente " +
      "de verdad sobre el calendario: nunca digas que una fecha \"no existe\", que un mes tiene menos días de " +
      "los que tiene en realidad, ni ninguna otra afirmación sobre el calendario que contradiga la tabla — " +
      "si una fecha que te mencionan no aparece en la tabla, es simplemente porque está fuera del rango de " +
      "los próximos 21 días, no porque sea inválida.\n";

    // Bug real: incluso con la tabla de arriba, el modelo a veces alucinaba
    // sobre fechas concretas ("el 31 de agosto no existe"). En vez de pedirle
    // que busque en la tabla por su cuenta, el sistema ya resuelve las fechas
    // que el cliente mencionó en ESTE mensaje y se las entrega calculadas —
    // el modelo solo tiene que leerlas, no interpretarlas.
    if (userText) {
      const mentions = extractMentionedDates(userText, timezone);
      const note = formatDateMentionsNote(mentions);
      if (note) prompt += `${note}\n`;
    }

    prompt +=
      "Antes de agendar (bookAppointment), es OBLIGATORIO tener: (1) la fecha y hora exacta, (2) el nombre " +
      "completo del cliente, (3) un teléfono o contacto de vuelta, y (4) el motivo de la cita. Si falta alguno " +
      "de estos datos, pregúntalo antes de intentar agendar. IMPORTANTE: si el cliente ya te dio su nombre, " +
      "contacto o el motivo en algún mensaje anterior de esta misma conversación — sin importar cuántos " +
      "mensajes antes, ni en qué orden llegaron los datos — reutilízalos, no los vuelvas a pedir ni le hagas " +
      "repetirse. CRÍTICO: en cuanto tengas los 4 datos completos (sea que lleguen todos juntos o repartidos " +
      "en varios mensajes anteriores), LLAMA A bookAppointment de inmediato, en esa misma respuesta — nunca " +
      "digas frases como 'voy a agendar', 'un momento' o 'dame un segundo' sin haber llamado ya a la " +
      "herramienta en ese mismo turno, y nunca le digas al cliente que la cita quedó agendada, que NO quedó " +
      "agendada, o que un horario está o no está disponible, si no llamaste a bookAppointment/checkAvailability " +
      "en ese mismo turno y viste su resultado real — nunca lo afirmes de memoria ni lo asumas. No pidas una " +
      "confirmación aparte del cliente una vez que ya tienes los 4 datos — agenda directamente.\n\n" +
      // Etapa 10 (unifica no-shows + encuesta de satisfacción + reseñas,
      // decidido con Oscar): un solo seguimiento post-cita en vez de tres
      // mensajes separados que podrían pisarse sobre la misma cita.
      "Después de que pase una cita, el sistema le manda al cliente un mensaje preguntando si pudo asistir y, " +
      "si asistió, qué calificación del 1 al 5 le daría. Si el cliente está respondiendo a ESE mensaje (revisa " +
      "el historial — tu mensaje anterior preguntó justo eso), CRÍTICO: llama a recordAppointmentFeedback DE " +
      "INMEDIATO, en esa misma respuesta, ANTES de escribir tu texto — incluyendo cuando el cliente diga que " +
      "NO asistió (attended:false). No es opcional solo porque no haya calificación que registrar: nunca le " +
      "ofrezcas reagendar, ni le agradezcas, ni digas nada sobre su cita anterior sin haber llamado ya a la " +
      "herramienta en ese mismo turno — sin excepción, en los tres casos (no asistió / calificación alta / " +
      "calificación baja) la tool se llama siempre, nunca solo cuando hay un número que registrar. Después de " +
      "llamarla, responde así, según el caso: " +
      "(a) si dice que NO asistió, ofrécele ayuda para reagendar (usa checkAvailability/bookAppointment " +
      "normalmente); " +
      "(b) si asistió y calificó 4 o 5, agradécele" +
      (tenantSettings.reviewLink
        ? ` y pídele que deje una reseña con este link exacto: ${tenantSettings.reviewLink}`
        : " — no hay link de reseñas configurado todavía, así que no pidas una reseña, solo agradece") +
      "; " +
      "(c) si asistió y calificó 1, 2 o 3, discúlpate, dile que el equipo se va a poner en contacto con él, y " +
      "NUNCA le pidas una reseña en este caso. No llames a esta tool si el cliente no está respondiendo a ese " +
      "seguimiento — es solo para esa conversación puntual, no la uses para nada más.";
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
