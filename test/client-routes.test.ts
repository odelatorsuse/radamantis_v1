import { afterEach, describe, expect, it, vi } from "vitest";
import { clientApp } from "../src/client/routes";
import { hashPassword } from "../src/passwords";
import { createSessionToken } from "../src/client/session";

vi.mock("../src/rag/embeddings", () => ({
  embedText: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3], totalTokens: 5 }),
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

// Backlog de Agencia: Oscar detectó que /console mostraba las mismas
// pestañas a todos los tenants sin importar su giro (ej. "Torneos" para un
// dentista) — este endpoint es lo que /console usa para decidir qué
// pestañas mostrar, así que debe reflejar el vertical REAL del tenant.
describe("GET /vertical", () => {
  it("devuelve el vertical y sus tools reales del tenant (ej. padel)", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    (env.__first as ReturnType<typeof vi.fn>).mockResolvedValue({ vertical_id: "padel" });
    const res = await clientApp.request("/vertical", { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verticalId).toBe("padel");
    expect(body.toolsEnabled).toContain("registerForTournament");
    // Desde la ronda de "reservas de cancha/clases + tienda", padel SÍ
    // tiene calendario y catálogo además de las tools de torneo.
    expect(body.toolsEnabled).toContain("checkAvailability");
    expect(body.toolsEnabled).toContain("searchCatalog");
  });

  it("cae a sandbox (sin tools) si el tenant no tiene vertical_id en D1", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request("/vertical", { headers: { Authorization: `Bearer ${token}` } }, mockEnv());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.toolsEnabled).toEqual([]);
  });

  it("401 sin token", async () => {
    const res = await clientApp.request("/vertical", {}, mockEnv());
    expect(res.status).toBe(401);
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

  it("400 si el canal no tiene ChannelProvider registrado", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request(
      "/conversations/sms/555/send",
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ text: "hola" }) },
      mockEnvForSend(),
    );
    expect(res.status).toBe(400);
  });

  // Backlog de Agencia (WhatsApp, "tan fácil como Telegram"): responder
  // manual desde /console ya funciona igual para WhatsApp que para
  // Telegram, sin ningún cambio en esta ruta (getChannelProvider genérico).
  it("responde manual por WhatsApp igual que por Telegram (mismo mecanismo genérico)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request(
      "/conversations/whatsapp/5215500001111/send",
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ text: "hola" }) },
      mockEnvForSend({ channelToken: "pnid-1|token-1|waba-1" }),
    );
    expect(res.status).toBe(200);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/pnid-1/messages");
    vi.unstubAllGlobals();
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

describe("GET/PUT /auto-resume-handoff (auto-reanudar tras pausa)", () => {
  it("GET devuelve false por default (opt-in)", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request("/auto-resume-handoff", { headers: { Authorization: `Bearer ${token}` } }, mockEnv());
    expect(res.status).toBe(200);
    const body = await res.json<{ enabled: boolean }>();
    expect(body.enabled).toBe(false);
  });

  it("PUT activa el auto-reanudar", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    const res = await clientApp.request(
      "/auto-resume-handoff",
      { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ enabled: true }) },
      env,
    );
    expect(res.status).toBe(200);
    const lastBind = (env.__bind as ReturnType<typeof vi.fn>).mock.calls[(env.__bind as ReturnType<typeof vi.fn>).mock.calls.length - 1];
    expect(lastBind).toContain(1);
  });
});

describe("GET/PUT /handoff-keywords (palabras de handoff editables por tenant)", () => {
  it("GET devuelve [] por default", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request("/handoff-keywords", { headers: { Authorization: `Bearer ${token}` } }, mockEnv());
    expect(res.status).toBe(200);
    const body = await res.json<{ keywords: string[] }>();
    expect(body.keywords).toEqual([]);
  });

  it("PUT guarda las palabras, recortadas y sin vacías", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    const res = await clientApp.request(
      "/handoff-keywords",
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ keywords: ["  quiero hablar con el doctor  ", "", "cirugía urgente"] }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const lastBind = (env.__bind as ReturnType<typeof vi.fn>).mock.calls[(env.__bind as ReturnType<typeof vi.fn>).mock.calls.length - 1];
    expect(lastBind).toContain(JSON.stringify(["quiero hablar con el doctor", "cirugía urgente"]));
  });

  it("PUT sin keywords (o no-array) guarda una lista vacía", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    const res = await clientApp.request(
      "/handoff-keywords",
      { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({}) },
      env,
    );
    expect(res.status).toBe(200);
    const lastBind = (env.__bind as ReturnType<typeof vi.fn>).mock.calls[(env.__bind as ReturnType<typeof vi.fn>).mock.calls.length - 1];
    expect(lastBind).toContain(JSON.stringify([]));
  });
});

describe("GET/PUT /branding (White-label por tenant)", () => {
  it("GET devuelve null en los tres campos por default", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request("/branding", { headers: { Authorization: `Bearer ${token}` } }, mockEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ brandName: null, brandLogoUrl: null, brandColor: null });
  });

  it("PUT guarda nombre, logo y color, recortados", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    const res = await clientApp.request(
      "/branding",
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ brandName: "  Dr. Vet CH  ", brandLogoUrl: "https://ejemplo.com/logo.png", brandColor: "#0E9F6E" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const lastBind = (env.__bind as ReturnType<typeof vi.fn>).mock.calls[(env.__bind as ReturnType<typeof vi.fn>).mock.calls.length - 1];
    expect(lastBind).toContain("Dr. Vet CH");
    expect(lastBind).toContain("https://ejemplo.com/logo.png");
    expect(lastBind).toContain("#0E9F6E");
  });

  it("PUT rechaza un color que no es hex válido", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request(
      "/branding",
      { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ brandColor: "verde" }) },
      mockEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("PUT con campos vacíos los guarda como null (vuelve al default de Radamantis)", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    const res = await clientApp.request(
      "/branding",
      { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ brandName: "", brandLogoUrl: "", brandColor: "" }) },
      env,
    );
    expect(res.status).toBe(200);
    const lastBind = (env.__bind as ReturnType<typeof vi.fn>).mock.calls[(env.__bind as ReturnType<typeof vi.fn>).mock.calls.length - 1];
    expect(lastBind.slice(-4, -1)).toEqual([null, null, null]);
  });
});

// Backlog de Agencia (White-label, "el cliente pueda subir una imagen o
// foto de su negocio como icono, no solo una URL"): R2 no está habilitado
// en la cuenta de Cloudflare todavía, así que la imagen se guarda como
// data URI directo en brand_logo_url — mismo contrato que la URL pegada a
// mano, solo que generada por el servidor a partir de los bytes reales.
describe("POST /branding/logo (subida real de logo)", () => {
  it("rechaza un Content-Type no soportado", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request(
      "/branding/logo",
      { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/pdf" }, body: new Uint8Array([1, 2, 3]) },
      mockEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("rechaza un archivo vacío", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request(
      "/branding/logo",
      { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/png" }, body: new Uint8Array([]) },
      mockEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("rechaza un archivo más grande que el tope defensivo", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const tooBig = new Uint8Array(900 * 1024); // por encima de los 800KB del tope
    const res = await clientApp.request(
      "/branding/logo",
      { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/png" }, body: tooBig },
      mockEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("guarda un data URI válido y preserva brandName/brandColor existentes", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    (env.__first as ReturnType<typeof vi.fn>).mockResolvedValue({
      tone: "profesional", language: "es", timezone: "America/Mexico_City", currency: "MXN",
      prompt_override: null, business_hours: "{}", alert_chat_id: null, alert_activation_code: null,
      review_link: null, lead_reengagement_enabled: 0, auto_resume_handoff_enabled: 0, custom_handoff_keywords: "[]",
      brand_name: "Dr. Vet CH", brand_logo_url: null, brand_color: "#0E9F6E", staff_members: "[]",
    });
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]); // no necesita ser un PNG real, solo bytes
    const res = await clientApp.request(
      "/branding/logo",
      { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/png" }, body: bytes },
      env,
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.brandLogoUrl).toMatch(/^data:image\/png;base64,/);
    const lastBind = (env.__bind as ReturnType<typeof vi.fn>).mock.calls[(env.__bind as ReturnType<typeof vi.fn>).mock.calls.length - 1];
    expect(lastBind).toContain("Dr. Vet CH");
    expect(lastBind).toContain("#0E9F6E");
    expect(lastBind).toContain(data.brandLogoUrl);
  });
});

describe("GET/PUT /staff-members (Agencia, Fase 2 — agendar con persona específica)", () => {
  it("GET devuelve [] por default", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request("/staff-members", { headers: { Authorization: `Bearer ${token}` } }, mockEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ staffMembers: [] });
  });

  it("PUT guarda los nombres, recortados y sin vacíos", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    const res = await clientApp.request(
      "/staff-members",
      { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ staffMembers: ["  Ana  ", "", "Carlos"] }) },
      env,
    );
    expect(res.status).toBe(200);
    const lastBind = (env.__bind as ReturnType<typeof vi.fn>).mock.calls[(env.__bind as ReturnType<typeof vi.fn>).mock.calls.length - 1];
    expect(lastBind).toContain(JSON.stringify(["Ana", "Carlos"]));
  });

  it("PUT sin staffMembers (o no-array) guarda una lista vacía", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    const res = await clientApp.request(
      "/staff-members",
      { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({}) },
      env,
    );
    expect(res.status).toBe(200);
    const lastBind = (env.__bind as ReturnType<typeof vi.fn>).mock.calls[(env.__bind as ReturnType<typeof vi.fn>).mock.calls.length - 1];
    expect(lastBind).toContain(JSON.stringify([]));
  });
});

describe("GET/POST/PUT/DELETE /catalog (Agencia, Fase 2b — catálogo con fotos)", () => {
  it("GET devuelve la lista (vacía por default)", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request("/catalog", { headers: { Authorization: `Bearer ${token}` } }, mockEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [] });
  });

  it("POST rechaza sin title o description", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request(
      "/catalog",
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ title: "Pizza" }) },
      mockEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("POST crea un item con slug generado del título", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request(
      "/catalog",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: "Pizza Margarita", description: "Con queso y albahaca", price: "$150", photoUrl: "https://x.com/a.jpg" }),
      },
      mockEnv(),
    );
    expect(res.status).toBe(201);
    const body = await res.json<{ itemId: string }>();
    expect(body.itemId).toBe("pizza-margarita");
  });

  it("PUT actualiza un item existente", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request(
      "/catalog/pizza-margarita",
      { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ title: "Pizza Margarita", description: "Actualizada" }) },
      mockEnv(),
    );
    expect(res.status).toBe(200);
  });

  it("DELETE borra un item", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    const res = await clientApp.request("/catalog/pizza-margarita", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    expect((env.__run as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });
});

// Backlog de Agencia (padel, Fase 1: "Convocador Bot") — la lógica real de
// cupo/lista de espera/promoción ya se prueba a fondo en test/padel.test.ts
// y test/padelTool.test.ts contra un fake D1; aquí solo se verifica la
// forma de las rutas (validación, códigos de estado, scoping por tenant).
describe("GET/POST /torneos y DELETE /torneos/registrations/:id (padel, Fase 1)", () => {
  it("GET devuelve la lista de convocatorias abiertas (vacía por default)", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request("/torneos", { headers: { Authorization: `Bearer ${token}` } }, mockEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tournaments: [] });
  });

  it("POST rechaza sin label/scheduledAt/registrationDeadline", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request(
      "/torneos",
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ label: "Categoría B" }) },
      mockEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("POST abre una convocatoria nueva con cupo default 20", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    (env.__run as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, meta: { last_row_id: 7 } });
    const res = await clientApp.request(
      "/torneos",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label: "Categoría B", scheduledAt: "2026-09-10T19:00:00", registrationDeadline: "2026-09-10T18:00:00" }),
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = await res.json<{ tournamentId: number }>();
    expect(body.tournamentId).toBe(7);
  });

  it("POST /torneos/:id/close cierra la convocatoria", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    const res = await clientApp.request("/torneos/7/close", { method: "POST", headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    expect((env.__run as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });

  it("DELETE /torneos/registrations/:id devuelve 404 si la inscripción no existe", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request("/torneos/registrations/999", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }, mockEnv());
    expect(res.status).toBe(404);
  });
});

// Backlog de Agencia (padel, Fase 2: "Reception Bot" — check-in en el club).
describe("PUT /torneos/registrations/:id/checkin y POST /torneos/:id/registrations (padel, Fase 2)", () => {
  it("PUT checkin marca pagado/asistió", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    const res = await clientApp.request(
      "/torneos/registrations/1/checkin",
      { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ paid: true, attended: true }) },
      env,
    );
    expect(res.status).toBe(200);
    expect((env.__run as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });

  it("POST registro espontáneo rechaza sin playerName", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request(
      "/torneos/1/registrations",
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({}) },
      mockEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("POST registro espontáneo devuelve 404 si la convocatoria no existe", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request(
      "/torneos/999/registrations",
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ playerName: "Espontáneo" }) },
      mockEnv(),
    );
    expect(res.status).toBe(404);
  });
});

// Backlog de Agencia (padel, Fase 3-4: "Score Engine") — la lógica real de
// fixture/puntaje/playoffs ya se prueba a fondo en test/padelMatches.test.ts
// contra un fake D1; aquí solo se verifica la forma de las rutas.
describe("POST /torneos/:id/fixture, PUT matches/:id/score, POST playoffs/final (padel, Fase 3-4)", () => {
  it("POST fixture devuelve 404 si la convocatoria no existe", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request("/torneos/999/fixture", { method: "POST", headers: { Authorization: `Bearer ${token}` } }, mockEnv());
    expect(res.status).toBe(404);
  });

  it("PUT score rechaza sin scoreA/scoreB numéricos", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request(
      "/torneos/matches/1/score",
      { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ scoreA: "veintiuno" }) },
      mockEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("PUT score devuelve 404 si el match no existe", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request(
      "/torneos/matches/999/score",
      { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ scoreA: 21, scoreB: 15 }) },
      mockEnv(),
    );
    expect(res.status).toBe(404);
  });

  it("POST playoffs devuelve 404 si la convocatoria no existe", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request("/torneos/999/playoffs", { method: "POST", headers: { Authorization: `Bearer ${token}` } }, mockEnv());
    expect(res.status).toBe(404);
  });

  it("POST final devuelve 404 si la convocatoria no existe", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request("/torneos/999/final", { method: "POST", headers: { Authorization: `Bearer ${token}` } }, mockEnv());
    expect(res.status).toBe(404);
  });
});

// Backlog de Agencia (padel): "Limpiar / Iniciar nuevo torneo" — destructivo
// real (Oscar lo confirmó explícitamente), así que exige confirmLabel
// exacto — mismo patrón que "Zona de peligro" al borrar un tenant.
describe("POST /torneos/:id/reset (padel, Limpiar/Iniciar nuevo torneo)", () => {
  it("404 si la convocatoria no existe", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request(
      "/torneos/999/reset",
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ confirmLabel: "x", scheduledAt: "2026-09-17T19:00:00", registrationDeadline: "2026-09-17T18:00:00" }) },
      mockEnv(),
    );
    expect(res.status).toBe(404);
  });

  it("400 si confirmLabel no coincide con el nombre real", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    (env.__first as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1, tenant_id: "vet-ch", label: "Reta 6ta - Martes", category: "6ta",
      scheduled_at_utc: "x", registration_deadline_utc: "y", capacity: 20, status: "finalizado", created_at: "z",
    });
    const res = await clientApp.request(
      "/torneos/1/reset",
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ confirmLabel: "nombre incorrecto", scheduledAt: "2026-09-17T19:00:00", registrationDeadline: "2026-09-17T18:00:00" }) },
      env,
    );
    expect(res.status).toBe(400);
  });

  // Backlog de Agencia (ronda de reestructura): Oscar confirmó que escribir
  // el nombre exacto ya es confirmación suficiente — las fechas son
  // opcionales, si no se mandan se mantienen las que ya tenía la convocatoria.
  it("200 sin mandar fechas nuevas — el nombre exacto ya es confirmación suficiente", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    (env.__first as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1, tenant_id: "vet-ch", label: "Reta 6ta - Martes", category: "6ta",
      scheduled_at_utc: "x", registration_deadline_utc: "y", capacity: 20, status: "finalizado", created_at: "z",
    });
    const res = await clientApp.request(
      "/torneos/1/reset",
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ confirmLabel: "Reta 6ta - Martes" }) },
      env,
    );
    expect(res.status).toBe(200);
    // scheduledAtUtc/registrationDeadlineUtc deben ir como null (mantiene las existentes vía COALESCE).
    const resetCall = (env.__bind as ReturnType<typeof vi.fn>).mock.calls.find((call) => call.includes(1) && call.length === 4);
    expect(resetCall).toEqual([null, null, 1, "vet-ch"]);
  });

  it("200 y borra/reinicia cuando confirmLabel coincide y vienen las fechas", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    (env.__first as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1, tenant_id: "vet-ch", label: "Reta 6ta - Martes", category: "6ta",
      scheduled_at_utc: "x", registration_deadline_utc: "y", capacity: 20, status: "finalizado", created_at: "z",
    });
    const res = await clientApp.request(
      "/torneos/1/reset",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmLabel: "Reta 6ta - Martes", scheduledAt: "2026-09-17T19:00:00", registrationDeadline: "2026-09-17T18:00:00" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect((env.__batch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });
});

// Backlog de Agencia (padel, ronda de categorías): 6 categorías reales
// (6ta..1ra), cada una con su grupo de Telegram y día configurable.
describe("GET/PUT /padel-categorias y GET/PUT /padel-settings (padel, categorías)", () => {
  it("GET /padel-categorias devuelve las 6 categorías (vacías por default)", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request("/padel-categorias", { headers: { Authorization: `Bearer ${token}` } }, mockEnv());
    expect(res.status).toBe(200);
    const body = await res.json<{ categories: unknown[] }>();
    expect(body.categories).toHaveLength(6);
  });

  it("PUT /padel-categorias/:category rechaza una categoría inválida", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request(
      "/padel-categorias/septima",
      { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ weekday: 2 }) },
      mockEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("PUT /padel-categorias/:category guarda día y chat de una categoría válida", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    const res = await clientApp.request(
      "/padel-categorias/6ta",
      { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ weekday: 2, chatId: "-100123" }) },
      env,
    );
    expect(res.status).toBe(200);
    expect((env.__run as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });

  it("POST /torneos rechaza una categoría que no es una de las 6 reales", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request(
      "/torneos",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label: "Reta", category: "septima", scheduledAt: "2026-09-10T19:00:00", registrationDeadline: "2026-09-10T18:00:00" }),
      },
      mockEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("GET /padel-settings devuelve 5 rondas, 5 canchas y modalidad individual por default", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request("/padel-settings", { headers: { Authorization: `Bearer ${token}` } }, mockEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rounds: 5, courtCount: 5, defaultRegistrationMode: "individual" });
  });

  it("PUT /padel-settings rechaza un número de rondas inválido", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request(
      "/padel-settings",
      { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ rounds: 0, courtCount: 5 }) },
      mockEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("PUT /padel-settings rechaza un número de canchas inválido", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const res = await clientApp.request(
      "/padel-settings",
      { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ rounds: 5, courtCount: 0 }) },
      mockEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("PUT /padel-settings guarda rondas y canchas válidas", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 1);
    const env = mockEnv();
    const res = await clientApp.request(
      "/padel-settings",
      { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ rounds: 4, courtCount: 3, defaultRegistrationMode: "pareja" }) },
      env,
    );
    expect(res.status).toBe(200);
    expect((env.__run as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });
});
