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
