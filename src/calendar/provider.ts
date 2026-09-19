// D5-style: interfaz desacoplada del proveedor de calendario. Google es el
// primero (Fase A/B, Etapa 10); Outlook se agrega después como otro
// adaptador que implemente esto, sin tocar el core.
export interface TimeSlot {
  start: string; // ISO 8601
  end: string; // ISO 8601
}

export interface AppointmentDetails {
  start: string; // ISO 8601
  end: string; // ISO 8601
  summary: string;
  description?: string;
  attendeeName?: string;
  attendeeContact?: string;
  // Backlog de Agencia (padel: reservas de cancha/clases): opcional — solo
  // si el cliente da su correo, se le agrega como asistente del evento real
  // de Google Calendar y Google le manda la invitación a su bandeja
  // (sendUpdates=all). Sin correo, la cita se agenda exactamente igual que
  // siempre — no es un requisito nuevo para verticales que no lo pidan.
  attendeeEmail?: string;
  // Agencia (Fase 2, agendar con persona específica): opcional a propósito
  // — un tenant sin staff configurado nunca manda esto, cero cambio de
  // comportamiento. Cuando viene, se guarda como etiqueta del evento (no
  // como un calendario aparte) para poder filtrar disponibilidad por
  // persona más adelante.
  staffMember?: string;
}

export interface BookAppointmentResult {
  ok: boolean;
  eventId?: string;
  error?: string;
}

export interface CalendarProvider {
  // staffMember opcional: sin él, disponibilidad de TODO el calendario
  // (comportamiento de siempre). Con él, disponibilidad de ESA persona
  // específica únicamente (sus propios eventos etiquetados vs. horario de
  // atención) — dos personas distintas pueden estar ocupadas al mismo
  // tiempo sin bloquearse entre sí, como sillas independientes en una
  // barbería.
  checkAvailability(rangeStart: string, rangeEnd: string, staffMember?: string): Promise<TimeSlot[]>;
  bookAppointment(details: AppointmentDetails): Promise<BookAppointmentResult>;
}
