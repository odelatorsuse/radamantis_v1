import { afterEach, describe, expect, it, vi } from "vitest";
import { adminApp } from "../src/admin/routes";

vi.mock("../src/rag/embeddings", () => ({
  embedText: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

function mockEnv(overrides?: Record<string, unknown>) {
  const all = vi.fn().mockResolvedValue({ results: [] });
  const bind = vi.fn().mockReturnValue({ all, first: vi.fn(), run: vi.fn().mockResolvedValue({ success: true }) });
  const prepare = vi.fn().mockReturnValue({ bind, all });
  const db = { prepare } as unknown as D1Database;
  return {
    DB: db,
    ADMIN_API_KEY: "test-admin-key",
    OPENAI_API_KEY: "fake-openai-key",
    TELEGRAM_WEBHOOK_SECRET: "webhook-secret",
    VECTORIZE: { upsert: vi.fn().mockResolvedValue({}) } as unknown as VectorizeIndex,
    ...overrides,
  };
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

describe("adminApp channels (Etapa 9 — auto-registro de webhook)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POST /tenants/:id/channels registra el webhook automáticamente para telegram", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const res = await adminApp.request(
      "/tenants/vet-norte/channels",
      {
        method: "POST",
        headers: { Authorization: "Bearer test-admin-key", "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "telegram", externalId: "bot-token-vet-norte" }),
      },
      mockEnv(),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ ok: true, webhookRegistered: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/botbot-token-vet-norte/setWebhook",
      expect.anything(),
    );
  });

  it("POST /tenants/:id/channels reporta el error si Telegram rechaza el webhook, sin fallar la alta", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: false, description: "token inválido" }) }),
    );

    const res = await adminApp.request(
      "/tenants/vet-norte/channels",
      {
        method: "POST",
        headers: { Authorization: "Bearer test-admin-key", "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "telegram", externalId: "bot-malo" }),
      },
      mockEnv(),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ ok: true, webhookRegistered: false, webhookError: "token inválido" });
  });

  it("PUT /tenants/:id/channels/:channel rota el token y re-registra el webhook", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const res = await adminApp.request(
      "/tenants/vet-ch/channels/telegram",
      {
        method: "PUT",
        headers: { Authorization: "Bearer test-admin-key", "Content-Type": "application/json" },
        body: JSON.stringify({ externalId: "token-nuevo" }),
      },
      mockEnv(),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, webhookRegistered: true });
    expect(fetchMock).toHaveBeenCalledWith("https://api.telegram.org/bottoken-nuevo/setWebhook", expect.anything());
  });

  it("PUT /tenants/:id/channels/:channel rechaza sin externalId (400)", async () => {
    const res = await adminApp.request(
      "/tenants/vet-ch/channels/telegram",
      {
        method: "PUT",
        headers: { Authorization: "Bearer test-admin-key", "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      mockEnv(),
    );
    expect(res.status).toBe(400);
  });
});

describe("adminApp KB ingestion (Etapa 9)", () => {
  it("POST /tenants/:id/kb hace upsert de los docs recibidos", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const res = await adminApp.request(
      "/tenants/vet-norte/kb",
      {
        method: "POST",
        headers: { Authorization: "Bearer test-admin-key", "Content-Type": "application/json" },
        body: JSON.stringify({ docs: [{ id: "horario", content: "9 a 18" }] }),
      },
      mockEnv({ VECTORIZE: { upsert } as unknown as VectorizeIndex }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, count: 1 });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("POST /tenants/:id/kb rechaza sin docs (400)", async () => {
    const res = await adminApp.request(
      "/tenants/vet-norte/kb",
      {
        method: "POST",
        headers: { Authorization: "Bearer test-admin-key", "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      mockEnv(),
    );
    expect(res.status).toBe(400);
  });
});
