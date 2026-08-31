import { afterEach, describe, expect, it, vi } from "vitest";
import { adminApp } from "../src/admin/routes";
import { hashPassword } from "../src/passwords";

vi.mock("../src/rag/embeddings", () => ({
  embedText: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3], totalTokens: 5 }),
}));

const SESSION_SECRET = "test-admin-session-secret";

function mockEnv(overrides?: Record<string, unknown>) {
  const first = vi.fn().mockResolvedValue(null);
  const all = vi.fn().mockResolvedValue({ results: [] });
  const run = vi.fn().mockResolvedValue({ success: true });
  const bind = vi.fn().mockReturnValue({ all, first, run });
  const prepare = vi.fn().mockReturnValue({ bind, all });
  const batch = vi.fn().mockResolvedValue([]);
  const db = { prepare, batch } as unknown as D1Database;
  return {
    DB: db,
    ADMIN_API_KEY: "test-admin-key",
    ADMIN_SESSION_SECRET: SESSION_SECRET,
    OPENAI_API_KEY: "fake-openai-key",
    TELEGRAM_WEBHOOK_SECRET: "webhook-secret",
    VECTORIZE: { upsert: vi.fn().mockResolvedValue({}) } as unknown as VectorizeIndex,
    __first: first,
    __run: run,
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

  it("GET /tenants/:id/flow devuelve 404 si no existe (Agencia)", async () => {
    const res = await adminApp.request(
      "/tenants/no-existe/flow",
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

describe("adminApp GET /tenants/:id/users (Agencia — UI de 'Acceso a consola')", () => {
  it("devuelve la lista de usuarios del tenant", async () => {
    const all = vi.fn().mockResolvedValue({ results: [{ id: 1, email: "a@b.com", created_at: "2026-08-31" }] });
    const env = mockEnv({ DB: { prepare: vi.fn().mockReturnValue({ bind: () => ({ all }) }) } as unknown as D1Database });
    const res = await adminApp.request("/tenants/vet-ch/users", { headers: { Authorization: "Bearer test-admin-key" } }, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ users: [{ id: 1, email: "a@b.com", createdAt: "2026-08-31" }] });
  });
});

describe("adminApp PUT /tenants/:id/staff-members (Agencia — preguntas mínimas de alta)", () => {
  it("guarda el staff vía setStaffMembers, preservando el resto de settings", async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const first = vi.fn().mockResolvedValue(null); // getTenantSettings -> defaults (sin fila)
    const bind = vi.fn().mockReturnValue({ first, run });
    const env = mockEnv({ DB: { prepare: vi.fn().mockReturnValue({ bind }) } as unknown as D1Database });

    const res = await adminApp.request(
      "/tenants/vet-ch/staff-members",
      {
        method: "PUT",
        headers: { Authorization: "Bearer test-admin-key", "Content-Type": "application/json" },
        body: JSON.stringify({ staffMembers: ["Ana", "Carlos"] }),
      },
      env,
    );
    expect(res.status).toBe(200);
    // 2 escrituras: upsertTenantSettings (staff) + logAdminAction (auditoría).
    expect(run).toHaveBeenCalledTimes(2);
    const staffCall = bind.mock.calls.find((call) => call.includes(JSON.stringify(["Ana", "Carlos"])));
    expect(staffCall).toBeDefined();
  });

  it("rechaza sin auth (401)", async () => {
    const res = await adminApp.request(
      "/tenants/vet-ch/staff-members",
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staffMembers: [] }) },
      mockEnv(),
    );
    expect(res.status).toBe(401);
  });
});

// Compartido por "Borrar cliente" y "Ver consola" — ambos dependen de
// getTenantDetail, que hace varias consultas encadenadas (tenant, settings,
// canales, contadores).
function mockDeletableTenantEnv() {
  const batch = vi.fn().mockResolvedValue([]);
  const db = {
    prepare: vi.fn((sql: string) => {
      if (sql.includes("FROM tenants")) {
        return { bind: () => ({ first: async () => ({ id: "vet-ch", name: "Dr. Vet CH", vertical_id: "veterinaria", created_at: "2026-01-01" }) }) };
      }
      if (sql.includes("FROM kb_documents")) {
        return { bind: () => ({ all: async () => ({ results: [] }) }) };
      }
      if (sql.includes("FROM tenant_settings")) {
        return { bind: () => ({ first: async () => null }) };
      }
      if (sql.includes("FROM channel_bindings")) {
        return { bind: () => ({ all: async () => ({ results: [] }) }) };
      }
      if (sql.includes("INSERT INTO admin_actions")) {
        return { bind: () => ({ run: async () => ({ success: true }) }) };
      }
      return { bind: () => ({ first: async () => ({ messages_in: 0, messages_out: 0, conversations: 0, open_handoffs: 0 }) }) };
    }),
    batch,
  } as unknown as D1Database;
  return {
    DB: db,
    ADMIN_API_KEY: "test-admin-key",
    ADMIN_SESSION_SECRET: SESSION_SECRET,
    CLIENT_SESSION_SECRET: "test-client-session-secret",
    OPENAI_API_KEY: "fake-openai-key",
    TELEGRAM_WEBHOOK_SECRET: "webhook-secret",
    VECTORIZE: { deleteByIds: vi.fn().mockResolvedValue({}) } as unknown as VectorizeIndex,
    __batch: batch,
  };
}

describe("adminApp POST /tenants/:id/console-preview-token (Agencia — ver consola sin cambiar de ventana)", () => {
  it("devuelve 404 si el tenant no existe", async () => {
    const res = await adminApp.request(
      "/tenants/no-existe/console-preview-token",
      { method: "POST", headers: { Authorization: "Bearer test-admin-key" } },
      mockEnv(),
    );
    expect(res.status).toBe(404);
  });

  it("rechaza sin auth (401)", async () => {
    const res = await adminApp.request(
      "/tenants/vet-ch/console-preview-token",
      { method: "POST" },
      mockDeletableTenantEnv(),
    );
    expect(res.status).toBe(401);
  });

  it("devuelve un token de impersonación y el tenantId (200, solo rol admin)", async () => {
    const res = await adminApp.request(
      "/tenants/vet-ch/console-preview-token",
      { method: "POST", headers: { Authorization: "Bearer test-admin-key" } },
      mockDeletableTenantEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantId).toBe("vet-ch");
    expect(typeof body.token).toBe("string");
    expect(body.token.split(".")).toHaveLength(2); // formato de session.ts: body.firma
  });
});

describe("adminApp DELETE /tenants/:id ('Borrar cliente')", () => {
  it("rechaza si confirmId no coincide exactamente con el id del tenant (400)", async () => {
    const res = await adminApp.request(
      "/tenants/vet-ch",
      { method: "DELETE", headers: { Authorization: "Bearer test-admin-key", "Content-Type": "application/json" }, body: JSON.stringify({ confirmId: "otro-id" }) },
      mockDeletableTenantEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("devuelve 404 si el tenant no existe", async () => {
    const res = await adminApp.request(
      "/tenants/no-existe",
      { method: "DELETE", headers: { Authorization: "Bearer test-admin-key", "Content-Type": "application/json" }, body: JSON.stringify({ confirmId: "no-existe" }) },
      mockEnv(),
    );
    expect(res.status).toBe(404);
  });

  it("borra el tenant cuando confirmId coincide, y registra la auditoría con tenantId null", async () => {
    const env = mockDeletableTenantEnv();
    const res = await adminApp.request(
      "/tenants/vet-ch",
      { method: "DELETE", headers: { Authorization: "Bearer test-admin-key", "Content-Type": "application/json" }, body: JSON.stringify({ confirmId: "vet-ch" }) },
      env,
    );
    expect(res.status).toBe(200);
    expect(env.__batch).toHaveBeenCalled();
  });
});

describe("adminApp channels (Etapa 9 — auto-registro de webhook)", () => {
  // vi.restoreAllMocks() también limpiaba el mock de embedText definido a
  // nivel de módulo (vi.mock arriba), rompiendo tests de OTROS describe
  // blocks más adelante en este archivo — solo hace falta deshacer los
  // vi.stubGlobal("fetch", ...) de este bloque, no todos los mocks.
  afterEach(() => {
    vi.unstubAllGlobals();
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

describe("adminApp channels/supported (Etapa 10 — multi-canal)", () => {
  it("GET /channels/supported devuelve el catálogo de canales con adaptador real", async () => {
    const res = await adminApp.request("/channels/supported", { headers: { Authorization: "Bearer test-admin-key" } }, mockEnv());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      channels: [
        { channel: "telegram", displayName: "Telegram" },
        { channel: "web", displayName: "Sitio web" },
        { channel: "facebook", displayName: "Facebook Messenger" },
        { channel: "instagram", displayName: "Instagram" },
      ],
    });
  });
});

function mockPlatformSettingsDb(row: { meta_app_id: string | null; meta_app_secret: string | null; meta_verify_token: string | null } | null) {
  const first = vi.fn().mockResolvedValue(row);
  const run = vi.fn().mockResolvedValue({ success: true });
  const bind = vi.fn().mockReturnValue({ first, run });
  const prepare = vi.fn().mockReturnValue({ bind, first, run });
  return { prepare, batch: vi.fn() } as unknown as D1Database;
}

describe("adminApp platform-settings (Agencia — conectores Meta, autoservicio)", () => {
  it("GET /platform-settings devuelve null en todo si no se ha configurado nada", async () => {
    const res = await adminApp.request(
      "/platform-settings",
      { headers: { Authorization: "Bearer test-admin-key" } },
      mockEnv({ DB: mockPlatformSettingsDb(null) }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ metaAppId: null, metaAppSecret: null, metaVerifyToken: null });
  });

  it("PUT /platform-settings guarda App ID/Secret/Verify Token", async () => {
    const res = await adminApp.request(
      "/platform-settings",
      { method: "PUT", headers: { Authorization: "Bearer test-admin-key", "Content-Type": "application/json" }, body: JSON.stringify({ metaAppId: "app-1", metaAppSecret: "secret-1" }) },
      mockEnv({ DB: mockPlatformSettingsDb(null) }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("GET /tenants/:id/channels/meta/connect-url devuelve 400 si falta el App ID", async () => {
    const res = await adminApp.request(
      "/tenants/vet-ch/channels/meta/connect-url",
      { headers: { Authorization: "Bearer test-admin-key" } },
      mockEnv({ DB: mockPlatformSettingsDb(null) }),
    );
    expect(res.status).toBe(400);
  });

  it("GET /tenants/:id/channels/meta/connect-url arma la URL cuando el App ID ya está guardado", async () => {
    const res = await adminApp.request(
      "/tenants/vet-ch/channels/meta/connect-url",
      { headers: { Authorization: "Bearer test-admin-key" } },
      mockEnv({ DB: mockPlatformSettingsDb({ meta_app_id: "app-123", meta_app_secret: "s", meta_verify_token: "v" }) }),
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ url: string }>();
    expect(body.url).toContain("client_id=app-123");
    expect(body.url).toContain("state=vet-ch");
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

describe("POST /login (Etapa Agencia — Equipo/roles)", () => {
  it("400 si faltan email/password", async () => {
    const res = await adminApp.request("/login", { method: "POST", body: JSON.stringify({}) }, mockEnv());
    expect(res.status).toBe(400);
  });

  it("401 si el usuario no existe", async () => {
    const res = await adminApp.request(
      "/login",
      { method: "POST", body: JSON.stringify({ email: "nadie@nada.com", password: "x" }) },
      mockEnv(),
    );
    expect(res.status).toBe(401);
  });

  it("401 si la contraseña es incorrecta", async () => {
    const hash = await hashPassword("correcta");
    const env = mockEnv();
    (env.__first as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1, email: "a@b.com", password_hash: hash, role: "operador" });
    const res = await adminApp.request(
      "/login",
      { method: "POST", body: JSON.stringify({ email: "a@b.com", password: "incorrecta" }) },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("200 con token y role si las credenciales son correctas", async () => {
    const hash = await hashPassword("correcta");
    const env = mockEnv();
    (env.__first as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1, email: "a@b.com", password_hash: hash, role: "operador" });
    const res = await adminApp.request(
      "/login",
      { method: "POST", body: JSON.stringify({ email: "a@b.com", password: "correcta" }) },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ token: string; role: string }>();
    expect(body.role).toBe("operador");
    expect(typeof body.token).toBe("string");
  });
});

describe("auth por sesión de equipo + gating por rol (Etapa Agencia)", () => {
  async function loginAs(env: ReturnType<typeof mockEnv>, role: "admin" | "operador") {
    const hash = await hashPassword("clave-valida");
    (env.__first as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 1, email: "persona@x.com", password_hash: hash, role });
    const res = await adminApp.request(
      "/login",
      { method: "POST", body: JSON.stringify({ email: "persona@x.com", password: "clave-valida" }) },
      env,
    );
    const body = await res.json<{ token: string }>();
    return body.token;
  }

  it("un token de sesión válido da acceso a rutas normales (GET /tenants)", async () => {
    const env = mockEnv();
    const token = await loginAs(env, "operador");
    const res = await adminApp.request("/tenants", { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
  });

  it("un token con secreto distinto (otra sesión) es rechazado", async () => {
    const env = mockEnv();
    const res = await adminApp.request(
      "/tenants",
      { headers: { Authorization: "Bearer no-es-un-token-valido" } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("rol operador recibe 403 en POST /tenants (crear tenant es solo admin)", async () => {
    const env = mockEnv();
    const token = await loginAs(env, "operador");
    const res = await adminApp.request(
      "/tenants",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: "x", name: "X", verticalId: "veterinaria" }),
      },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("rol operador recibe 403 en PUT /tenants/:id/channels/:channel (rotar token es solo admin)", async () => {
    const env = mockEnv();
    const token = await loginAs(env, "operador");
    const res = await adminApp.request(
      "/tenants/vet-ch/channels/telegram",
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ externalId: "nuevo-token" }),
      },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("rol operador recibe 403 en GET /usage (ver costos es solo admin)", async () => {
    const env = mockEnv();
    const token = await loginAs(env, "operador");
    const res = await adminApp.request("/usage", { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(403);
  });

  it("rol admin (vía sesión, no API key) sí puede crear tenants", async () => {
    const env = mockEnv();
    const token = await loginAs(env, "admin");
    const res = await adminApp.request(
      "/tenants",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: "x", name: "X", verticalId: "veterinaria" }),
      },
      env,
    );
    expect(res.status).toBe(201);
  });

  it("la llave maestra ADMIN_API_KEY sigue teniendo acceso total (rol admin implícito)", async () => {
    const env = mockEnv();
    const res = await adminApp.request("/usage", { headers: { Authorization: "Bearer test-admin-key" } }, env);
    expect(res.status).toBe(200);
  });
});

describe("gestión de equipo /admin-users (Etapa Agencia)", () => {
  it("rechaza sin auth (401)", async () => {
    const res = await adminApp.request("/admin-users", {}, mockEnv());
    expect(res.status).toBe(401);
  });

  it("POST /admin-users crea un usuario nuevo con la llave maestra", async () => {
    const res = await adminApp.request(
      "/admin-users",
      {
        method: "POST",
        headers: { Authorization: "Bearer test-admin-key", "Content-Type": "application/json" },
        body: JSON.stringify({ email: "socio@radamantis.dev", password: "clave-de-8-o-mas", role: "admin" }),
      },
      mockEnv(),
    );
    expect(res.status).toBe(201);
  });

  it("POST /admin-users rechaza un role inválido (400)", async () => {
    const res = await adminApp.request(
      "/admin-users",
      {
        method: "POST",
        headers: { Authorization: "Bearer test-admin-key", "Content-Type": "application/json" },
        body: JSON.stringify({ email: "x@x.com", password: "clave-de-8-o-mas", role: "superusuario" }),
      },
      mockEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("GET /admin-users lista el equipo", async () => {
    const env = mockEnv();
    (env.DB.prepare("").bind().all as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [{ id: 1, email: "a@b.com", role: "admin", created_at: "2026-01-01" }],
    });
    const res = await adminApp.request("/admin-users", { headers: { Authorization: "Bearer test-admin-key" } }, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ users: unknown[] }>();
    expect(body.users).toHaveLength(1);
  });

  it("DELETE /admin-users/:id revoca el acceso", async () => {
    const res = await adminApp.request(
      "/admin-users/1",
      { method: "DELETE", headers: { Authorization: "Bearer test-admin-key" } },
      mockEnv(),
    );
    expect(res.status).toBe(200);
  });
});
