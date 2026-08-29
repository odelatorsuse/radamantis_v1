import { describe, expect, it, vi } from "vitest";
import { appendMessage, getHistory } from "../src/messages";

const ref = { tenantId: "sandbox", channel: "telegram", chatId: "42" };

describe("getHistory", () => {
  it("devuelve el historial en orden cronológico (la query trae más reciente primero)", async () => {
    const all = vi.fn().mockResolvedValue({
      results: [
        { role: "assistant", content: "segunda respuesta" },
        { role: "user", content: "segundo mensaje" },
        { role: "assistant", content: "primera respuesta" },
        { role: "user", content: "primer mensaje" },
      ],
    });
    const bind = vi.fn().mockReturnValue({ all });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    const history = await getHistory(db, ref, 4);

    expect(bind).toHaveBeenCalledWith("sandbox", "telegram", "42", 4);
    expect(history).toEqual([
      { role: "user", content: "primer mensaje" },
      { role: "assistant", content: "primera respuesta" },
      { role: "user", content: "segundo mensaje" },
      { role: "assistant", content: "segunda respuesta" },
    ]);
  });
});

describe("appendMessage", () => {
  it("inserta el mensaje con tenant_id, canal y chat_id, sent_by null por default", async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const bind = vi.fn().mockReturnValue({ run });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    await appendMessage(db, ref, { role: "user", content: "hola" });

    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO messages"));
    expect(bind).toHaveBeenCalledWith("sandbox", "telegram", "42", "user", "hola", null);
    expect(run).toHaveBeenCalled();
  });

  it("guarda sentBy cuando el mensaje lo trae (respuesta manual desde la consola)", async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const bind = vi.fn().mockReturnValue({ run });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    await appendMessage(db, ref, { role: "assistant", content: "hola desde el negocio", sentBy: "human" });

    expect(bind).toHaveBeenCalledWith("sandbox", "telegram", "42", "assistant", "hola desde el negocio", "human");
  });
});
