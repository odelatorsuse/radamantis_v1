import { describe, expect, it } from "vitest";
import { buildMessages } from "../src/llm/provider";

describe("buildMessages", () => {
  it("antepone el prompt de sistema y agrega el mensaje del usuario al final", () => {
    expect(buildMessages("eres un bot", [], "hola")).toEqual([
      { role: "system", content: "eres un bot" },
      { role: "user", content: "hola" },
    ]);
  });

  it("intercala el historial entre el prompt de sistema y el mensaje nuevo", () => {
    const history = [
      { role: "user" as const, content: "primer mensaje" },
      { role: "assistant" as const, content: "primera respuesta" },
    ];
    expect(buildMessages("eres un bot", history, "segundo mensaje")).toEqual([
      { role: "system", content: "eres un bot" },
      { role: "user", content: "primer mensaje" },
      { role: "assistant", content: "primera respuesta" },
      { role: "user", content: "segundo mensaje" },
    ]);
  });
});
