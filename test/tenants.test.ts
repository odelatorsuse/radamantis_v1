import { describe, expect, it, vi } from "vitest";
import { resolveTenant } from "../src/tenants";

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
