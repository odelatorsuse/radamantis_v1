import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCloudflareUsageThisMonth } from "../src/cloudflareAnalytics";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(data: unknown) {
  return { ok: true, json: async () => ({ data, errors: null }) };
}

const PARAMS = {
  apiToken: "cf-token",
  accountId: "acct-1",
  scriptName: "radamantis",
  d1DatabaseId: "db-1",
  vectorizeIndexName: "radamantis-kb",
};

describe("fetchCloudflareUsageThisMonth", () => {
  it("suma requests/CPU de Workers, filas de D1 y arma los metrics reales", async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (body.query.includes("workersInvocationsAdaptive")) {
        return Promise.resolve(
          jsonResponse({
            viewer: {
              accounts: [
                {
                  workersInvocationsAdaptive: [{ sum: { requests: 1000, cpuTimeUs: 2_000_000 } }],
                  d1QueriesAdaptiveGroups: [{ sum: { rowsRead: 500, rowsWritten: 50 } }],
                  d1StorageAdaptiveGroups: [{ max: { databaseSizeBytes: 1024 } }],
                },
              ],
            },
          }),
        );
      }
      if (body.query.includes("durableObjectsInvocationsAdaptiveGroups")) {
        return Promise.resolve(jsonResponse({ viewer: { accounts: [{ durableObjectsInvocationsAdaptiveGroups: [] }] } }));
      }
      if (body.query.includes("durableObjectsStorageGroups")) {
        return Promise.resolve(jsonResponse({ viewer: { accounts: [{ durableObjectsStorageGroups: [{ max: { storedBytes: 2048 } }] }] } }));
      }
      if (body.query.includes("vectorizeV2QueriesAdaptiveGroups")) {
        return Promise.resolve(
          jsonResponse({
            viewer: {
              accounts: [
                {
                  vectorizeV2QueriesAdaptiveGroups: [{ sum: { queriedVectorDimensions: 300 } }],
                  vectorizeV2StorageAdaptiveGroups: [{ max: { storedVectorDimensions: 400 } }],
                },
              ],
            },
          }),
        );
      }
      throw new Error("query inesperada: " + body.query);
    });
    vi.stubGlobal("fetch", fetchMock);

    const metrics = await fetchCloudflareUsageThisMonth(PARAMS);

    expect(metrics.workersRequests).toBe(1000);
    expect(metrics.workersCpuTimeMs).toBe(2000);
    expect(metrics.d1RowsRead).toBe(500);
    expect(metrics.d1RowsWritten).toBe(50);
    expect(metrics.d1StorageBytes).toBe(1024);
    expect(metrics.doStorageBytes).toBe(2048);
    expect(metrics.vectorizeQueriedDimensions).toBe(300);
    expect(metrics.vectorizeStoredDimensions).toBe(400);
  });

  it("hace una segunda consulta con los namespaceId reales de Durable Objects para leer duración/filas", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      calls.push(body.query);
      if (body.query.includes("workersInvocationsAdaptive")) {
        return Promise.resolve(
          jsonResponse({ viewer: { accounts: [{ workersInvocationsAdaptive: [], d1QueriesAdaptiveGroups: [], d1StorageAdaptiveGroups: [] }] } }),
        );
      }
      if (body.query.includes("durableObjectsInvocationsAdaptiveGroups")) {
        return Promise.resolve(
          jsonResponse({
            viewer: {
              accounts: [
                {
                  durableObjectsInvocationsAdaptiveGroups: [
                    { sum: { requests: 42 }, dimensions: { namespaceId: "ns-1" } },
                  ],
                },
              ],
            },
          }),
        );
      }
      if (body.query.includes("durableObjectsPeriodicGroups")) {
        expect(body.variables.ns).toEqual(["ns-1"]);
        return Promise.resolve(
          jsonResponse({ viewer: { accounts: [{ durableObjectsPeriodicGroups: [{ sum: { duration: 5.5, rowsRead: 10, rowsWritten: 2 } }] }] } }),
        );
      }
      if (body.query.includes("durableObjectsStorageGroups")) {
        return Promise.resolve(jsonResponse({ viewer: { accounts: [{ durableObjectsStorageGroups: [] }] } }));
      }
      if (body.query.includes("vectorizeV2QueriesAdaptiveGroups")) {
        return Promise.resolve(
          jsonResponse({ viewer: { accounts: [{ vectorizeV2QueriesAdaptiveGroups: [], vectorizeV2StorageAdaptiveGroups: [] }] } }),
        );
      }
      throw new Error("query inesperada: " + body.query);
    });
    vi.stubGlobal("fetch", fetchMock);

    const metrics = await fetchCloudflareUsageThisMonth(PARAMS);

    expect(metrics.doRequests).toBe(42);
    expect(metrics.doDurationGbSeconds).toBe(5.5);
    expect(metrics.doRowsRead).toBe(10);
    expect(metrics.doRowsWritten).toBe(2);
    expect(calls.some((q) => q.includes("durableObjectsPeriodicGroups"))).toBe(true);
  });

  it("un dataset que falla no tumba a los demás — best-effort por bloque", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        if (body.query.includes("workersInvocationsAdaptive")) {
          return Promise.resolve({ ok: false, status: 500, json: async () => ({ data: null, errors: [{ message: "boom" }] }) });
        }
        if (body.query.includes("vectorizeV2QueriesAdaptiveGroups")) {
          return Promise.resolve(
            jsonResponse({
              viewer: { accounts: [{ vectorizeV2QueriesAdaptiveGroups: [{ sum: { queriedVectorDimensions: 7 } }], vectorizeV2StorageAdaptiveGroups: [] }] },
            }),
          );
        }
        return Promise.resolve(jsonResponse({ viewer: { accounts: [{}] } }));
      }),
    );

    const metrics = await fetchCloudflareUsageThisMonth(PARAMS);

    expect(metrics.workersRequests).toBe(0);
    expect(metrics.vectorizeQueriedDimensions).toBe(7);
  });
});
