import { describe, expect, it, vi } from "vitest";
import {
  addChannelBinding,
  createTenant,
  deleteTenant,
  getTenantDetail,
  getUsageSummary,
  getUsageSummaryThisMonth,
  logAdminAction,
  resolveHandoff,
  updateChannelBinding,
} from "../src/admin/repository";

function mockDb() {
  const run = vi.fn().mockResolvedValue({ success: true });
  const bind = vi.fn().mockReturnValue({ run });
  const prepare = vi.fn().mockReturnValue({ bind, run });
  return { db: { prepare } as unknown as D1Database, prepare, bind, run };
}

describe("createTenant", () => {
  it("inserta id, name y vertical_id", async () => {
    const { db, prepare, bind } = mockDb();
    await createTenant(db, "vet-norte", "Veterinaria Norte", "veterinaria");
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO tenants"));
    expect(bind).toHaveBeenCalledWith("vet-norte", "Veterinaria Norte", "veterinaria");
  });
});

describe("addChannelBinding", () => {
  it("inserta channel, external_id, tenant_id y route_key en ese orden para channel_bindings", async () => {
    const { db, prepare, bind } = mockDb();
    await addChannelBinding(db, "vet-ch", "telegram", "bot-token");
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO channel_bindings"));
    expect(bind).toHaveBeenCalledWith("telegram", "bot-token", "vet-ch", null);
  });

  it("guarda route_key cuando se pasa (Facebook/Instagram: Page ID / IG Business Account ID)", async () => {
    const { db, bind } = mockDb();
    await addChannelBinding(db, "vet-ch", "facebook", "page-token", "page-123");
    expect(bind).toHaveBeenCalledWith("facebook", "page-token", "vet-ch", "page-123");
  });
});

describe("updateChannelBinding", () => {
  function mockDbWithExistingRouteKey(existingRouteKey: string | null) {
    const prepareCalls: string[] = [];
    const bindCalls: unknown[][] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        prepareCalls.push(sql);
        return {
          bind: (...args: unknown[]) => {
            bindCalls.push(args);
            return {
              run: vi.fn().mockResolvedValue({ success: true }),
              first: vi.fn().mockResolvedValue({ route_key: existingRouteKey }),
            };
          },
        };
      }),
    } as unknown as D1Database;
    return { db, prepareCalls, bindCalls };
  }

  it("borra la fila vieja por tenant_id+channel e inserta la nueva con el token actualizado", async () => {
    const { db, prepareCalls, bindCalls } = mockDbWithExistingRouteKey(null);

    await updateChannelBinding(db, "vet-ch", "telegram", "token-nuevo");

    expect(prepareCalls[1]).toContain("DELETE FROM channel_bindings");
    expect(bindCalls[1]).toEqual(["vet-ch", "telegram"]);
    expect(prepareCalls[2]).toContain("INSERT INTO channel_bindings");
    expect(bindCalls[2]).toEqual(["telegram", "token-nuevo", "vet-ch", null]);
  });

  it("preserva el route_key existente si no se pasa uno nuevo (rotar token no debe pedir de nuevo el Page ID)", async () => {
    const { db, bindCalls } = mockDbWithExistingRouteKey("page-123");

    await updateChannelBinding(db, "vet-ch", "facebook", "token-nuevo");

    expect(bindCalls[2]).toEqual(["facebook", "token-nuevo", "vet-ch", "page-123"]);
  });

  it("usa el route_key nuevo cuando se pasa explícitamente", async () => {
    const { db, bindCalls } = mockDbWithExistingRouteKey("page-vieja");

    await updateChannelBinding(db, "vet-ch", "facebook", "token-nuevo", "page-nueva");

    expect(bindCalls[2]).toEqual(["facebook", "token-nuevo", "vet-ch", "page-nueva"]);
  });
});

describe("resolveHandoff", () => {
  it("solo actualiza handoffs sin resolver", async () => {
    const { db, prepare, bind } = mockDb();
    await resolveHandoff(db, 5);
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("resolved_at IS NULL"));
    expect(bind).toHaveBeenCalledWith(5);
  });
});


describe("getTenantDetail", () => {
  it("devuelve null si el tenant no existe", async () => {
    const first = vi.fn().mockResolvedValue(null);
    const bind = vi.fn().mockReturnValue({ first });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    expect(await getTenantDetail(db, "no-existe")).toBeNull();
  });

  it("combina tenant, settings, canales y métricas, con status necesita_atencion si hay handoffs abiertos", async () => {
    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes("FROM tenants")) {
          return {
            bind: () => ({
              first: async () => ({
                id: "vet-ch",
                name: "Dr. Vet CH",
                vertical_id: "veterinaria",
                created_at: "2026-01-01",
              }),
            }),
          };
        }
        if (sql.includes("FROM tenant_settings")) {
          return { bind: () => ({ first: async () => null }) };
        }
        if (sql.includes("FROM channel_bindings")) {
          return {
            bind: () => ({
              all: async () => ({ results: [{ channel: "telegram", external_id: "tok", route_key: null }] }),
            }),
          };
        }
        return {
          bind: () => ({
            first: async () => ({ messages_in: 10, messages_out: 8, conversations: 3, open_handoffs: 1 }),
          }),
        };
      }),
    } as unknown as D1Database;

    const detail = await getTenantDetail(db, "vet-ch");

    expect(detail?.metrics).toEqual({
      messagesIn: 10,
      messagesOut: 8,
      conversations: 3,
      openHandoffs: 1,
      status: "necesita_atencion",
    });
    expect(detail?.channels).toEqual([{ channel: "telegram", external_id: "tok", route_key: null }]);
  });
});

describe("logAdminAction", () => {
  it("serializa details a JSON y registra el actor real recibido", async () => {
    const { db, bind } = mockDb();
    await logAdminAction(db, { tenantId: "vet-ch", actor: "oscar@radamantis.dev", action: "create_tenant", details: { name: "x" } });
    expect(bind).toHaveBeenCalledWith("vet-ch", "oscar@radamantis.dev", "create_tenant", JSON.stringify({ name: "x" }));
  });
});

function mockUsageDb(rows: unknown[]) {
  const all = vi.fn().mockResolvedValue({ results: rows });
  const prepare = vi.fn().mockReturnValue({ all });
  return { db: { prepare } as unknown as D1Database, prepare, all };
}

describe("getUsageSummary", () => {
  it("agrupa por tenant, calcula el costo real por modelo y arma el breakdown", async () => {
    const { db } = mockUsageDb([
      { tenant_id: "vet-ch", model: "gpt-4o-mini", requests: 10, prompt_tokens: 1_000_000, completion_tokens: 500_000, audio_seconds: null },
      { tenant_id: "vet-ch", model: "whisper-1", requests: 2, prompt_tokens: 0, completion_tokens: 0, audio_seconds: 60 },
    ]);

    const summary = await getUsageSummary(db);

    expect(summary).toHaveLength(1);
    expect(summary[0].tenant_id).toBe("vet-ch");
    expect(summary[0].requests).toBe(12);
    // gpt-4o-mini: 1M*0.15 + 0.5M*0.60 = 0.15 + 0.30 = 0.45 ; whisper-1: 1 min * 0.006 = 0.006
    expect(summary[0].estimatedCostUsd).toBeCloseTo(0.456, 6);
    expect(summary[0].breakdown).toHaveLength(2);
  });

  it("no incluye la cláusula WHERE de 'este mes' en el total all-time", async () => {
    const { db, prepare } = mockUsageDb([]);
    await getUsageSummary(db);
    const sql = prepare.mock.calls[0][0] as string;
    expect(sql).not.toContain("WHERE");
  });
});

describe("getUsageSummaryThisMonth", () => {
  it("filtra por el mes calendario en curso (SQLite date(), no ISO)", async () => {
    const { db, prepare } = mockUsageDb([]);
    await getUsageSummaryThisMonth(db);
    const sql = prepare.mock.calls[0][0] as string;
    expect(sql).toContain("date(created_at) >= date('now', 'start of month')");
  });
});

describe("deleteTenant (Agencia, 'Borrar cliente')", () => {
  it("borra los vectores reales de Vectorize (solo los de ESE tenant) antes que las filas de D1", async () => {
    const all = vi.fn().mockResolvedValue({ results: [{ doc_id: "horario" }, { doc_id: "precios" }] });
    const prepareCalls: string[] = [];
    const batch = vi.fn().mockResolvedValue([]);
    const db = {
      prepare: vi.fn((sql: string) => {
        prepareCalls.push(sql);
        return { bind: () => ({ all, run: vi.fn() }) };
      }),
      batch,
    } as unknown as D1Database;
    const deleteByIds = vi.fn().mockResolvedValue({});
    const vectorize = { deleteByIds } as unknown as VectorizeIndex;

    await deleteTenant(db, vectorize, "vet-ch");

    expect(deleteByIds).toHaveBeenCalledWith(["vet-ch:horario", "vet-ch:precios"]);
    expect(batch).toHaveBeenCalled();
  });

  it("no llama a deleteByIds si el tenant no tiene documentos de KB", async () => {
    const all = vi.fn().mockResolvedValue({ results: [] });
    const db = {
      prepare: vi.fn().mockReturnValue({ bind: () => ({ all, run: vi.fn() }) }),
      batch: vi.fn().mockResolvedValue([]),
    } as unknown as D1Database;
    const deleteByIds = vi.fn();
    const vectorize = { deleteByIds } as unknown as VectorizeIndex;

    await deleteTenant(db, vectorize, "vet-ch");

    expect(deleteByIds).not.toHaveBeenCalled();
  });

  it("borra las 19 tablas tenant-scoped conocidas más la fila de tenants, todas filtradas por tenant_id/id", async () => {
    const bindCalls: unknown[][] = [];
    const preparedSql: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        preparedSql.push(sql);
        return {
          bind: (...args: unknown[]) => {
            bindCalls.push(args);
            return { all: vi.fn().mockResolvedValue({ results: [] }), run: vi.fn() };
          },
        };
      }),
      batch: vi.fn(async (statements: unknown[]) => statements),
    } as unknown as D1Database;
    const vectorize = { deleteByIds: vi.fn() } as unknown as VectorizeIndex;

    await deleteTenant(db, vectorize, "vet-ch");

    const deleteStatements = preparedSql.filter((sql) => sql.startsWith("DELETE FROM"));
    // 19 tablas tenant-scoped + la fila de tenants misma = 20 DELETE.
    expect(deleteStatements.length).toBe(20);
    expect(deleteStatements.some((sql) => sql.includes("DELETE FROM tenants WHERE id = ?"))).toBe(true);
    expect(deleteStatements.some((sql) => sql.includes("DELETE FROM catalog_items WHERE tenant_id = ?"))).toBe(true);
    expect(deleteStatements.some((sql) => sql.includes("DELETE FROM appointments WHERE tenant_id = ?"))).toBe(true);
    expect(deleteStatements.some((sql) => sql.includes("DELETE FROM padel_tournaments WHERE tenant_id = ?"))).toBe(true);
    expect(deleteStatements.some((sql) => sql.includes("DELETE FROM padel_registrations WHERE tenant_id = ?"))).toBe(true);
    expect(deleteStatements.some((sql) => sql.includes("DELETE FROM padel_matches WHERE tenant_id = ?"))).toBe(true);
  });
});
