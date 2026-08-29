import { describe, expect, it, vi } from "vitest";
import { adminApp } from "../src/admin/routes";

function mockEnv() {
  const all = vi.fn().mockResolvedValue({ results: [] });
  const bind = vi.fn().mockReturnValue({ all, first: vi.fn(), run: vi.fn().mockResolvedValue({ success: true }) });
  const prepare = vi.fn().mockReturnValue({ bind, all });
  const db = { prepare } as unknown as D1Database;
  return { DB: db, ADMIN_API_KEY: "test-admin-key" };
}

describe("adminApp auth", () => {
  it("rechaza sin Authorization header (401)", async () => {
    const res = await adminApp.request("/tenants", {}, mockEnv());
    expect(res.status).toBe(401);
  });

  it("rechaza con una key incorrecta (401)", async () => {
    const res = await adminApp.request("/tenants", { headers: { Authorization: "Bearer key-equivocada" } }, mockEnv());
    expect(res.status).toBe(401);
  });

  it("acepta con la key correcta (200)", async () => {
    const res = await adminApp.request("/tenants", { headers: { Authorization: "Bearer test-admin-key" } }, mockEnv());
    expect(res.status).toBe(200);
  });

  it("nunca acepta Basic Auth como sustituto (D10)", async () => {
    const res = await adminApp.request(
      "/tenants",
      { headers: { Authorization: "Basic dGVzdDp0ZXN0" } },
      mockEnv(),
    );
    expect(res.status).toBe(401);
  });
});

describe("adminApp tenant detail + settings", () => {
  it("GET /tenants/:id devuelve 404 si no existe", async () => {
    const res = await adminApp.request(
      "/tenants/no-existe",
      { headers: { Authorization: "Bearer test-admin-key" } },
      mockEnv(),
    );
    expect(res.status).toBe(404);
  });

  it("PUT /tenants/:id/settings acepta con auth correcta", async () => {
    const res = await adminApp.request(
      "/tenants/vet-ch/settings",
      {
        method: "PUT",
        headers: { Authorization: "Bearer test-admin-key", "Content-Type": "application/json" },
        body: JSON.stringify({ tone: "formal", language: "en", currency: "USD" }),
      },
      mockEnv(),
    );
    expect(res.status).toBe(200);
  });

  it("PUT /tenants/:id/settings rechaza sin auth (401)", async () => {
    const res = await adminApp.request(
      "/tenants/vet-ch/settings",
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
      mockEnv(),
    );
    expect(res.status).toBe(401);
  });
});
