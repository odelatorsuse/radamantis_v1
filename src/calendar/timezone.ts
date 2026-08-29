// Etapa 10 (Fase B) — bug real encontrado en producción: el LLM no puede
// convertir zonas horarias de forma confiable por su cuenta (agendó a las
// 12:30 cuando el cliente pidió 13:30, y confundió el día). La conversión
// vive aquí, determinística, no en el prompt.

function formatInTimeZone(date: Date, timeZone: string): Record<string, string> {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

// Convierte una hora "de pared" local (sin offset, ej. "2026-08-30T13:30:00")
// en el instante UTC real que representa en esa zona horaria — funciona
// correcto en cualquier fecha, incluyendo cambios de horario de verano.
export function localToUtcISOString(localDateTime: string, timeZone: string): string {
  const naive = localDateTime.replace(/Z$|[+-]\d{2}:\d{2}$/, "");
  const asIfUtc = new Date(`${naive}Z`);
  const rendered = formatInTimeZone(asIfUtc, timeZone);
  const renderedAsIfUtc = new Date(
    `${rendered.year}-${rendered.month}-${rendered.day}T${rendered.hour}:${rendered.minute}:${rendered.second}Z`,
  );
  const offsetMs = asIfUtc.getTime() - renderedAsIfUtc.getTime();
  return new Date(asIfUtc.getTime() + offsetMs).toISOString();
}

// Si el string ya trae "Z" o un offset explícito, se respeta tal cual
// (algunos modelos lo mandan así a pesar de las instrucciones); si no,
// se interpreta como hora local del negocio.
export function normalizeToUtcISOString(dateTimeStr: string, timeZone: string): string {
  if (/Z$|[+-]\d{2}:\d{2}$/.test(dateTimeStr)) {
    return new Date(dateTimeStr).toISOString();
  }
  return localToUtcISOString(dateTimeStr, timeZone);
}

// Fecha/hora actual en la zona horaria del negocio, en el mismo formato
// "de pared" sin offset — para que el prompt le diga al modelo qué día es
// "hoy" localmente, no en UTC (evita el bug de confundir el día).
export function getCurrentLocalDateTimeString(timeZone: string): string {
  const r = formatInTimeZone(new Date(), timeZone);
  return `${r.year}-${r.month}-${r.day}T${r.hour}:${r.minute}:${r.second}`;
}

// Sentido inverso: un instante UTC (lo que devuelve Google Calendar) a hora
// de pared local — para que el modelo le comunique horarios al cliente en
// su propia zona horaria, no en UTC.
export function utcToLocalDateTimeString(utcIso: string, timeZone: string): string {
  const r = formatInTimeZone(new Date(utcIso), timeZone);
  return `${r.year}-${r.month}-${r.day}T${r.hour}:${r.minute}:${r.second}`;
}

const WEEKDAY_NAMES_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// Bug real encontrado en producción: el modelo recibía solo la fecha en
// formato "YYYY-MM-DD" y calculaba MAL qué día de la semana es "hoy" y qué
// fecha cae "el próximo lunes" (dijo que un lunes futuro "ya había pasado").
// Mismo tipo de error que dayKeyFor() en businessHours.ts evita para el
// horario de atención — aquí se calcula igual de determinista, nunca se le
// pide al modelo que lo infiera solo.
export function weekdayNameEs(localDateTime: string): string {
  const dow = new Date(`${localDateTime.slice(0, 10)}T00:00:00Z`).getUTCDay();
  return WEEKDAY_NAMES_ES[dow];
}

// Bug real: aun diciéndole al modelo qué día es "hoy", sigue calculando MAL
// el día de la semana de otras fechas futuras cercanas (afirmó que un lunes
// real caía en jueves, y que "el próximo lunes" era un domingo). Los LLM no
// hacen aritmética de calendario de forma confiable — en vez de pedirle que
// la infiera, se le da ya resuelta para un rango corto, igual que el resto
// de la lógica de fechas de este módulo.
export function upcomingWeekdaysEs(timeZone: string, days: number): string {
  const today = getCurrentLocalDateTimeString(timeZone).slice(0, 10);
  const startUtc = new Date(`${today}T00:00:00Z`).getTime();
  const rows: string[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(startUtc + i * 86400000).toISOString().slice(0, 10);
    rows.push(`${date}=${WEEKDAY_NAMES_ES[new Date(`${date}T00:00:00Z`).getUTCDay()]}`);
  }
  return rows.join(", ");
}
