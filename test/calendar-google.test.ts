import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleCalendarProvider, invertBusyToFreeSlots } from "../src/calendar/google";

describe("invertBusyToFreeSlots", () => {
  it("calcula los huecos libres entre períodos ocupados", () => {
    const slots = invertBusyToFreeSlots(
      "2026-09-01T09:00:00Z",
      "2026-09-01T18:00:00Z",
      [
        { start: "2026-09-01T10:00:00Z", end: "2026-09-01T11:00:00Z" },
        { start: "2026-09-01T14:00:00Z", end: "2026-09-01T15:00:00Z" },
      ],
    );

    expect(slots).toEqual([
      { start: "2026-09-01T09:00:00Z", end: "2026-09-01T10:00:00Z" },
      { start: "2026-09-01T11:00:00Z", end: "2026-09-01T14:00:00Z" },
      { start: "2026-09-01T15:00:00Z", end: "2026-09-01T18:00:00Z" },
    ]);
  });

  it("devuelve todo el rango libre si no hay ocupados", () => {
    const slots = invertBusyToFreeSlots("2026-09-01T09:00:00Z", "2026-09-01T18:00:00Z", []);
    expect(slots).toEqual([{ start: "2026-09-01T09:00:00Z", end: "2026-09-01T18:00:00Z" }]);
  });

  it("no deja hueco si el ocupado cubre todo el rango", () => {
    const slots = invertBusyToFreeSlots(
      "2026-09-01T09:00:00Z",
      "2026-09-01T18:00:00Z",
      [{ start: "2026-09-01T09:00:00Z", end: "2026-09-01T18:00:00Z" }],
    );
    expect(slots).toEqual([]);
  });
});

describe("GoogleCalendarProvider.bookAppointment", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rechaza agendar si el horario ya no está libre (blindaje anti-doble-cita)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ calendars: { primary: { busy: [{ start: "2026-09-01T10:00:00Z", end: "2026-09-01T11:00:00Z" }] } } }),
      }),
    );
    const provider = new GoogleCalendarProvider("token", "primary");

    const result = await provider.bookAppointment({
      start: "2026-09-01T10:00:00Z",
      end: "2026-09-01T10:30:00Z",
      summary: "Consulta",
    });

    expect(result).toEqual({ ok: false, error: "El horario solicitado ya no está disponible." });
  });

  it("agenda el evento cuando el horario está libre", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ calendars: { primary: { busy: [] } } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "evt-123" }) });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GoogleCalendarProvider("token", "primary");

    const result = await provider.bookAppointment({
      start: "2026-09-01T10:00:00Z",
      end: "2026-09-01T10:30:00Z",
      summary: "Consulta",
      attendeeName: "Oscar",
    });

    expect(result).toEqual({ ok: true, eventId: "evt-123" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
