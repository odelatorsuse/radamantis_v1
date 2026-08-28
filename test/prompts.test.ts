import { describe, expect, it } from "vitest";
import { buildSystemPrompt, CORE_ANTI_INVENTION_RULES } from "../src/prompts";

describe("buildSystemPrompt", () => {
  it("incluye siempre las reglas CORE anti-invento, con o sin matches (Etapa 6)", () => {
    expect(buildSystemPrompt("prompt base", [])).toContain(CORE_ANTI_INVENTION_RULES);
    expect(buildSystemPrompt("prompt base", [{ content: "algo", score: 0.9 }])).toContain(
      CORE_ANTI_INVENTION_RULES,
    );
  });

  it("usa el promptBase del Vertical Template, no un texto fijo (Etapa 7)", () => {
    const prompt = buildSystemPrompt("Eres el asistente de una peluquería canina.", []);
    expect(prompt).toContain("Eres el asistente de una peluquería canina.");
  });

  it("incluye los matches relevantes como contexto numerado", () => {
    const prompt = buildSystemPrompt("prompt base", [
      { content: "Horario: lunes a viernes 9 a 18.", score: 0.9 },
      { content: "Precio de consulta: $350 MXN.", score: 0.8 },
    ]);
    expect(prompt).toContain("[1] Horario: lunes a viernes 9 a 18.");
    expect(prompt).toContain("[2] Precio de consulta: $350 MXN.");
  });

  it("descarta matches por debajo del umbral de relevancia", () => {
    const prompt = buildSystemPrompt("prompt base", [{ content: "dato irrelevante", score: 0.1 }]);
    expect(prompt).not.toContain("dato irrelevante");
    expect(prompt).toContain("sin resultados relevantes");
  });

  it("indica que no hay contexto cuando la KB no tiene matches", () => {
    const prompt = buildSystemPrompt("prompt base", []);
    expect(prompt).toContain("sin resultados relevantes");
  });

  it("no menciona la base de conocimiento cuando el vertical no tiene searchKb (kbMatches null)", () => {
    const prompt = buildSystemPrompt("prompt base", null);
    expect(prompt).not.toContain("base de conocimiento");
    expect(prompt).toContain(CORE_ANTI_INVENTION_RULES);
  });
});
