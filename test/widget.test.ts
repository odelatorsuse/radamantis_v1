import { describe, expect, it, vi } from "vitest";
import { widgetApp } from "../src/widget";

function mockEnv(overrides?: Record<string, unknown>) {
  const first = vi.fn().mockResolvedValue(null);
  const bind = vi.fn().mockReturnValue({ first });
  const prepare = vi.fn().mockReturnValue({ bind });
  const db = { prepare } as unknown as D1Database;
  return { DB: db, AGENT: {} as unknown as DurableObjectNamespace, __first: first, ...overrides };
}

describe("POST /:tenantId/message", () => {
  it("404 si el tenant no tiene el canal de sitio web conectado", async () => {
    const res = await widgetApp.request(
      "/vet-ch/message",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visitorId: "v1", text: "hola" }) },
      mockEnv(),
    );
    expect(res.status).toBe(404);
  });

  it("403 si el Origin no coincide con el dominio configurado", async () => {
    const env = mockEnv();
    (env.__first as ReturnType<typeof vi.fn>).mockResolvedValue({ external_id: "https://minegocio.com" });
    const res = await widgetApp.request(
      "/vet-ch/message",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://otro-sitio.com" },
        body: JSON.stringify({ visitorId: "v1", text: "hola" }),
      },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("400 si faltan visitorId/text, incluso con Origin correcto", async () => {
    const env = mockEnv();
    (env.__first as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ external_id: "https://minegocio.com" }) // allowed-origin lookup
      .mockResolvedValueOnce({ vertical_id: "veterinaria" }); // vertical lookup
    const res = await widgetApp.request(
      "/vet-ch/message",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://minegocio.com" },
        body: JSON.stringify({ text: "hola" }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("404 si el tenant no existe (sin vertical_id) aunque el canal esté configurado", async () => {
    const env = mockEnv();
    (env.__first as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ external_id: "https://minegocio.com" })
      .mockResolvedValueOnce(null);
    const res = await widgetApp.request(
      "/vet-ch/message",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://minegocio.com" },
        body: JSON.stringify({ visitorId: "v1", text: "hola" }),
      },
      env,
    );
    expect(res.status).toBe(404);
  });
});

describe("OPTIONS /:tenantId/message (preflight)", () => {
  it("devuelve 204 con headers CORS del dominio configurado", async () => {
    const env = mockEnv();
    (env.__first as ReturnType<typeof vi.fn>).mockResolvedValue({ external_id: "https://minegocio.com" });
    const res = await widgetApp.request("/vet-ch/message", { method: "OPTIONS" }, env);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://minegocio.com");
  });

  it("204 sin headers CORS si el canal no está configurado", async () => {
    const res = await widgetApp.request("/vet-ch/message", { method: "OPTIONS" }, mockEnv());
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
