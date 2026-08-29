import { describe, expect, it, vi } from "vitest";
import { createHandoff, detectsHandoffRequest, isPaused, resolveHandoffByRef } from "../src/handoff";

const ref = { tenantId: "vet-ch", channel: "telegram", chatId: "42" };

describe("detectsHandoffRequest", () => {
  it("detecta frases explícitas de pedir un humano", () => {
    expect(detectsHandoffRequest("quiero hablar con una persona")).toBe(true);
    expect(detectsHandoffRequest("¿Me puedes pasar con un operador?")).toBe(true);
    expect(detectsHandoffRequest("ES UNA EMERGENCIA, mi perro no respira")).toBe(true);
  });

  it("no dispara con preguntas normales del consultorio", () => {
    expect(detectsHandoffRequest("¿Cuál es el horario de atención?")).toBe(false);
    expect(detectsHandoffRequest("¿Cuánto cuesta la consulta?")).toBe(false);
  });
});

describe("isPaused", () => {
  it("devuelve true si hay un handoff sin resolver", async () => {
    const first = vi.fn().mockResolvedValue({ id: 1 });
    const bind = vi.fn().mockReturnValue({ first });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    expect(await isPaused(db, ref)).toBe(true);
    expect(bind).toHaveBeenCalledWith("vet-ch", "telegram", "42");
  });

  it("devuelve false si no hay handoffs abiertos", async () => {
    const first = vi.fn().mockResolvedValue(null);
    const bind = vi.fn().mockReturnValue({ first });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    expect(await isPaused(db, ref)).toBe(false);
  });
});

describe("createHandoff", () => {
  it("inserta el handoff con tenant_id, canal, chat_id y motivo", async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const bind = vi.fn().mockReturnValue({ run });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    await createHandoff(db, ref, "quiero hablar con una persona");

    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO handoffs"));
    expect(bind).toHaveBeenCalledWith("vet-ch", "telegram", "42", "quiero hablar con una persona");
  });
});

describe("resolveHandoffByRef", () => {
  it("resuelve el handoff abierto por tenant/canal/chat, no por id", async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const bind = vi.fn().mockReturnValue({ run });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    await resolveHandoffByRef(db, ref);

    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("UPDATE handoffs SET resolved_at"));
    expect(bind).toHaveBeenCalledWith("vet-ch", "telegram", "42");
  });
});
