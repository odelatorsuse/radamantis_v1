import { describe, expect, it } from "vitest";
import { estimateCloudflareCostUsd, type CloudflareUsageMetrics } from "../src/cloudflareCosts";

function zeroMetrics(): CloudflareUsageMetrics {
  return {
    workersRequests: 0,
    workersCpuTimeMs: 0,
    d1RowsRead: 0,
    d1RowsWritten: 0,
    d1StorageBytes: 0,
    doRequests: 0,
    doDurationGbSeconds: 0,
    doRowsRead: 0,
    doRowsWritten: 0,
    doStorageBytes: 0,
    vectorizeQueriedDimensions: 0,
    vectorizeStoredDimensions: 0,
  };
}

describe("estimateCloudflareCostUsd", () => {
  it("devuelve $0 cuando todo el uso está dentro de las cuotas gratuitas", () => {
    const { totalUsd } = estimateCloudflareCostUsd(zeroMetrics());
    expect(totalUsd).toBe(0);
  });

  it("cobra requests de Workers solo por encima de los 10M incluidos ($0.30/millón)", () => {
    const { totalUsd, lines } = estimateCloudflareCostUsd({ ...zeroMetrics(), workersRequests: 11_000_000 });
    expect(totalUsd).toBeCloseTo(0.3, 6);
    expect(lines.find((l) => l.label.includes("requests"))?.estimatedCostUsd).toBeCloseTo(0.3, 6);
  });

  it("cobra CPU time de Workers solo por encima de los 30M ms incluidos ($0.02/millón ms)", () => {
    const { totalUsd } = estimateCloudflareCostUsd({ ...zeroMetrics(), workersCpuTimeMs: 31_000_000 });
    expect(totalUsd).toBeCloseTo(0.02, 6);
  });

  it("calcula el costo de duración de Durable Objects directo en GB-s ($12.50/millón GB-s)", () => {
    const { totalUsd } = estimateCloudflareCostUsd({ ...zeroMetrics(), doDurationGbSeconds: 1_400_000 });
    expect(totalUsd).toBeCloseTo(12.5, 6);
  });

  it("calcula almacenamiento de D1 convirtiendo bytes a GB ($0.75/GB-mes sobre 5GB incluidos)", () => {
    const sixGbInBytes = 6 * 1_073_741_824;
    const { totalUsd } = estimateCloudflareCostUsd({ ...zeroMetrics(), d1StorageBytes: sixGbInBytes });
    expect(totalUsd).toBeCloseTo(0.75, 6);
  });

  it("suma varias métricas a la vez en el total", () => {
    const { totalUsd } = estimateCloudflareCostUsd({
      ...zeroMetrics(),
      workersRequests: 11_000_000,
      doRequests: 2_000_000,
    });
    // requests Workers: 1M sobre cuota * 0.30/M = 0.30 ; DO requests: 1M sobre cuota * 0.15/M = 0.15
    expect(totalUsd).toBeCloseTo(0.45, 6);
  });
});
