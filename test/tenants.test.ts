import { describe, expect, it, vi } from "vitest";
import { resolveTenantId } from "../src/tenants";

describe("resolveTenantId", () => {
  it("devuelve el tenant_id correcto para un channel_binding existente", async () => {
    const first = vi.fn().mockResolvedValue({ tenant_id: "vet-ch" });
    const bind = vi.fn().mockReturnValue({ first });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    const tenantId = await resolveTenantId(db, "telegram", "bot-token-vet-ch");

    expect(bind).toHaveBeenCalledWith("telegram", "bot-token-vet-ch");
    expect(tenantId).toBe("vet-ch");
  });

  it("devuelve null si no hay channel_binding registrado", async () => {
    const first = vi.fn().mockResolvedValue(null);
    const bind = vi.fn().mockReturnValue({ first });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    const tenantId = await resolveTenantId(db, "telegram", "token-desconocido");

    expect(tenantId).toBeNull();
  });
});
