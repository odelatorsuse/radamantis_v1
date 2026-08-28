import { describe, expect, it } from "vitest";
import { extractIncomingMessage } from "../src/telegram";

describe("extractIncomingMessage", () => {
  it("extrae chatId y texto de un update válido", () => {
    const update = {
      update_id: 1,
      message: { message_id: 1, chat: { id: 42 }, text: "hola" },
    };
    expect(extractIncomingMessage(update)).toEqual({ chatId: 42, text: "hola" });
  });

  it("devuelve null si el update no tiene mensaje", () => {
    expect(extractIncomingMessage({ update_id: 1 })).toBeNull();
  });

  it("devuelve null si el mensaje no tiene texto (ej. foto, sticker)", () => {
    const update = {
      update_id: 1,
      message: { message_id: 1, chat: { id: 42 } },
    };
    expect(extractIncomingMessage(update)).toBeNull();
  });
});
