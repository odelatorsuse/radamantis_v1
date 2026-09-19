import { describe, expect, it, vi } from "vitest";
import { buildCalendarTools, CALENDAR_TOOLS, executeCalendarTool } from "../src/calendar/tools";
import type { CalendarProvider } from "../src/calendar/provider";
import type { WeeklyBusinessHours } from "../src/calendar/businessHours";

describe("buildCalendarTools", () => {
  it("sin staff, devuelve exactamente CALENDAR_TOOLS (cero cambio de comportamiento)", () => {
    expect(buildCalendarTools([])).toBe(CALENDAR_TOOLS);
  });

  it("con staff, agrega staffMember opcional a checkAvailability y obligatorio a bookAppointment", () => {
    const [checkAvailability, bookAppointment] = buildCalendarTools(["Ana", "Carlos"]);

    const checkParams = checkAvailability.parameters as { properties: Record<string, unknown>; required: string[] };
    expect(checkParams.properties.staffMember).toEqual({
      type: "string",
      description: expect.any(String),
      enum: ["Ana", "Carlos"],
    });
    expect(checkParams.required).not.toContain("staffMember");

    const bookParams = bookAppointment.parameters as { properties: Record<string, unknown>; required: string[] };
    expect(bookParams.properties.staffMember).toBeDefined();
    expect(bookParams.required).toContain("staffMember");
  });
});

// Días de la semana verificados con getUTCDay() forzando UTC (¡Intl/toLocaleDateString
// sin timeZone:'UTC' explícito da el día equivocado según la zona de la máquina —
// el mismo tipo de bug que se está probando aquí!): 2026-09-01 = martes,
// 2026-09-05 = sábado, 2026-09-06 = domingo, 2026-09-07 = lunes.
const weekdayHours = { start: "09:00", end: "18:00" };
const businessHours: WeeklyBusinessHours = {
  mon: weekdayHours,
  tue: weekdayHours,
  wed: weekdayHours,
  thu: weekdayHours,
  fri: weekdayHours,
  sat: { start: "09:00", end: "13:00" },
  sun: null,
};

function mockProvider(): CalendarProvider {
  return {
    // El calendario está "vacío" todo el día — un solo hueco libre de 00:00
    // a 23:59:59, para probar que el recorte por día de la semana funciona
    // sin depender de eventos reales.
    checkAvailability: vi.fn().mockResolvedValue([{ start: "2026-09-01T00:00:00.000Z", end: "2026-09-01T23:59:59.000Z" }]),
    bookAppointment: vi.fn().mockResolvedValue({ ok: true, eventId: "evt-1" }),
  };
}

const clientArgs = { attendeeName: "Oscar", attendeeContact: "555-0000" };

describe("executeCalendarTool — checkAvailability", () => {
  it("recorta los huecos libres al horario de atención de ESE día de la semana (Etapa 10 — bug real: no filtraba)", async () => {
    const provider = mockProvider();
    const result = await executeCalendarTool(
      "checkAvailability",
      JSON.stringify({ rangeStart: "2026-09-01T00:00:00", rangeEnd: "2026-09-01T23:59:59" }),
      provider,
      "UTC",
      businessHours,
    );

    // 2026-09-01 es martes → 09:00-18:00, no el rango completo del día.
    expect(JSON.parse(result)).toEqual({
      freeSlots: [{ start: "2026-09-01T09:00:00", end: "2026-09-01T18:00:00" }],
      timezone: "UTC",
      staffMember: null,
    });
  });
});

describe("executeCalendarTool — staffMember (Agencia, Fase 2)", () => {
  it("pasa staffMember al provider y lo refleja en el resultado", async () => {
    const provider = mockProvider();
    const result = await executeCalendarTool(
      "checkAvailability",
      JSON.stringify({ rangeStart: "2026-09-01T00:00:00", rangeEnd: "2026-09-01T23:59:59", staffMember: "Ana" }),
      provider,
      "UTC",
      businessHours,
      ["Ana", "Carlos"],
    );
    expect(provider.checkAvailability).toHaveBeenCalledWith(expect.any(String), expect.any(String), "Ana");
    expect(JSON.parse(result).staffMember).toBe("Ana");
  });

  it("rechaza un staffMember que no está en la lista configurada del tenant", async () => {
    const provider = mockProvider();
    const result = await executeCalendarTool(
      "checkAvailability",
      JSON.stringify({ rangeStart: "2026-09-01T00:00:00", rangeEnd: "2026-09-01T23:59:59", staffMember: "Inventado" }),
      provider,
      "UTC",
      businessHours,
      ["Ana", "Carlos"],
    );
    expect(JSON.parse(result).error).toContain("Inventado");
  });

  it("bookAppointment exige staffMember si el tenant tiene staff configurado", async () => {
    const provider = mockProvider();
    const result = await executeCalendarTool(
      "bookAppointment",
      JSON.stringify({ start: "2026-09-01T13:30:00", end: "2026-09-01T14:00:00", summary: "Corte", ...clientArgs }),
      provider,
      "America/Mexico_City",
      businessHours,
      ["Ana", "Carlos"],
    );
    expect(JSON.parse(result)).toEqual({ error: "Falta staffMember — este negocio requiere saber con quién es la cita." });
  });

  it("bookAppointment funciona sin staffMember cuando el tenant no tiene staff configurado", async () => {
    const provider = mockProvider();
    await executeCalendarTool(
      "bookAppointment",
      JSON.stringify({ start: "2026-09-01T13:30:00", end: "2026-09-01T14:00:00", summary: "Corte", ...clientArgs }),
      provider,
      "America/Mexico_City",
      businessHours,
    );
    expect(provider.bookAppointment).toHaveBeenCalled();
  });
});

describe("executeCalendarTool — bookAppointment", () => {
  it("convierte hora local del negocio a UTC correctamente (Etapa 10 — bug real: agendaba 1h corrida)", async () => {
    const provider = mockProvider();
    // America/Mexico_City es UTC-6 (sin horario de verano desde 2022) — "13:30"
    // local debe traducirse a "19:30" UTC, no quedarse tal cual ni desfasarse.
    await executeCalendarTool(
      "bookAppointment",
      JSON.stringify({ start: "2026-09-01T13:30:00", end: "2026-09-01T14:00:00", summary: "Consulta", ...clientArgs }),
      provider,
      "America/Mexico_City",
      businessHours,
    );

    expect(provider.bookAppointment).toHaveBeenCalledWith({
      start: "2026-09-01T19:30:00.000Z",
      end: "2026-09-01T20:00:00.000Z",
      summary: "Consulta",
      attendeeName: "Oscar",
      attendeeContact: "555-0000",
    });
  });

  // Backlog de Agencia (padel: reservas de cancha/clases) — el correo del
  // cliente, cuando lo da, se pasa tal cual al proveedor para que agende
  // la invitación real de calendario.
  it("pasa attendeeEmail al provider cuando el cliente lo dio", async () => {
    const provider = mockProvider();
    await executeCalendarTool(
      "bookAppointment",
      JSON.stringify({ start: "2026-09-01T13:30:00", end: "2026-09-01T14:00:00", summary: "Reserva de cancha", ...clientArgs, attendeeEmail: "cliente@example.com" }),
      provider,
      "America/Mexico_City",
      businessHours,
    );

    expect(provider.bookAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ attendeeEmail: "cliente@example.com" }),
    );
  });

  it("respeta un valor ya en UTC (con Z) sin reinterpretarlo como hora local", async () => {
    const provider = mockProvider();
    await executeCalendarTool(
      "bookAppointment",
      JSON.stringify({ start: "2026-09-01T19:30:00Z", end: "2026-09-01T20:00:00Z", summary: "Consulta", ...clientArgs }),
      provider,
      "America/Mexico_City",
      businessHours,
    );

    expect(provider.bookAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ start: "2026-09-01T19:30:00.000Z", end: "2026-09-01T20:00:00.000Z" }),
    );
  });

  it("rechaza agendar fuera del horario de un día abierto, sin llamar a Google", async () => {
    const provider = mockProvider();
    // Martes cierra a las 18:00 — 20:00 está fuera de horario ese día.
    const result = await executeCalendarTool(
      "bookAppointment",
      JSON.stringify({ start: "2026-09-01T20:00:00", end: "2026-09-01T20:30:00", summary: "Consulta", ...clientArgs }),
      provider,
      "America/Mexico_City",
      businessHours,
    );

    expect(provider.bookAppointment).not.toHaveBeenCalled();
    expect(JSON.parse(result)).toEqual({ ok: false, error: "Ese horario está fuera de nuestro horario de atención ese día (09:00 a 18:00)." });
  });

  it("rechaza agendar un día completamente cerrado (Etapa 10 — bug real: sábado 13:00 se dejó pasar con horario plano)", async () => {
    const provider = mockProvider();
    // 2026-09-06 es domingo, día cerrado.
    const result = await executeCalendarTool(
      "bookAppointment",
      JSON.stringify({ start: "2026-09-06T10:00:00", end: "2026-09-06T10:30:00", summary: "Consulta", ...clientArgs }),
      provider,
      "America/Mexico_City",
      businessHours,
    );

    expect(provider.bookAppointment).not.toHaveBeenCalled();
    expect(JSON.parse(result)).toEqual({ ok: false, error: "Ese día no abrimos." });
  });

  it("respeta el horario más corto de sábado (Etapa 10 — bug real: sábado 13:00 se agendó como si fuera horario normal)", async () => {
    const provider = mockProvider();
    // 2026-09-05 es sábado, cierra a las 13:00 — pedir 13:00-13:30 debe rechazarse.
    const result = await executeCalendarTool(
      "bookAppointment",
      JSON.stringify({ start: "2026-09-05T13:00:00", end: "2026-09-05T13:30:00", summary: "Consulta", ...clientArgs }),
      provider,
      "America/Mexico_City",
      businessHours,
    );

    expect(provider.bookAppointment).not.toHaveBeenCalled();
    expect(JSON.parse(result)).toEqual({ ok: false, error: "Ese horario está fuera de nuestro horario de atención ese día (09:00 a 13:00)." });
  });

  it("no agenda si faltan nombre o contacto del cliente", async () => {
    const provider = mockProvider();
    const result = await executeCalendarTool(
      "bookAppointment",
      JSON.stringify({ start: "2026-09-01T10:00:00", end: "2026-09-01T10:30:00", summary: "Consulta" }),
      provider,
      "America/Mexico_City",
      businessHours,
    );

    expect(provider.bookAppointment).not.toHaveBeenCalled();
    expect(JSON.parse(result).error).toContain("bookAppointment");
  });
});

describe("executeCalendarTool — casos de error", () => {
  it("devuelve un error serializado si el JSON de argumentos es inválido", async () => {
    const result = await executeCalendarTool("checkAvailability", "{not json", mockProvider(), "UTC", businessHours);
    expect(JSON.parse(result)).toEqual({ error: "Argumentos inválidos" });
  });

  it("devuelve un error si faltan argumentos requeridos", async () => {
    const result = await executeCalendarTool(
      "checkAvailability",
      JSON.stringify({ rangeStart: "x" }),
      mockProvider(),
      "UTC",
      businessHours,
    );
    expect(JSON.parse(result).error).toContain("checkAvailability");
  });

  it("rechaza un rango degenerado (rangeStart == rangeEnd) sin llamar al proveedor (Etapa 10 — bug real: tumbaba toda la petición)", async () => {
    const provider = mockProvider();
    const result = await executeCalendarTool(
      "checkAvailability",
      JSON.stringify({ rangeStart: "2026-09-01T12:00:00", rangeEnd: "2026-09-01T12:00:00" }),
      provider,
      "UTC",
      businessHours,
    );
    expect(provider.checkAvailability).not.toHaveBeenCalled();
    expect(JSON.parse(result).error).toContain("rangeStart");
  });

  it("convierte una falla real del proveedor en un resultado de error en vez de propagar la excepción", async () => {
    const provider: CalendarProvider = {
      checkAvailability: vi.fn().mockRejectedValue(new Error("Google freeBusy falló: 400 timeRangeEmpty")),
      bookAppointment: vi.fn(),
    };
    const result = await executeCalendarTool(
      "checkAvailability",
      JSON.stringify({ rangeStart: "2026-09-01T00:00:00", rangeEnd: "2026-09-01T23:59:59" }),
      provider,
      "UTC",
      businessHours,
    );
    expect(JSON.parse(result).error).toContain("Google freeBusy falló");
  });

  it("convierte una falla real del proveedor al agendar en un resultado ok:false en vez de propagar la excepción", async () => {
    const provider: CalendarProvider = {
      checkAvailability: vi.fn().mockResolvedValue([{ start: "2026-09-01T00:00:00.000Z", end: "2026-09-01T23:59:59.000Z" }]),
      bookAppointment: vi.fn().mockRejectedValue(new Error("Google events.insert falló: 500")),
    };
    const result = await executeCalendarTool(
      "bookAppointment",
      JSON.stringify({ start: "2026-09-01T10:00:00", end: "2026-09-01T10:30:00", summary: "Consulta", ...clientArgs }),
      provider,
      "UTC",
      businessHours,
    );
    expect(JSON.parse(result)).toEqual({ ok: false, error: "No se pudo agendar: Google events.insert falló: 500" });
  });
});
