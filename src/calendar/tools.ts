import { clipToBusinessHours, isWithinBusinessHours, scheduleForDate, type WeeklyBusinessHours } from "./businessHours";
import type { ToolDefinition } from "../llm/provider";
import type { CalendarProvider } from "./provider";
import { normalizeToUtcISOString, utcToLocalDateTimeString } from "./timezone";

// Etapa 10 (Fase B): definiciones de tool calling — el modelo decide cuándo
// invocarlas, agent.ts las ejecuta contra el CalendarProvider real. Las
// fechas van SIEMPRE en hora local del negocio (sin offset) — la conversión
// real a UTC es responsabilidad de este módulo, no del modelo (ver
// src/calendar/timezone.ts: el LLM confundía día y hora al hacerlo solo).
export const CHECK_AVAILABILITY_TOOL: ToolDefinition = {
  name: "checkAvailability",
  description:
    "Consulta los horarios libres reales del calendario del negocio en un rango de fechas. " +
    "Usa siempre un rango amplio (ej. el día completo, 00:00 a 23:59 hora local) — el sistema ya " +
    "filtra automáticamente por el horario real de atención del negocio, no necesitas acotarlo tú.",
  parameters: {
    type: "object",
    properties: {
      rangeStart: { type: "string", description: 'Inicio del rango a consultar, hora LOCAL del negocio, formato "YYYY-MM-DDTHH:MM:SS" (sin offset)' },
      rangeEnd: { type: "string", description: "Fin del rango a consultar, hora LOCAL del negocio, mismo formato" },
    },
    required: ["rangeStart", "rangeEnd"],
  },
};

export const BOOK_APPOINTMENT_TOOL: ToolDefinition = {
  name: "bookAppointment",
  description:
    "Agenda una cita real en el calendario del negocio. Antes de llamarla, siempre confirma con el " +
    "cliente: la fecha/hora exacta, su nombre completo, un teléfono o contacto de vuelta, y el motivo " +
    "de la cita — son datos obligatorios, no la llames si falta alguno. Si el cliente ya dio alguno de " +
    "estos datos antes en la conversación, reutilízalo, no lo vuelvas a pedir.",
  parameters: {
    type: "object",
    properties: {
      start: { type: "string", description: 'Inicio de la cita, hora LOCAL del negocio, formato "YYYY-MM-DDTHH:MM:SS" (sin offset)' },
      end: { type: "string", description: "Fin de la cita, hora LOCAL del negocio, mismo formato" },
      summary: { type: "string", description: "Motivo/tipo de cita, ej. 'Consulta general - Firulais'" },
      attendeeName: { type: "string", description: "Nombre completo del cliente (obligatorio)" },
      attendeeContact: { type: "string", description: "Teléfono o contacto del cliente para confirmar la cita (obligatorio)" },
    },
    required: ["start", "end", "summary", "attendeeName", "attendeeContact"],
  },
};

export const CALENDAR_TOOLS = [CHECK_AVAILABILITY_TOOL, BOOK_APPOINTMENT_TOOL];

interface ToolCallArgs {
  rangeStart?: string;
  rangeEnd?: string;
  start?: string;
  end?: string;
  summary?: string;
  attendeeName?: string;
  attendeeContact?: string;
}

// Ejecuta una tool call de calendario contra el proveedor real y devuelve el
// resultado ya serializado, listo para volver a mandarlo al LLM. timeZone y
// businessHours vienen de tenantSettings — todas las fechas que entran/salen
// de aquí hacia el modelo están en hora local del negocio, nunca en UTC.
export async function executeCalendarTool(
  toolName: string,
  rawArguments: string,
  provider: CalendarProvider,
  timeZone: string,
  businessHours: WeeklyBusinessHours,
): Promise<string> {
  let args: ToolCallArgs;
  try {
    args = JSON.parse(rawArguments) as ToolCallArgs;
  } catch {
    return JSON.stringify({ error: "Argumentos inválidos" });
  }

  if (toolName === "checkAvailability" && args.rangeStart && args.rangeEnd) {
    const rangeStartUtc = normalizeToUtcISOString(args.rangeStart, timeZone);
    const rangeEndUtc = normalizeToUtcISOString(args.rangeEnd, timeZone);

    // Guarda contra un rango degenerado (start >= end) — bug real: el modelo
    // a veces pide un "rango" de un solo punto (ej. rangeStart == rangeEnd
    // para preguntar por un horario puntual). Google Calendar rechaza esto
    // con un 400 "timeRangeEmpty"; sin este check, esa excepción tumbaba
    // toda la petición (el usuario se quedaba sin respuesta en Telegram).
    if (rangeStartUtc >= rangeEndUtc) {
      return JSON.stringify({ error: "rangeStart debe ser anterior a rangeEnd — usa un rango con duración, no un punto exacto." });
    }

    try {
      const freeSlots = await provider.checkAvailability(rangeStartUtc, rangeEndUtc);
      const freeSlotsLocal = freeSlots.map((slot) => ({
        start: utcToLocalDateTimeString(slot.start, timeZone),
        end: utcToLocalDateTimeString(slot.end, timeZone),
      }));
      const withinBusinessHours = freeSlotsLocal.flatMap((slot) => clipToBusinessHours(slot, businessHours));
      return JSON.stringify({ freeSlots: withinBusinessHours, timezone: timeZone });
    } catch (err) {
      // Cualquier falla real del proveedor (Google caído, token inválido,
      // etc.) se convierte en un resultado de tool que el modelo puede leer
      // y explicar al cliente, en vez de tumbar toda la conversación.
      return JSON.stringify({ error: `No se pudo consultar el calendario: ${(err as Error).message}` });
    }
  }

  if (toolName === "bookAppointment" && args.start && args.end && args.summary && args.attendeeName && args.attendeeContact) {
    const startUtc = normalizeToUtcISOString(args.start, timeZone);
    const endUtc = normalizeToUtcISOString(args.end, timeZone);

    if (startUtc >= endUtc) {
      return JSON.stringify({ ok: false, error: "start debe ser anterior a end." });
    }

    // Validación de horario de atención ANTES de tocar Google — siempre
    // sobre la hora LOCAL derivada (no el string crudo: si ya venía en UTC,
    // comparar sus dígitos directo contra el horario local daría mal), y
    // por día de la semana real (sábado puede cerrar antes que entre semana).
    const startLocal = utcToLocalDateTimeString(startUtc, timeZone);
    const endLocal = utcToLocalDateTimeString(endUtc, timeZone);
    if (!isWithinBusinessHours(startLocal, businessHours) || !isWithinBusinessHours(endLocal, businessHours)) {
      const schedule = scheduleForDate(startLocal.slice(0, 10), businessHours);
      const message = schedule
        ? `Ese horario está fuera de nuestro horario de atención ese día (${schedule.start} a ${schedule.end}).`
        : "Ese día no abrimos.";
      return JSON.stringify({ ok: false, error: message });
    }

    try {
      const result = await provider.bookAppointment({
        start: startUtc,
        end: endUtc,
        summary: args.summary,
        attendeeName: args.attendeeName,
        attendeeContact: args.attendeeContact,
      });
      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ ok: false, error: `No se pudo agendar: ${(err as Error).message}` });
    }
  }

  return JSON.stringify({ error: `Faltan argumentos obligatorios para ${toolName} (revisa nombre, contacto, horario y motivo).` });
}
