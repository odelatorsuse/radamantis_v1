import { afterEach, describe, expect, it, vi } from "vitest";
import { parseMetaWebhookMessages, sendMetaMessage, subscribePageToApp, verifyMetaSignature } from "../src/channels/meta";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendMetaMessage", () => {
  it("llama al Send API de Meta con recipient/message y el access_token en la URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendMetaMessage("page-token", "psid-1", "hola");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("access_token=page-token");
    expect(JSON.parse(init.body as string)).toEqual({ recipient: { id: "psid-1" }, message: { text: "hola" } });
  });

  it("lanza un error claro si Meta falla", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }));
    await expect(sendMetaMessage("page-token", "psid-1", "hola")).rejects.toThrow(/Send API falló/);
  });
});

describe("subscribePageToApp", () => {
  it("devuelve ok:true si Meta confirma success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }));
    expect(await subscribePageToApp("page-token")).toEqual({ ok: true });
  });

  it("devuelve el mensaje de error real de Meta si falla", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { message: "Invalid token" } }) }));
    expect(await subscribePageToApp("page-token")).toEqual({ ok: false, error: "Invalid token" });
  });
});

describe("verifyMetaSignature", () => {
  it("valida una firma HMAC-SHA256 real generada con el mismo App Secret", async () => {
    const appSecret = "mi-app-secret";
    const body = '{"object":"page","entry":[]}';
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");

    expect(await verifyMetaSignature(appSecret, body, `sha256=${hex}`)).toBe(true);
  });

  it("rechaza una firma que no coincide", async () => {
    expect(await verifyMetaSignature("mi-app-secret", "{}", "sha256=deadbeef")).toBe(false);
  });

  it("rechaza si falta el header o no tiene el prefijo sha256=", async () => {
    expect(await verifyMetaSignature("s", "{}", undefined)).toBe(false);
    expect(await verifyMetaSignature("s", "{}", "abc123")).toBe(false);
  });
});

describe("parseMetaWebhookMessages", () => {
  it("extrae mensajes de texto de un payload object=page", () => {
    const body = {
      object: "page",
      entry: [{ id: "page-1", messaging: [{ sender: { id: "psid-1" }, message: { text: "hola" } }] }],
    };
    expect(parseMetaWebhookMessages(body, "page")).toEqual([{ pageId: "page-1", senderId: "psid-1", text: "hola" }]);
  });

  it("ignora eventos que no coinciden con el object esperado", () => {
    const body = { object: "instagram", entry: [{ id: "ig-1", messaging: [{ sender: { id: "x" }, message: { text: "hola" } }] }] };
    expect(parseMetaWebhookMessages(body, "page")).toEqual([]);
  });

  it("ignora is_echo (el propio mensaje del bot reenviado por el webhook)", () => {
    const body = {
      object: "page",
      entry: [{ id: "page-1", messaging: [{ sender: { id: "psid-1" }, message: { text: "hola", is_echo: true } }] }],
    };
    expect(parseMetaWebhookMessages(body, "page")).toEqual([]);
  });

  it("ignora eventos sin texto (ej. solo attachments)", () => {
    const body = { object: "page", entry: [{ id: "page-1", messaging: [{ sender: { id: "psid-1" } }] }] };
    expect(parseMetaWebhookMessages(body, "page")).toEqual([]);
  });
});
