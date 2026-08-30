import type { CloudflareUsageMetrics } from "./cloudflareCosts";

// Agencia ("widgets de costo real en /admin", parte Cloudflare): lee uso
// real del mes en curso vía la GraphQL Analytics API de Cloudflare
// (developers.cloudflare.com/analytics/graphql-api/) — nunca inventa un
// número. Todos los nombres de dataset/campo usados aquí se verificaron
// en vivo por introspección de schema contra la API real el 2026-08-30,
// no se adivinaron de la documentación (que no lista los datasets
// específicos de producto).
//
// Oscar y este Worker comparten la misma cuenta de Cloudflare con OTROS
// despliegues ajenos a Radamantis (ej. el starter de Forja que exploró
// por su cuenta) — por eso Workers/D1/Vectorize/DO-requests siempre se
// filtran por scriptName/databaseId/indexName específicos de Radamantis.
// La única excepción real es el almacenamiento de Durable Objects: la
// API de Cloudflare no expone ahí una dimensión para filtrar por script,
// así que ese número queda a nivel de CUENTA, no solo de Radamantis —
// se etiqueta así explícitamente en la UI en vez de fingir precisión que
// la API no puede dar.

const GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";

interface GraphQLResponse<T> {
  data: T | null;
  errors?: { message: string }[] | null;
}

async function runQuery<T>(apiToken: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as GraphQLResponse<T>;
  if (!res.ok || !body.data) {
    throw new Error(`Cloudflare GraphQL falló: ${res.status} ${body.errors?.map((e) => e.message).join("; ") ?? ""}`);
  }
  return body.data;
}

export interface CloudflareAnalyticsParams {
  apiToken: string;
  accountId: string;
  scriptName: string;
  d1DatabaseId: string;
  vectorizeIndexName: string;
}

function currentMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  return { start, end: now.toISOString() };
}

interface WorkersAndD1Data {
  viewer: {
    accounts: {
      workersInvocationsAdaptive: { sum: { requests: number; cpuTimeUs: number } }[];
      d1QueriesAdaptiveGroups: { sum: { rowsRead: number; rowsWritten: number } }[];
      d1StorageAdaptiveGroups: { max: { databaseSizeBytes: number } }[];
    }[];
  };
}

interface DoInvocationsData {
  viewer: {
    accounts: {
      durableObjectsInvocationsAdaptiveGroups: { sum: { requests: number }; dimensions: { namespaceId: string } }[];
    }[];
  };
}

interface DoPeriodicData {
  viewer: {
    accounts: {
      durableObjectsPeriodicGroups: { sum: { duration: number; rowsRead: number; rowsWritten: number } }[];
    }[];
  };
}

interface DoStorageData {
  viewer: {
    accounts: { durableObjectsStorageGroups: { max: { storedBytes: number } }[] }[];
  };
}

interface VectorizeData {
  viewer: {
    accounts: {
      vectorizeV2QueriesAdaptiveGroups: { sum: { queriedVectorDimensions: number } }[];
      vectorizeV2StorageAdaptiveGroups: { max: { storedVectorDimensions: number } }[];
    }[];
  };
}

// Cada bloque de datos se consulta y se captura por separado: si un
// dataset falla (ej. Cloudflare cambia un nombre de campo), ese número
// queda en 0/"no disponible" en vez de tumbar toda la pestaña de costos.
export async function fetchCloudflareUsageThisMonth(params: CloudflareAnalyticsParams): Promise<CloudflareUsageMetrics> {
  const { start, end } = currentMonthRange();
  const metrics: CloudflareUsageMetrics = {
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

  try {
    const data = await runQuery<WorkersAndD1Data>(
      params.apiToken,
      `query Q($accountTag: string!, $start: Time!, $end: Time!, $script: string!, $db: string!) {
        viewer {
          accounts(filter: {accountTag: $accountTag}) {
            workersInvocationsAdaptive(limit: 10, filter: {datetime_geq: $start, datetime_leq: $end, scriptName: $script}) {
              sum { requests cpuTimeUs }
            }
            d1QueriesAdaptiveGroups(limit: 10, filter: {datetime_geq: $start, datetime_leq: $end, databaseId: $db}) {
              sum { rowsRead rowsWritten }
            }
            d1StorageAdaptiveGroups(limit: 1, orderBy: [datetimeMinute_DESC], filter: {databaseId: $db}) {
              max { databaseSizeBytes }
            }
          }
        }
      }`,
      { accountTag: params.accountId, start, end, script: params.scriptName, db: params.d1DatabaseId },
    );
    const acct = data.viewer.accounts[0];
    for (const row of acct?.workersInvocationsAdaptive ?? []) {
      metrics.workersRequests += row.sum.requests;
      metrics.workersCpuTimeMs += row.sum.cpuTimeUs / 1000;
    }
    for (const row of acct?.d1QueriesAdaptiveGroups ?? []) {
      metrics.d1RowsRead += row.sum.rowsRead;
      metrics.d1RowsWritten += row.sum.rowsWritten;
    }
    metrics.d1StorageBytes = acct?.d1StorageAdaptiveGroups[0]?.max.databaseSizeBytes ?? 0;
  } catch {
    // best-effort — ver comentario arriba
  }

  try {
    const invocations = await runQuery<DoInvocationsData>(
      params.apiToken,
      `query Q($accountTag: string!, $start: Time!, $end: Time!, $script: string!) {
        viewer {
          accounts(filter: {accountTag: $accountTag}) {
            durableObjectsInvocationsAdaptiveGroups(limit: 100, filter: {datetime_geq: $start, datetime_leq: $end, scriptName: $script}) {
              sum { requests }
              dimensions { namespaceId }
            }
          }
        }
      }`,
      { accountTag: params.accountId, start, end, script: params.scriptName },
    );
    const rows = invocations.viewer.accounts[0]?.durableObjectsInvocationsAdaptiveGroups ?? [];
    for (const row of rows) metrics.doRequests += row.sum.requests;

    const namespaceIds = Array.from(new Set(rows.map((r) => r.dimensions.namespaceId).filter(Boolean)));
    if (namespaceIds.length > 0) {
      const periodic = await runQuery<DoPeriodicData>(
        params.apiToken,
        `query Q($accountTag: string!, $start: Time!, $end: Time!, $ns: [string!]) {
          viewer {
            accounts(filter: {accountTag: $accountTag}) {
              durableObjectsPeriodicGroups(limit: 100, filter: {datetime_geq: $start, datetime_leq: $end, namespaceId_in: $ns}) {
                sum { duration rowsRead rowsWritten }
              }
            }
          }
        }`,
        { accountTag: params.accountId, start, end, ns: namespaceIds },
      );
      for (const row of periodic.viewer.accounts[0]?.durableObjectsPeriodicGroups ?? []) {
        metrics.doDurationGbSeconds += row.sum.duration;
        metrics.doRowsRead += row.sum.rowsRead;
        metrics.doRowsWritten += row.sum.rowsWritten;
      }
    }
  } catch {
    // best-effort
  }

  try {
    const storage = await runQuery<DoStorageData>(
      params.apiToken,
      `query Q($accountTag: string!, $start: Time!, $end: Time!) {
        viewer {
          accounts(filter: {accountTag: $accountTag}) {
            durableObjectsStorageGroups(limit: 1, orderBy: [datetimeMinute_DESC], filter: {datetime_geq: $start, datetime_leq: $end}) {
              max { storedBytes }
            }
          }
        }
      }`,
      { accountTag: params.accountId, start, end },
    );
    metrics.doStorageBytes = storage.viewer.accounts[0]?.durableObjectsStorageGroups[0]?.max.storedBytes ?? 0;
  } catch {
    // best-effort
  }

  try {
    const vectorize = await runQuery<VectorizeData>(
      params.apiToken,
      `query Q($accountTag: string!, $start: Time!, $end: Time!, $index: string!) {
        viewer {
          accounts(filter: {accountTag: $accountTag}) {
            vectorizeV2QueriesAdaptiveGroups(limit: 10, filter: {datetime_geq: $start, datetime_leq: $end, indexName: $index}) {
              sum { queriedVectorDimensions }
            }
            vectorizeV2StorageAdaptiveGroups(limit: 1, orderBy: [datetimeMinute_DESC], filter: {indexName: $index}) {
              max { storedVectorDimensions }
            }
          }
        }
      }`,
      { accountTag: params.accountId, start, end, index: params.vectorizeIndexName },
    );
    const acct = vectorize.viewer.accounts[0];
    for (const row of acct?.vectorizeV2QueriesAdaptiveGroups ?? []) {
      metrics.vectorizeQueriedDimensions += row.sum.queriedVectorDimensions;
    }
    metrics.vectorizeStoredDimensions = acct?.vectorizeV2StorageAdaptiveGroups[0]?.max.storedVectorDimensions ?? 0;
  } catch {
    // best-effort
  }

  return metrics;
}
