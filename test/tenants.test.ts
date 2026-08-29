import { describe, expect, it, vi } from "vitest";
import { DEFAULT_TENANT_SETTINGS, getTenantSettings, resolveTenant } from "../src/tenants";

describe("resolveTenant", () => {
  it("devuelve tenant_id y vertical_id para un channel_binding existente", async () => {
    const first = vi.fn().mockResolvedValue({ tenant_id: "vet-ch", vertical_id: "veterinaria" });
    const bind = vi.fn().mockReturnValue({ first });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    const resolved = await resolveTenant(db, "telegram", "bot-token-vet-ch");

    expect(bind).toHaveBeenCalledWith("telegram", "bot-token-vet-ch");
    expect(resolved).toEqual({ tenantId: "vet-ch", verticalId: "veterinaria" });
  });

  it("devuelve null si no hay channel_binding registrado", async () => {
    const first = vi.fn().mockResolvedValue(null);
    const bind = vi.fn().mockReturnValue({ first });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    const resolved = await resolveTenant(db, "telegram", "token-desconocido");

    expect(resolved).toBeNull();
  });
});

describe("getTenantSettings", () => {
  it("devuelve los defaults si el tenant no tiene fila en tenant_settings", async () => {
    const first = vi.fn().mockResolvedValue(null);
    const bind = vi.fn().mockReturnValue({ first });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    expect(await getTenantSettings(db, "vet-ch")).toEqual(DEFAULT_TENANT_SETTINGS);
  });

  it("devuelve la config guardada si existe", async () => {
    const first = vi
      .fn()
      .mockResolvedValue({ tone: "formal", language: "en", currency: "USD", prompt_override: "custom" });
    const bind = vi.fn().mockReturnValue({ first });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    expect(await getTenantSettings(db, "vet-ch")).toEqual({
      tone: "formal",
      language: "en",
      currency: "USD",
      promptOverride: "custom",
    });
  });
});
