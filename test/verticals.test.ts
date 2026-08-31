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

// Agencia (onboarding de clientes, 12 giros): cada vertical nuevo resuelve
// a su propio template real (no cae de vuelta a sandbox por un typo de id).
describe("verticales nuevos de onboarding", () => {
  const bookingVerticals = ["dentista", "gimnasio", "restaurante", "barberia", "clinica", "spa", "inmobiliaria", "coach"];
  const kbOnlyVerticals = ["cafeteria_panaderia", "tienda", "crm_ventas"];

  it.each(bookingVerticals)("%s tiene checkAvailability/bookAppointment habilitados", (verticalId) => {
    const template = getVerticalTemplate(verticalId);
    expect(template.verticalId).toBe(verticalId);
    expect(template.toolsEnabled).toContain("checkAvailability");
    expect(template.toolsEnabled).toContain("bookAppointment");
    expect(template.toolsEnabled).toContain("searchKb");
    expect(template.toolsEnabled).toContain("handoffHuman");
  });

  it.each(kbOnlyVerticals)("%s es solo KB+handoff, sin agenda (sin catálogo todavía)", (verticalId) => {
    const template = getVerticalTemplate(verticalId);
    expect(template.verticalId).toBe(verticalId);
    expect(template.toolsEnabled).not.toContain("checkAvailability");
    expect(template.toolsEnabled).not.toContain("bookAppointment");
    expect(template.toolsEnabled).toContain("searchKb");
    expect(template.toolsEnabled).toContain("handoffHuman");
  });

  it("cada vertical nuevo tiene un displayName y kbSchema propios (no vacíos)", () => {
    for (const verticalId of [...bookingVerticals, ...kbOnlyVerticals]) {
      const template = getVerticalTemplate(verticalId);
      expect(template.displayName.length).toBeGreaterThan(0);
      expect(template.kbSchema.length).toBeGreaterThan(0);
    }
  });
});
