import { afterEach, describe, expect, it, vi } from "vitest";
import { clientApp } from "../src/client/routes";
import { hashPassword } from "../src/passwords";
import { createSessionToken } from "../src/client/session";

vi.mock("../src/rag/embeddings", () => ({
  embedText: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

const SECRET = "test-client-session-secret";

function mockEnv(overrides?: Record<string, unknown>) {
  const first = vi.fn().mockResolvedValue(null);
  const all = vi.fn().mockResolvedValue({ results: [] });
  const run = vi.fn().mockResolvedValue({ success: true });
  const bind = vi.fn().mockReturnValue({ first, all, run });
  const prepare = vi.fn().mockReturnValue({ bind });
  const batch = vi.fn().mockResolvedValue([]);
  const db = { prepare, batch } as unknown as D1Database;
  return {
    DB: db,
    CLIENT_SESSION_SECRET: SECRET,
    OPENAI_API_KEY: "fake-openai-key",
    VECTORIZE: { upsert: vi.fn().mockResolvedValue({}), deleteByIds: vi.fn().mockResolvedValue({}) } as unknown as VectorizeIndex,
    __first: first,
    __all: all,
    __bind: bind,
    __run: run,
    __batch: batch,
    ...overrides,
  };
}

// Para /send se necesitan respuestas distintas según la query (token del
// canal vs. estado de pausa) — se despacha por contenido del SQL, igual que
// test/noShowSweep.test.ts.
function mockEnvForSend(opts: { channelToken?: string | null; alreadyPaused?: boolean } = {}) {
  const channelToken = opts.channelToken === undefined ? "bot-token-vet-ch" : opts.channelToken;
  const alreadyPaused = opts.alreadyPaused ?? false;
  const run = vi.fn().mockResolvedValue({ success: true });

  const prepare = vi.fn((sql: string) => ({
    bind: vi.fn(() => ({
      first: vi.fn().mockResolvedValue(
        sql.includes("FROM channel_bindings")
          ? channelToken !== null
            ? { external_id: channelToken }
            : null
          : sql.includes("FROM handoffs")
            ? (alreadyPaused ? { id: 1 } : null)
            : null,
      ),
      run,
    })),
  }));

  const db = { prepare } as unknown as D1Database;
  return { DB: db, CLIENT_SESSION_SECRET: SECRET, __run: run };
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

describe("POST /conversations/:channel/:chatId/send (manejo de chats)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("400 si falta el texto", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request(
      "/conversations/telegram/555/send",
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({}) },
      mockEnvForSend(),
    );
    expect(res.status).toBe(400);
  });

  it("400 si el canal no es telegram todavía", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request(
      "/conversations/whatsapp/555/send",
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ text: "hola" }) },
      mockEnvForSend(),
    );
    expect(res.status).toBe(400);
  });

  it("404 si el tenant no tiene channel_binding de telegram", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request(
      "/conversations/telegram/555/send",
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ text: "hola" }) },
      mockEnvForSend({ channelToken: null }),
    );
    expect(res.status).toBe(404);
  });

  it("502 si Telegram rechaza el envío, y no guarda el mensaje ni pausa", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "bad request" }));
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnvForSend();
    const res = await clientApp.request(
      "/conversations/telegram/555/send",
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ text: "hola" }) },
      env,
    );
    expect(res.status).toBe(502);
    expect(env.__run).not.toHaveBeenCalled();
  });

  it("200: manda el mensaje real por Telegram, lo guarda con sentBy=human, y pausa el bot si no lo estaba", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnvForSend({ alreadyPaused: false });
    const res = await clientApp.request(
      "/conversations/telegram/555/send",
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ text: "Ya vamos para allá" }) },
      env,
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("https://api.telegram.org/botbot-token-vet-ch/sendMessage"),
      expect.objectContaining({ method: "POST" }),
    );
    // Dos escrituras: INSERT INTO messages (appendMessage) e INSERT INTO handoffs (auto-pausa).
    expect(env.__run).toHaveBeenCalledTimes(2);
  });

  it("200: no crea un segundo handoff si la conversación ya estaba pausada", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "" }));
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnvForSend({ alreadyPaused: true });
    const res = await clientApp.request(
      "/conversations/telegram/555/send",
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ text: "Ya vamos para allá" }) },
      env,
    );
    expect(res.status).toBe(200);
    // Solo una escritura: INSERT INTO messages — no un segundo handoff.
    expect(env.__run).toHaveBeenCalledTimes(1);
  });
});

describe("GET/DELETE /alert-settings (superpower Vigilante)", () => {
  it("GET genera un código de activación nuevo si el tenant no tiene uno", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request("/alert-settings", { headers: { Authorization: `Bearer ${token}` } }, mockEnv());
    expect(res.status).toBe(200);
    const body = await res.json<{ activationCode: string; configured: boolean }>();
    expect(body.activationCode).toMatch(/^[0-9A-F]{8}$/);
    expect(body.configured).toBe(false);
  });

  it("GET devuelve configured:true si ya hay un alert_chat_id guardado", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    (env.__first as ReturnType<typeof vi.fn>).mockResolvedValue({
      tone: "calido",
      language: "es",
      currency: "MXN",
      prompt_override: null,
      timezone: "America/Mexico_City",
      business_hours: "{}",
      alert_chat_id: "999",
      alert_activation_code: "ABCD1234",
    });
    const res = await clientApp.request("/alert-settings", { headers: { Authorization: `Bearer ${token}` } }, env);
    const body = await res.json<{ activationCode: string; configured: boolean }>();
    expect(body).toEqual({ activationCode: "ABCD1234", configured: true });
  });

  it("DELETE limpia el chat_id de alertas", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    const res = await clientApp.request("/alert-settings", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    expect(env.__run).toHaveBeenCalled();
  });
});

describe("GET/DELETE /kb-gaps (superpower Mejoras)", () => {
  it("GET lista los huecos del tenant autenticado, no de un parámetro de URL", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    (env.__all as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [{ id: 1, question: "¿Atienden reptiles?", created_at: "2026-09-01T10:00:00Z" }],
    });
    const res = await clientApp.request("/kb-gaps", { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ gaps: unknown[] }>();
    expect(body.gaps).toEqual([{ id: 1, question: "¿Atienden reptiles?", createdAt: "2026-09-01T10:00:00Z" }]);
    expect(env.__bind).toHaveBeenCalledWith("vet-ch", 50);
  });

  it("DELETE descarta por id, scoped al tenant del token", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    const res = await clientApp.request("/kb-gaps/7", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    expect(env.__bind).toHaveBeenCalledWith(7, "vet-ch");
  });
});

describe("/kb (Conocimiento, Etapa Agencia — autoservicio del dueño del negocio)", () => {
  it("GET lista los documentos del tenant autenticado", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    (env.__all as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [{ doc_id: "faq", title: "FAQ", content: "...", char_count: 10, updated_at: "2026-08-30" }],
    });
    const res = await clientApp.request("/kb", { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ documents: unknown[] }>();
    expect(body.documents).toEqual([{ docId: "faq", title: "FAQ", content: "...", charCount: 10, updatedAt: "2026-08-30" }]);
  });

  it("POST crea un documento nuevo con un slug derivado del título", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv(); // first() -> null: el slug no existe todavía
    const res = await clientApp.request(
      "/kb",
      { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ title: "Preguntas Frecuentes", content: "contenido" }) },
      env,
    );
    expect(res.status).toBe(201);
    const body = await res.json<{ ok: boolean; docId: string }>();
    expect(body.docId).toBe("preguntas-frecuentes");
  });

  it("POST rechaza sin title/content (400)", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request(
      "/kb",
      { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ title: "" }) },
      mockEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("PUT actualiza un documento existente (mismo docId, sin generar uno nuevo)", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    const res = await clientApp.request(
      "/kb/faq",
      { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ title: "FAQ", content: "nuevo contenido" }) },
      env,
    );
    expect(res.status).toBe(200);
    expect((env.VECTORIZE as { upsert: ReturnType<typeof vi.fn> }).upsert).toHaveBeenCalledWith([
      { id: "vet-ch:faq", values: expect.any(Array), metadata: { tenant_id: "vet-ch", doc_id: "faq", content: "nuevo contenido" } },
    ]);
  });

  it("DELETE borra el vector y la fila, scoped al tenant del token", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    const res = await clientApp.request("/kb/faq", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    expect((env.VECTORIZE as { deleteByIds: ReturnType<typeof vi.fn> }).deleteByIds).toHaveBeenCalledWith(["vet-ch:faq"]);
  });

  it("POST /kb/reindex re-embebe todos los documentos existentes", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    (env.__all as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [{ doc_id: "faq", title: "FAQ", content: "contenido", char_count: 9, updated_at: "2026-08-30" }],
    });
    const res = await clientApp.request("/kb/reindex", { method: "POST", headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; count: number }>();
    expect(body.count).toBe(1);
  });
});

describe("GET/PUT /review-link (unifica no-shows + encuesta + reseñas)", () => {
  it("GET devuelve null si no hay link configurado", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request("/review-link", { headers: { Authorization: `Bearer ${token}` } }, mockEnv());
    expect(res.status).toBe(200);
    const body = await res.json<{ reviewLink: string | null }>();
    expect(body.reviewLink).toBeNull();
  });

  it("PUT guarda el link, recortando espacios", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    const res = await clientApp.request(
      "/review-link",
      { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ reviewLink: "  https://g.page/r/x/review  " }) },
      env,
    );
    expect(res.status).toBe(200);
    const lastBind = (env.__bind as ReturnType<typeof vi.fn>).mock.calls[(env.__bind as ReturnType<typeof vi.fn>).mock.calls.length - 1];
    expect(lastBind).toContain("https://g.page/r/x/review");
  });

  it("PUT con string vacío guarda null (permite borrar el link)", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    await clientApp.request(
      "/review-link",
      { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ reviewLink: "   " }) },
      env,
    );
    const lastBind = (env.__bind as ReturnType<typeof vi.fn>).mock.calls[(env.__bind as ReturnType<typeof vi.fn>).mock.calls.length - 1];
    expect(lastBind).toContain(null);
  });
});

describe("GET/PUT /lead-reengagement (superpower Reenganche de leads fríos)", () => {
  it("GET devuelve false por default (opt-in)", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request("/lead-reengagement", { headers: { Authorization: `Bearer ${token}` } }, mockEnv());
    expect(res.status).toBe(200);
    const body = await res.json<{ enabled: boolean }>();
    expect(body.enabled).toBe(false);
  });

  it("PUT activa el reenganche", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    const res = await clientApp.request(
      "/lead-reengagement",
      { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ enabled: true }) },
      env,
    );
    expect(res.status).toBe(200);
    const lastBind = (env.__bind as ReturnType<typeof vi.fn>).mock.calls[(env.__bind as ReturnType<typeof vi.fn>).mock.calls.length - 1];
    expect(lastBind).toContain(1);
  });
});
