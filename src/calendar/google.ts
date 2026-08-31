import type { AppointmentDetails, BookAppointmentResult, CalendarProvider, TimeSlot } from "./provider";

interface GoogleFreeBusyResponse {
  calendars: Record<string, { busy: { start: string; end: string }[] }>;
}

interface GoogleEventInsertResponse {
  id?: string;
  error?: { message?: string };
}

interface GoogleEventsListResponse {
  items?: { start?: { dateTime?: string }; end?: { dateTime?: string } }[];
  error?: { message?: string };
}

const STAFF_PROPERTY_KEY = "radamantisStaffMember";

// Fase A (Etapa 10): API REST de Google Calendar v3 directo con fetch —
// mismo estilo que src/llm/openai.ts, sin SDK.
export class GoogleCalendarProvider implements CalendarProvider {
  constructor(
    private readonly accessToken: string,
    private readonly calendarId: string,
  ) {}

  async checkAvailability(rangeStart: string, rangeEnd: string, staffMember?: string): Promise<TimeSlot[]> {
    if (staffMember) {
      return this.checkAvailabilityForStaff(rangeStart, rangeEnd, staffMember);
    }

    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin: rangeStart, timeMax: rangeEnd, items: [{ id: this.calendarId }] }),
    });
    if (!res.ok) {
      throw new Error(`Google freeBusy falló: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as GoogleFreeBusyResponse;
    const busy = data.calendars[this.calendarId]?.busy ?? [];
    return invertBusyToFreeSlots(rangeStart, rangeEnd, busy);
  }

  // Agencia (Fase 2): freeBusy.query solo da ocupado/libre a nivel de TODO
  // el calendario, sin forma de filtrar por persona — para eso hace falta
  // listar los eventos reales y quedarnos solo con los etiquetados con este
  // staffMember (privateExtendedProperty, filtrado server-side por Google,
  // no se listan todos los eventos del calendario). singleEvents+orderBy
  // aseguran que vengan expandidos (no recurrencias) y ya ordenados por
  // inicio, que es lo que invertBusyToFreeSlots espera.
  private async checkAvailabilityForStaff(rangeStart: string, rangeEnd: string, staffMember: string): Promise<TimeSlot[]> {
    const params = new URLSearchParams({
      timeMin: rangeStart,
      timeMax: rangeEnd,
      singleEvents: "true",
      orderBy: "startTime",
      privateExtendedProperty: `${STAFF_PROPERTY_KEY}=${staffMember}`,
    });
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${this.accessToken}` } },
    );
    if (!res.ok) {
      throw new Error(`Google events.list falló: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as GoogleEventsListResponse;
    const busy = (data.items ?? [])
      .filter((event) => event.start?.dateTime && event.end?.dateTime)
      .map((event) => ({ start: event.start!.dateTime!, end: event.end!.dateTime! }));
    return invertBusyToFreeSlots(rangeStart, rangeEnd, busy);
  }

  async bookAppointment(details: AppointmentDetails): Promise<BookAppointmentResult> {
    // Blindaje anti-doble-cita: revalida disponibilidad justo antes de
    // insertar, en vez de confiar en lo que el LLM haya asumido antes. Con
    // staffMember, revalida SOLO contra los eventos de esa persona — que
    // otro miembro del staff esté ocupado a esa hora no debe bloquear esta
    // reserva.
    const freeSlots = await this.checkAvailability(details.start, details.end, details.staffMember);
    const requestedStart = new Date(details.start).getTime();
    const requestedEnd = new Date(details.end).getTime();
    // Comparación numérica, no de strings — dos timestamps ISO 8601 pueden
    // representar el mismo instante en formatos que no ordenan igual como
    // texto (ej. con/sin milisegundos, "Z" vs "+00:00").
    const fits = freeSlots.some(
      (slot) => new Date(slot.start).getTime() <= requestedStart && new Date(slot.end).getTime() >= requestedEnd,
    );
    if (!fits) {
      return {
        ok: false,
        error: details.staffMember ? `${details.staffMember} ya no está disponible en ese horario.` : "El horario solicitado ya no está disponible.",
      };
    }

    const description = [
      details.description,
      details.attendeeName && `Cliente: ${details.attendeeName}`,
      details.attendeeContact && `Contacto: ${details.attendeeContact}`,
      details.staffMember && `Con: ${details.staffMember}`,
    ]
      .filter(Boolean)
      .join("\n");

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: details.staffMember ? `${details.summary} — ${details.staffMember}` : details.summary,
          description,
          start: { dateTime: details.start },
          end: { dateTime: details.end },
          ...(details.staffMember
            ? { extendedProperties: { private: { [STAFF_PROPERTY_KEY]: details.staffMember } } }
            : {}),
        }),
      },
    );
    const data = (await res.json().catch(() => null)) as GoogleEventInsertResponse | null;
    if (!res.ok || !data?.id) {
      return { ok: false, error: data?.error?.message ?? `Google events.insert falló: ${res.status}` };
    }
    return { ok: true, eventId: data.id };
  }
}

// Calcula los huecos libres dentro de [rangeStart, rangeEnd] a partir de los
// períodos ocupados que devuelve Google (ya vienen ordenados por freeBusy,
// o por events.list con orderBy=startTime en el caso de un staffMember).
export function invertBusyToFreeSlots(
  rangeStart: string,
  rangeEnd: string,
  busy: { start: string; end: string }[],
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  let cursor = rangeStart;
  for (const period of busy) {
    if (period.start > cursor) {
      slots.push({ start: cursor, end: period.start });
    }
    if (period.end > cursor) {
      cursor = period.end;
    }
  }
  if (cursor < rangeEnd) {
    slots.push({ start: cursor, end: rangeEnd });
  }
  return slots;
}
