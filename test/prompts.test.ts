import { describe, expect, it } from "vitest";
import { buildRagSystemPrompt } from "../src/prompts";

describe("buildRagSystemPrompt", () => {
  it("incluye los matches relevantes como contexto numerado", () => {
    const prompt = buildRagSystemPrompt([
      { content: "Horario: lunes a viernes 9 a 18.", score: 0.9 },
      { content: "Precio de consulta: $350 MXN.", score: 0.8 },
    ]);
    expect(prompt).toContain("[1] Horario: lunes a viernes 9 a 18.");
    expect(prompt).toContain("[2] Precio de consulta: $350 MXN.");
  });

  it("descarta matches por debajo del umbral de relevancia", () => {
    const prompt = buildRagSystemPrompt([{ content: "dato irrelevante", score: 0.1 }]);
    expect(prompt).not.toContain("dato irrelevante");
    expect(prompt).toContain("sin resultados relevantes");
  });

  it("indica que no hay contexto cuando no hay matches", () => {
    const prompt = buildRagSystemPrompt([]);
    expect(prompt).toContain("sin resultados relevantes");
    expect(prompt).toContain("nunca inventes");
  });
});
