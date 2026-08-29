import { describe, expect, it, vi } from "vitest";
import {
  buildNoShowMessage,
  getDueNoShowFollowups,
  markNoShowFollowupSent,
  recordAppointmentFromToolCall,
  type DueAppointment,
} from "../src/calendar/appointments";

function mockDb() {
  const run = vi.fn().mockResolvedValue({ success: true });
  const all = vi.fn().mockResolvedValue({ results: [] });
  const first = vi.fn().mockResolvedValue(null);
  const bind = vi.fn().mockReturnValue({ run, all, first });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { db: { prepare } as unknown as D1Database, prepare, bind, run, all, first };
}

const ref = { tenantId: "vet-ch", channel: "telegram", chatId: "555" };

describe("recordAppointmentFromToolCall", () => {
  it("inserta la cita cuando el booking fue exitoso", async () => {
    const { db, prepare, bind } = mockDb();
    await recordAppointmentFromToolCall(
      db,
      ref,
      JSON.stringify({ start: "2026-09-01T10:00:00", end: "2026-09-01T10:30:00", summary: "Consulta", attendeeName: "Oscar", attendeeContact: "555-0000" }),
      JSON.stringify({ ok: true, eventId: "evt-1" }),
      "America/Mexico_City",
    );
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO appointments"));
    expect(bind).toHaveBeenCalledWith(
      "vet-ch",
      "telegram",
      "555",
      "2026-09-01T16:00:00.000Z",
      "2026-09-01T16:30:00.000Z",
      "Consulta",
      "Oscar",
      "555-0000",
      "evt-1",
    );
  });

  it("no inserta nada si el resultado fue ok:false", async () => {
    const { db, prepare } = mockDb();
    await recordAppointmentFromToolCall(
      db,
      ref,
      JSON.stringify({ start: "2026-09-01T10:00:00", end: "2026-09-01T10:30:00", summary: "Consulta", attendeeName: "Oscar", attendeeContact: "555-0000" }),
      JSON.stringify({ ok: false, error: "fuera de horario" }),
      "America/Mexico_City",
    );
    expect(prepare).not.toHaveBeenCalled();
  });

  it("no lanza si el JSON de argumentos o resultado es inválido", async () => {
    const { db, prepare } = mockDb();
    await expect(recordAppointmentFromToolCall(db, ref, "{not json", "{not json either", "UTC")).resolves.toBeUndefined();
    expect(prepare).not.toHaveBeenCalled();
  });

  it("no inserta si faltan campos requeridos en los argumentos", async () => {
    const { db, prepare } = mockDb();
    await recordAppointmentFromToolCall(
      db,
      ref,
      JSON.stringify({ start: "2026-09-01T10:00:00", end: "2026-09-01T10:30:00" }),
      JSON.stringify({ ok: true, eventId: "evt-1" }),
      "UTC",
    );
    expect(prepare).not.toHaveBeenCalled();
  });
});

describe("getDueNoShowFollowups", () => {
  it("consulta citas con end_utc antes del cutoff (con margen) y sin seguimiento previo", async () => {
    const { db, prepare, bind } = mockDb();
    const now = new Date("2026-09-01T12:00:00Z");
    await getDueNoShowFollowups(db, now);
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("no_show_followup_sent_at IS NULL"));
    // 30 min de margen (GRACE_PERIOD_MS) antes de "ahora".
    expect(bind).toHaveBeenCalledWith("2026-09-01T11:30:00.000Z");
  });

  it("mapea las filas de snake_case a camelCase", async () => {
    const { db, all } = mockDb();
    all.mockResolvedValue({
      results: [
        {
          id: 1,
          tenant_id: "vet-ch",
          channel: "telegram",
          chat_id: "555",
          start_utc: "2026-09-01T10:00:00.000Z",
          end_utc: "2026-09-01T10:30:00.000Z",
          summary: "Consulta",
          attendee_name: "Oscar",
          attendee_contact: "555-0000",
        },
      ],
    });
    const result = await getDueNoShowFollowups(db, new Date("2026-09-01T12:00:00Z"));
    expect(result).toEqual([
      {
        id: 1,
        tenantId: "vet-ch",
        channel: "telegram",
        chatId: "555",
        startUtc: "2026-09-01T10:00:00.000Z",
        endUtc: "2026-09-01T10:30:00.000Z",
        summary: "Consulta",
        attendeeName: "Oscar",
        attendeeContact: "555-0000",
      },
    ]);
  });
});

describe("markNoShowFollowupSent", () => {
  it("actualiza no_show_followup_sent_at por id", async () => {
    const { db, prepare, bind } = mockDb();
    await markNoShowFollowupSent(db, 42);
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("UPDATE appointments SET no_show_followup_sent_at"));
    expect(bind).toHaveBeenCalledWith(42);
  });
});

describe("buildNoShowMessage", () => {
  it("arma el mensaje con la hora local correcta, no la UTC", () => {
    const appt: DueAppointment = {
      id: 1,
      tenantId: "vet-ch",
      channel: "telegram",
      chatId: "555",
      startUtc: "2026-09-01T16:00:00.000Z",
      endUtc: "2026-09-01T16:30:00.000Z",
      summary: "Consulta general - Firulais",
      attendeeName: "Oscar",
      attendeeContact: "555-0000",
    };
    const message = buildNoShowMessage("Dr. Vet CH", appt, "America/Mexico_City");
    expect(message).toContain("Oscar");
    expect(message).toContain("Dr. Vet CH");
    expect(message).toContain("2026-09-01");
    expect(message).toContain("10:00"); // 16:00 UTC = 10:00 en Ciudad de México
    expect(message).toContain("Consulta general - Firulais");
  });
});
