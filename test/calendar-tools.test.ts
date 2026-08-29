import { describe, expect, it, vi } from "vitest";
import { executeCalendarTool } from "../src/calendar/tools";
import type { CalendarProvider } from "../src/calendar/provider";
import type { WeeklyBusinessHours } from "../src/calendar/businessHours";

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
    });
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
});
