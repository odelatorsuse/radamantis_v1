// Agencia ("widgets de costo real en /admin", parte Cloudflare): tarifas
// públicas del plan Workers Paid, verificadas el 2026-08-30 en
// developers.cloudflare.com/workers/platform/pricing/ y
// developers.cloudflare.com/durable-objects/platform/pricing/. Mismo
// criterio que src/costs.ts (OpenAI): estimado calculado sobre uso real,
// nunca inventado. Radamantis usa Durable Objects respaldados por SQLite
// (new_sqlite_classes en wrangler.toml), así que solo esas tarifas de DO
// aplican (no las de almacenamiento clave-valor).

export interface CloudflareUsageMetrics {
  workersRequests: number;
  workersCpuTimeMs: number;
  d1RowsRead: number;
  d1RowsWritten: number;
  d1StorageBytes: number;
  doRequests: number;
  doDurationGbSeconds: number;
  doRowsRead: number;
  doRowsWritten: number;
  doStorageBytes: number;
  vectorizeQueriedDimensions: number;
  vectorizeStoredDimensions: number;
}

export interface CloudflareCostLine {
  label: string;
  usage: number;
  unit: string;
  estimatedCostUsd: number;
}

export interface CloudflareCostEstimate {
  totalUsd: number;
  lines: CloudflareCostLine[];
}

function overage(usage: number, includedFree: number, pricePerUnit: number, unitSize: number): number {
  const billable = Math.max(0, usage - includedFree);
  return (billable / unitSize) * pricePerUnit;
}

const BYTES_PER_GB = 1_073_741_824;

export function estimateCloudflareCostUsd(m: CloudflareUsageMetrics): CloudflareCostEstimate {
  const d1StorageGb = m.d1StorageBytes / BYTES_PER_GB;
  const doStorageGb = m.doStorageBytes / BYTES_PER_GB;

  const lines: CloudflareCostLine[] = [
    { label: "Workers — requests", usage: m.workersRequests, unit: "requests", estimatedCostUsd: overage(m.workersRequests, 10_000_000, 0.3, 1_000_000) },
    { label: "Workers — CPU time", usage: m.workersCpuTimeMs, unit: "ms", estimatedCostUsd: overage(m.workersCpuTimeMs, 30_000_000, 0.02, 1_000_000) },
    { label: "D1 — filas leídas", usage: m.d1RowsRead, unit: "rows", estimatedCostUsd: overage(m.d1RowsRead, 25_000_000_000, 0.001, 1_000_000) },
    { label: "D1 — filas escritas", usage: m.d1RowsWritten, unit: "rows", estimatedCostUsd: overage(m.d1RowsWritten, 50_000_000, 1.0, 1_000_000) },
    { label: "D1 — almacenamiento", usage: m.d1StorageBytes, unit: "bytes", estimatedCostUsd: overage(d1StorageGb, 5, 0.75, 1) },
    { label: "Durable Objects — requests", usage: m.doRequests, unit: "requests", estimatedCostUsd: overage(m.doRequests, 1_000_000, 0.15, 1_000_000) },
    { label: "Durable Objects — duración", usage: m.doDurationGbSeconds, unit: "GB-s", estimatedCostUsd: overage(m.doDurationGbSeconds, 400_000, 12.5, 1_000_000) },
    { label: "Durable Objects — filas leídas", usage: m.doRowsRead, unit: "rows", estimatedCostUsd: overage(m.doRowsRead, 25_000_000_000, 0.001, 1_000_000) },
    { label: "Durable Objects — filas escritas", usage: m.doRowsWritten, unit: "rows", estimatedCostUsd: overage(m.doRowsWritten, 50_000_000, 1.0, 1_000_000) },
    { label: "Durable Objects — almacenamiento", usage: m.doStorageBytes, unit: "bytes", estimatedCostUsd: overage(doStorageGb, 5, 0.2, 1) },
    { label: "Vectorize — dimensiones consultadas", usage: m.vectorizeQueriedDimensions, unit: "dims", estimatedCostUsd: overage(m.vectorizeQueriedDimensions, 50_000_000, 0.01, 1_000_000) },
    { label: "Vectorize — dimensiones almacenadas", usage: m.vectorizeStoredDimensions, unit: "dims", estimatedCostUsd: overage(m.vectorizeStoredDimensions, 10_000_000, 0.05, 100_000_000) },
  ];

  const totalUsd = lines.reduce((sum, l) => sum + l.estimatedCostUsd, 0);
  return { totalUsd, lines };
}
