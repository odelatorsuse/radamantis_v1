import { describe, expect, it, vi } from "vitest";
import { clientApp } from "../src/client/routes";
import { hashPassword } from "../src/client/passwords";
import { createSessionToken } from "../src/client/session";

const SECRET = "test-client-session-secret";

function mockEnv(overrides?: Record<string, unknown>) {
  const first = vi.fn().mockResolvedValue(null);
  const all = vi.fn().mockResolvedValue({ results: [] });
  const run = vi.fn().mockResolvedValue({ success: true });
  const bind = vi.fn().mockReturnValue({ first, all, run });
  const prepare = vi.fn().mockReturnValue({ bind });
  const db = { prepare } as unknown as D1Database;
  return { DB: db, CLIENT_SESSION_SECRET: SECRET, __first: first, __all: all, __bind: bind, ...overrides };
}

describe("POST /login", () => {
  it("400 si faltan email/password", async () => {
    const res = await clientApp.request("/login", { method: "POST", body: JSON.stringify({}) }, mockEnv());
    expect(res.status).toBe(400);
  });

  it("401 si el usuario no existe", async () => {
    const env = mockEnv();
    const res = await clientApp.request(
      "/login",
      { method: "POST", body: JSON.stringify({ email: "nadie@nada.com", password: "x" }) },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("401 si la contraseña es incorrecta", async () => {
    const hash = await hashPassword("correcta");
    const env = mockEnv();
    (env.__first as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1, tenant_id: "vet-ch", email: "a@b.com", password_hash: hash });
    const res = await clientApp.request(
      "/login",
      { method: "POST", body: JSON.stringify({ email: "a@b.com", password: "incorrecta" }) },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("200 con token si las credenciales son correctas", async () => {
    const hash = await hashPassword("correcta");
    const env = mockEnv();
    (env.__first as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1, tenant_id: "vet-ch", email: "a@b.com", password_hash: hash });
    const res = await clientApp.request(
      "/login",
      { method: "POST", body: JSON.stringify({ email: "a@b.com", password: "correcta" }) },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ token: string; tenantId: string }>();
    expect(body.tenantId).toBe("vet-ch");
    expect(typeof body.token).toBe("string");
  });
});

describe("auth middleware", () => {
  it("401 sin Authorization header", async () => {
    const res = await clientApp.request("/stats/today", {}, mockEnv());
    expect(res.status).toBe(401);
  });

  it("401 con un token inválido", async () => {
    const res = await clientApp.request("/stats/today", { headers: { Authorization: "Bearer no-es-un-token" } }, mockEnv());
    expect(res.status).toBe(401);
  });

  it("401 con un token firmado con otro secret", async () => {
    const token = await createSessionToken("otro-secret", "vet-ch", 1);
    const res = await clientApp.request("/stats/today", { headers: { Authorization: `Bearer ${token}` } }, mockEnv());
    expect(res.status).toBe(401);
  });

  it("200 con un token válido, y usa el tenantId del token (no uno de la URL)", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    const res = await clientApp.request("/stats/today", { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    expect(env.__bind).toHaveBeenCalledWith("vet-ch");
  });
});

describe("aislamiento entre tenants", () => {
  it("las rutas de conversación nunca reciben tenantId de la URL, solo del token", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    await clientApp.request(
      "/conversations/telegram/555/messages",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    // getHistory se llama con [tenantId, channel, chatId, limit] — el tenantId debe ser el del token.
    expect(env.__bind).toHaveBeenCalledWith("vet-ch", "telegram", "555", 100);
  });

  it("POST pause/resume operan sobre el chat correcto del tenant autenticado", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    const res = await clientApp.request(
      "/conversations/telegram/555/pause",
      { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    expect(env.__bind).toHaveBeenCalledWith("vet-ch", "telegram", "555", expect.stringContaining("consola del cliente"));
  });
});
