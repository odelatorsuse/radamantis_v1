import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../src/prompts";
import { getVerticalTemplate } from "../src/verticals/registry";

// D6, prueba de aceptación de Etapa 7: dos verticales con distinto
// comportamiento (uno con KB+handoff, otro sin ninguno) conviven sin que
// agent.ts/index.ts/prompts.ts necesiten saber de ninguno de los dos.
describe("getVerticalTemplate", () => {
  it("devuelve el template de veterinaria con searchKb y handoffHuman habilitados", () => {
    const template = getVerticalTemplate("veterinaria");
    expect(template.verticalId).toBe("veterinaria");
    expect(template.toolsEnabled).toContain("searchKb");
    expect(template.toolsEnabled).toContain("handoffHuman");
  });

  it("devuelve el template sandbox sin searchKb ni handoffHuman", () => {
    const template = getVerticalTemplate("sandbox");
    expect(template.verticalId).toBe("sandbox");
    expect(template.toolsEnabled).not.toContain("searchKb");
    expect(template.toolsEnabled).not.toContain("handoffHuman");
  });

  it("cae de vuelta a sandbox si el vertical_id no está registrado", () => {
    expect(getVerticalTemplate("giro-inexistente")).toEqual(getVerticalTemplate("sandbox"));
  });

  it("el promptBase de cada vertical es distinto y se refleja en el system prompt", () => {
    const vetPrompt = buildSystemPrompt(getVerticalTemplate("veterinaria").promptBase, []);
    const sandboxPrompt = buildSystemPrompt(getVerticalTemplate("sandbox").promptBase, null);

    expect(vetPrompt).toContain("veterinaria");
    expect(sandboxPrompt).not.toContain("veterinaria");
  });
});
