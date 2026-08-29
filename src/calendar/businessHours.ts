import type { TimeSlot } from "./provider";

// Etapa 10 (Fase B, refinamiento): horario de atención por día de la semana
// — varía entre tenants (ej. vet-ch: sábado 9-13, domingo cerrado), un solo
// rango fijo para todos los días era incorrecto (dejaba pasar sábado 13:00
// como si fuera un horario normal de entre semana).
export interface DaySchedule {
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

export interface WeeklyBusinessHours {
  mon: DaySchedule | null;
  tue: DaySchedule | null;
  wed: DaySchedule | null;
  thu: DaySchedule | null;
  fri: DaySchedule | null;
  sat: DaySchedule | null;
  sun: DaySchedule | null;
}

// null = cerrado ese día.
export const DEFAULT_BUSINESS_HOURS: WeeklyBusinessHours = {
  mon: { start: "09:00", end: "18:00" },
  tue: { start: "09:00", end: "18:00" },
  wed: { start: "09:00", end: "18:00" },
  thu: { start: "09:00", end: "18:00" },
  fri: { start: "09:00", end: "18:00" },
  sat: { start: "09:00", end: "18:00" },
  sun: null,
};

const DAY_KEYS: (keyof WeeklyBusinessHours)[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABELS: Record<keyof WeeklyBusinessHours, string> = {
  mon: "Lunes",
  tue: "Martes",
  wed: "Miércoles",
  thu: "Jueves",
  fri: "Viernes",
  sat: "Sábado",
  sun: "Domingo",
};

// dateStr: "YYYY-MM-DD" — puro cálculo de día de la semana, sin ambigüedad
// de zona horaria (ya es un día calendario, no un instante).
export function dayKeyFor(dateStr: string): keyof WeeklyBusinessHours {
  const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return DAY_KEYS[dow];
}

export function parseBusinessHours(json: string | null | undefined): WeeklyBusinessHours {
  if (!json) return DEFAULT_BUSINESS_HOURS;
  try {
    return JSON.parse(json) as WeeklyBusinessHours;
  } catch {
    return DEFAULT_BUSINESS_HOURS;
  }
}

export function isWithinBusinessHours(localDateTime: string, hours: WeeklyBusinessHours): boolean {
  const date = localDateTime.slice(0, 10);
  const time = localDateTime.slice(11, 16);
  const day = hours[dayKeyFor(date)];
  if (!day) return false;
  return time >= day.start && time <= day.end;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Un hueco libre puede abarcar varios días (calendario vacío) — se recorta
// día por día según el horario real de ESE día de la semana.
export function clipToBusinessHours(slot: TimeSlot, hours: WeeklyBusinessHours): TimeSlot[] {
  const results: TimeSlot[] = [];
  const slotEndDay = slot.end.slice(0, 10);
  let day = slot.start.slice(0, 10);
  let guard = 0;
  while (day <= slotEndDay && guard < 366) {
    guard += 1;
    const schedule = hours[dayKeyFor(day)];
    if (schedule) {
      const dayStart = `${day}T${schedule.start}:00`;
      const dayEnd = `${day}T${schedule.end}:00`;
      const clippedStart = slot.start > dayStart ? slot.start : dayStart;
      const clippedEnd = slot.end < dayEnd ? slot.end : dayEnd;
      if (clippedStart < clippedEnd) {
        results.push({ start: clippedStart, end: clippedEnd });
      }
    }
    day = addDays(day, 1);
  }
  return results;
}

export function scheduleForDate(dateStr: string, hours: WeeklyBusinessHours): DaySchedule | null {
  return hours[dayKeyFor(dateStr)];
}

// Para el prompt del LLM — que sepa el horario real sin tener que adivinar.
export function formatBusinessHours(hours: WeeklyBusinessHours): string {
  return (Object.keys(DAY_LABELS) as (keyof WeeklyBusinessHours)[])
    .map((key) => {
      const day = hours[key];
      return `${DAY_LABELS[key]}: ${day ? `${day.start} a ${day.end}` : "cerrado"}`;
    })
    .join(", ");
}
