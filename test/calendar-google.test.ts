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

describe("GoogleCalendarProvider.checkAvailability con staffMember (Agencia, Fase 2)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("usa events.list con privateExtendedProperty en vez de freeBusy.query cuando se pasa staffMember", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ start: { dateTime: "2026-09-01T10:00:00Z" }, end: { dateTime: "2026-09-01T11:00:00Z" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GoogleCalendarProvider("token", "primary");

    const slots = await provider.checkAvailability("2026-09-01T09:00:00Z", "2026-09-01T18:00:00Z", "Ana");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/events?");
    expect(url).toContain("privateExtendedProperty=radamantisStaffMember%3DAna");
    expect(url).toContain("singleEvents=true");
    expect(url).toContain("orderBy=startTime");
    expect(slots).toEqual([
      { start: "2026-09-01T09:00:00Z", end: "2026-09-01T10:00:00Z" },
      { start: "2026-09-01T11:00:00Z", end: "2026-09-01T18:00:00Z" },
    ]);
  });

  it("sin staffMember sigue usando freeBusy.query (comportamiento de siempre)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ calendars: { primary: { busy: [] } } }) });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GoogleCalendarProvider("token", "primary");

    await provider.checkAvailability("2026-09-01T09:00:00Z", "2026-09-01T18:00:00Z");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("freeBusy");
  });
});

describe("GoogleCalendarProvider.bookAppointment con staffMember (Agencia, Fase 2)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("etiqueta el evento con extendedProperties.private y revalida SOLO contra ese staff", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) }) // revalidación staff-aware
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "evt-456" }) }); // events.insert
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GoogleCalendarProvider("token", "primary");

    const result = await provider.bookAppointment({
      start: "2026-09-01T10:00:00Z",
      end: "2026-09-01T10:30:00Z",
      summary: "Corte",
      attendeeName: "Oscar",
      staffMember: "Ana",
    });

    expect(result).toEqual({ ok: true, eventId: "evt-456" });
    const [revalidateUrl] = fetchMock.mock.calls[0];
    expect(revalidateUrl).toContain("privateExtendedProperty=radamantisStaffMember%3DAna");
    const [, insertInit] = fetchMock.mock.calls[1];
    const insertBody = JSON.parse(insertInit.body as string);
    expect(insertBody.extendedProperties).toEqual({ private: { radamantisStaffMember: "Ana" } });
    expect(insertBody.summary).toBe("Corte — Ana");
  });

  it("un staff distinto ocupado a esa hora no bloquea la reserva (sillas independientes)", async () => {
    // Si internamente revalidara contra freeBusy del calendario completo en
    // vez de solo los eventos de "Ana", esto fallaría — otro barbero
    // ocupado no debe impedir agendar con Ana.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "evt-789" }) });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GoogleCalendarProvider("token", "primary");

    const result = await provider.bookAppointment({
      start: "2026-09-01T10:00:00Z",
      end: "2026-09-01T10:30:00Z",
      summary: "Corte",
      staffMember: "Ana",
    });

    expect(result.ok).toBe(true);
  });
});
