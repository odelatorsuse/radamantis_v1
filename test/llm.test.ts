import { describe, expect, it } from "vitest";
import { buildMessages } from "../src/llm/provider";

describe("buildMessages", () => {
  it("antepone el prompt de sistema al mensaje del usuario", () => {
    expect(buildMessages("eres un bot", "hola")).toEqual([
      { role: "system", content: "eres un bot" },
      { role: "user", content: "hola" },
    ]);
  });
});
