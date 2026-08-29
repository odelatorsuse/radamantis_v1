import { describe, expect, it } from "vitest";
import { getCurrentLocalDateTimeString, localToUtcISOString, normalizeToUtcISOString, utcToLocalDateTimeString, weekdayNameEs } from "../src/calendar/timezone";

describe("localToUtcISOString", () => {
  it("convierte hora local de Ciudad de México (UTC-6) a UTC correctamente", () => {
    // Este es exactamente el bug real: "13:30" local se agendó como "12:30"
    // porque el LLM restaba mal el offset. La conversión correcta es +6h.
    expect(localToUtcISOString("2026-08-30T13:30:00", "America/Mexico_City")).toBe("2026-08-30T19:30:00.000Z");
  });

  it("con UTC como zona, es una conversión directa (sin offset)", () => {
    expect(localToUtcISOString("2026-08-30T13:30:00", "UTC")).toBe("2026-08-30T13:30:00.000Z");
  });

  it("maneja correctamente el cruce de medianoche", () => {
    // 20:00 en Ciudad de México (UTC-6) es 02:00 del día siguiente en UTC.
    expect(localToUtcISOString("2026-08-30T20:00:00", "America/Mexico_City")).toBe("2026-08-31T02:00:00.000Z");
  });
});

describe("normalizeToUtcISOString", () => {
  it("respeta un valor que ya trae Z, sin tratarlo como hora local", () => {
    expect(normalizeToUtcISOString("2026-08-30T19:30:00Z", "America/Mexico_City")).toBe("2026-08-30T19:30:00.000Z");
  });

  it("interpreta como hora local si no trae offset", () => {
    expect(normalizeToUtcISOString("2026-08-30T13:30:00", "America/Mexico_City")).toBe("2026-08-30T19:30:00.000Z");
  });
});

describe("utcToLocalDateTimeString", () => {
  it("es la inversa de localToUtcISOString", () => {
    expect(utcToLocalDateTimeString("2026-08-30T19:30:00.000Z", "America/Mexico_City")).toBe("2026-08-30T13:30:00");
  });
});

describe("getCurrentLocalDateTimeString", () => {
  it("devuelve un string con el formato YYYY-MM-DDTHH:MM:SS", () => {
    expect(getCurrentLocalDateTimeString("America/Mexico_City")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });
});

describe("weekdayNameEs", () => {
  // Bug real: sin decirle al modelo qué día de la semana es "hoy", calculó
  // mal cuál era "el próximo lunes" y hasta afirmó que un lunes futuro ya
  // había pasado. Días verificados con getUTCDay() forzando UTC (mismas
  // fechas que test/calendar-tools.test.ts): 2026-08-28 = viernes,
  // 2026-09-01 = martes, 2026-09-06 = domingo, 2026-09-07 = lunes.
  it("calcula el día de la semana en español a partir de una fecha local", () => {
    expect(weekdayNameEs("2026-08-28T10:00:00")).toBe("viernes");
    expect(weekdayNameEs("2026-09-01T00:00:00")).toBe("martes");
    expect(weekdayNameEs("2026-09-06T23:59:00")).toBe("domingo");
    expect(weekdayNameEs("2026-09-07T00:00:00")).toBe("lunes");
  });
});
