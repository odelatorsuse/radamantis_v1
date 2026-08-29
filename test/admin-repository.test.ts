import { describe, expect, it, vi } from "vitest";
import {
  addChannelBinding,
  createTenant,
  getTenantDetail,
  logAdminAction,
  resolveHandoff,
  updateChannelBinding,
  upsertTenantSettings,
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
  it("inserta channel, external_id y tenant_id en ese orden para channel_bindings", async () => {
    const { db, prepare, bind } = mockDb();
    await addChannelBinding(db, "vet-ch", "telegram", "bot-token");
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO channel_bindings"));
    expect(bind).toHaveBeenCalledWith("telegram", "bot-token", "vet-ch");
  });
});

describe("updateChannelBinding", () => {
  it("borra la fila vieja por tenant_id+channel e inserta la nueva con el token actualizado", async () => {
    const prepareCalls: string[] = [];
    const bindCalls: unknown[][] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        prepareCalls.push(sql);
        return {
          bind: (...args: unknown[]) => {
            bindCalls.push(args);
            return { run: vi.fn().mockResolvedValue({ success: true }) };
          },
        };
      }),
    } as unknown as D1Database;

    await updateChannelBinding(db, "vet-ch", "telegram", "token-nuevo");

    expect(prepareCalls[0]).toContain("DELETE FROM channel_bindings");
    expect(bindCalls[0]).toEqual(["vet-ch", "telegram"]);
    expect(prepareCalls[1]).toContain("INSERT INTO channel_bindings");
    expect(bindCalls[1]).toEqual(["telegram", "token-nuevo", "vet-ch"]);
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

describe("upsertTenantSettings", () => {
  it("hace upsert con ON CONFLICT sobre tenant_id", async () => {
    const { db, prepare, bind } = mockDb();
    await upsertTenantSettings(db, "vet-ch", {
      tone: "formal",
      language: "en",
      currency: "USD",
      promptOverride: null,
    });
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("ON CONFLICT (tenant_id) DO UPDATE"));
    expect(bind).toHaveBeenCalledWith("vet-ch", "formal", "en", "USD", null);
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
              all: async () => ({ results: [{ channel: "telegram", external_id: "tok" }] }),
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
    expect(detail?.channels).toEqual([{ channel: "telegram", external_id: "tok" }]);
  });
});

describe("logAdminAction", () => {
  it("serializa details a JSON y usa 'super-admin' como actor", async () => {
    const { db, bind } = mockDb();
    await logAdminAction(db, { tenantId: "vet-ch", action: "create_tenant", details: { name: "x" } });
    expect(bind).toHaveBeenCalledWith("vet-ch", "super-admin", "create_tenant", JSON.stringify({ name: "x" }));
  });
});
