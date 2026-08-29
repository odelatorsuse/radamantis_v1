import { describe, expect, it, vi } from "vitest";
import { extractMentionedDates, formatDateMentionsNote } from "../src/calendar/dateParser";

// "Hoy" simulado: 2026-08-28 es viernes (verificado con getUTCDay() forzando
// UTC — mismo método que test/calendar-tools.test.ts).
const TIMEZONE = "America/Mexico_City";

describe("extractMentionedDates", () => {
  it("resuelve 'hoy' a la fecha local actual", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T20:00:00Z")); // 14:00 en Ciudad de México
    try {
      const result = extractMentionedDates("¿tienen espacio hoy?", TIMEZONE);
      expect(result).toEqual([{ phrase: "hoy", date: "2026-08-28", weekday: "viernes" }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resuelve 'mañana' al día siguiente, no como momento del día", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T20:00:00Z"));
    try {
      expect(extractMentionedDates("¿hay cita mañana?", TIMEZONE)).toEqual([
        { phrase: "mañana", date: "2026-08-29", weekday: "sábado" },
      ]);
      // "esta mañana" y "por/en/de la mañana" son hora del día, no "tomorrow".
      expect(extractMentionedDates("puedo ir esta mañana", TIMEZONE)).toEqual([]);
      expect(extractMentionedDates("prefiero por la mañana", TIMEZONE)).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resuelve 'pasado mañana' a hoy+2, sin confundirlo con 'mañana'", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T20:00:00Z"));
    try {
      expect(extractMentionedDates("cita pasado mañana", TIMEZONE)).toEqual([
        { phrase: "pasado mañana", date: "2026-08-30", weekday: "domingo" },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resuelve un día de la semana a su próxima ocurrencia (bug real: el modelo confundía cuál era 'el próximo lunes')", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T20:00:00Z")); // viernes
    try {
      // "el lunes" desde un viernes = el lunes más cercano hacia adelante (3 días).
      expect(extractMentionedDates("quiero el lunes a las 10", TIMEZONE)).toEqual([
        { phrase: "lunes", date: "2026-08-31", weekday: "lunes" },
      ]);
      // "próximo lunes" da el mismo resultado cuando hoy no es lunes.
      expect(extractMentionedDates("el próximo lunes por favor", TIMEZONE)).toEqual([
        { phrase: "próximo lunes", date: "2026-08-31", weekday: "lunes" },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("'próximo <día de hoy>' salta a la semana siguiente, no es hoy mismo", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T20:00:00Z")); // viernes
    try {
      expect(extractMentionedDates("el próximo viernes", TIMEZONE)).toEqual([
        { phrase: "próximo viernes", date: "2026-09-04", weekday: "viernes" },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resuelve '<día> de <mes>' — bug real: el modelo dijo que el 31 de agosto no existe", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T20:00:00Z"));
    try {
      expect(extractMentionedDates("quiero el 31 de agosto a las 15:00", TIMEZONE)).toEqual([
        { phrase: "31 de agosto", date: "2026-08-31", weekday: "lunes" },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("'<día> de <mes>' sin año, si ya pasó este año, asume el próximo", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T20:00:00Z"));
    try {
      expect(extractMentionedDates("el 1 de enero quiero una cita", TIMEZONE)).toEqual([
        { phrase: "1 de enero", date: "2027-01-01", weekday: "viernes" },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("respeta el año explícito si se lo dan", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T20:00:00Z"));
    try {
      expect(extractMentionedDates("el 1 de enero de 2026 quiero una cita", TIMEZONE)).toEqual([
        { phrase: "1 de enero de 2026", date: "2026-01-01", weekday: "jueves" },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("no repite la misma fecha si se menciona de más de una forma", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T20:00:00Z"));
    try {
      const result = extractMentionedDates("el lunes 31 de agosto", TIMEZONE);
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe("2026-08-31");
    } finally {
      vi.useRealTimers();
    }
  });

  it("devuelve un arreglo vacío si el mensaje no menciona ninguna fecha", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T20:00:00Z"));
    try {
      expect(extractMentionedDates("¿cuánto cuesta la consulta?", TIMEZONE)).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("formatDateMentionsNote", () => {
  it("devuelve null si no hay fechas mencionadas", () => {
    expect(formatDateMentionsNote([])).toBeNull();
  });

  it("formatea las fechas resueltas para el prompt", () => {
    const note = formatDateMentionsNote([{ phrase: "31 de agosto", date: "2026-08-31", weekday: "lunes" }]);
    expect(note).toContain('"31 de agosto" = 2026-08-31 (lunes)');
  });
});
