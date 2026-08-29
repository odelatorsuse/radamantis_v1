import { getCurrentLocalDateTimeString, weekdayNameEs } from "./timezone";

// Bug real (Etapa 10): el LLM alucina sobre fechas incluso con una tabla
// correcta de referencia en el prompt — llegó a decir que "el 31 de agosto
// no existe" o que "agosto tiene 30 días". Reforzar el prompt no lo elimina
// de forma confiable (es un límite del modelo, no del prompt). En vez de
// pedirle que interprete frases de fecha en español, se resuelven aquí en
// código determinista y se le entrega el resultado ya calculado — el modelo
// solo tiene que leerlo y usarlo, nunca calcularlo.
//
// Cobertura actual: "hoy", "mañana", "pasado mañana", días de la semana
// (con o sin "próximo"/"siguiente"), y "<día> de <mes>" con año opcional.
// No es un NLU completo — cubre los patrones reales vistos hasta ahora;
// ampliar según casos reales que se encuentren, no de forma especulativa.

export interface ResolvedDateMention {
  phrase: string;
  date: string; // YYYY-MM-DD
  weekday: string;
}

const WEEKDAY_INDEX: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miércoles: 3,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sábado: 6,
  sabado: 6,
};

const MONTH_INDEX: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

function todayUtcMidnight(timeZone: string): Date {
  const today = getCurrentLocalDateTimeString(timeZone).slice(0, 10);
  return new Date(`${today}T00:00:00Z`);
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000);
}

export function extractMentionedDates(text: string, timeZone: string): ResolvedDateMention[] {
  const lower = text.toLowerCase();
  const today = todayUtcMidnight(timeZone);
  const results: ResolvedDateMention[] = [];

  const push = (phrase: string, date: Date) => {
    const dateStr = toDateStr(date);
    if (results.some((r) => r.date === dateStr)) return;
    results.push({ phrase, date: dateStr, weekday: weekdayNameEs(`${dateStr}T00:00:00`) });
  };

  const hasPasadoManana = /pasado\s+mañana/.test(lower);
  if (hasPasadoManana) push("pasado mañana", addDays(today, 2));

  // "mañana" como día (no como momento del día: "esta mañana"/"por/en/de la
  // mañana" significan "this morning", no "tomorrow" — no son una fecha).
  const isTimeOfDayManana = /esta\s+mañana/.test(lower) || /(por|en|de)\s+la\s+mañana/.test(lower);
  if (!hasPasadoManana && !isTimeOfDayManana && /\bmañana\b/.test(lower)) {
    push("mañana", addDays(today, 1));
  }

  if (/\bhoy\b/.test(lower)) push("hoy", today);

  const weekdayRegex = /(próximo|proximo|siguiente)?\s*\b(domingo|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado)\b/g;
  for (const m of lower.matchAll(weekdayRegex)) {
    const skip = !!m[1];
    const targetDow = WEEKDAY_INDEX[m[2]];
    const todayDow = today.getUTCDay();
    let diff = (targetDow - todayDow + 7) % 7;
    if (diff === 0 && skip) diff = 7;
    push(m[0].trim(), addDays(today, diff));
  }

  const dateRegex = /(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+(\d{4}))?/g;
  for (const m of lower.matchAll(dateRegex)) {
    const day = parseInt(m[1], 10);
    const month = MONTH_INDEX[m[2]];
    const explicitYear = m[3] ? parseInt(m[3], 10) : null;
    const year = explicitYear ?? today.getUTCFullYear();
    let candidate = new Date(Date.UTC(year, month, day));
    // Sin año explícito y la fecha ya pasó este año -> asumimos el próximo año
    // (patrón típico al agendar: nadie pide una fecha que ya pasó).
    if (!explicitYear && candidate.getTime() < today.getTime()) {
      candidate = new Date(Date.UTC(year + 1, month, day));
    }
    push(m[0], candidate);
  }

  return results;
}

export function formatDateMentionsNote(mentions: ResolvedDateMention[]): string | null {
  if (mentions.length === 0) return null;
  const lines = mentions.map((m) => `"${m.phrase}" = ${m.date} (${m.weekday})`);
  return (
    "[Nota interna calculada por el sistema, no por ti — el cliente mencionó estas fechas en su último " +
    `mensaje, ya resueltas a fecha exacta: ${lines.join("; ")}. Úsalas tal cual, no las vuelvas a calcular ` +
    "ni las contradigas.]"
  );
}
