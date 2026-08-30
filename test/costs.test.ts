import { describe, expect, it } from "vitest";
import { estimateCostUsd } from "../src/costs";

describe("estimateCostUsd", () => {
  it("calcula el costo de gpt-4o-mini con las tarifas públicas reales", () => {
    // $0.15/1M prompt, $0.60/1M completion (verificado en developers.openai.com/api/docs/pricing)
    const cost = estimateCostUsd({ model: "gpt-4o-mini", promptTokens: 1_000_000, completionTokens: 1_000_000, audioSeconds: null });
    expect(cost).toBeCloseTo(0.75, 6);
  });

  it("calcula el costo de text-embedding-3-small ($0.02/1M tokens)", () => {
    const cost = estimateCostUsd({ model: "text-embedding-3-small", promptTokens: 1_000_000, completionTokens: 0, audioSeconds: null });
    expect(cost).toBeCloseTo(0.02, 6);
  });

  it("calcula el costo de whisper-1 por minuto de audio, ignorando tokens", () => {
    // $0.006/minuto — 90 segundos = 1.5 minutos
    const cost = estimateCostUsd({ model: "whisper-1", promptTokens: 999, completionTokens: 999, audioSeconds: 90 });
    expect(cost).toBeCloseTo(0.009, 6);
  });

  it("devuelve 0 para whisper-1 sin audioSeconds", () => {
    expect(estimateCostUsd({ model: "whisper-1", promptTokens: 0, completionTokens: 0, audioSeconds: null })).toBe(0);
  });

  it("devuelve 0 para un modelo desconocido, nunca inventa un precio", () => {
    expect(estimateCostUsd({ model: "un-modelo-que-no-existe", promptTokens: 1000, completionTokens: 1000, audioSeconds: null })).toBe(0);
  });
});
