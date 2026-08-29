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
}

export interface BookAppointmentResult {
  ok: boolean;
  eventId?: string;
  error?: string;
}

export interface CalendarProvider {
  checkAvailability(rangeStart: string, rangeEnd: string): Promise<TimeSlot[]>;
  bookAppointment(details: AppointmentDetails): Promise<BookAppointmentResult>;
}
