import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseMetaWebhookMessages,
  parseWhatsAppWebhookMessages,
  sendMetaMessage,
  sendMetaPhoto,
  sendWhatsAppMessage,
  sendWhatsAppPhoto,
  subscribePageToApp,
  subscribeWabaToApp,
  verifyMetaSignature,
} from "../src/channels/meta";

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

describe("sendMetaPhoto (Agencia, Fase 2b: catálogo con fotos)", () => {
  it("manda un attachment tipo image con la URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendMetaPhoto("page-token", "psid-1", "https://x.com/a.jpg");

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({
      recipient: { id: "psid-1" },
      message: { attachment: { type: "image", payload: { url: "https://x.com/a.jpg", is_reusable: true } } },
    });
  });

  it("lanza un error claro si Meta falla", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }));
    await expect(sendMetaPhoto("page-token", "psid-1", "https://x.com/a.jpg")).rejects.toThrow(/Send API \(foto\) falló/);
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

// Backlog de Agencia (WhatsApp): mismo Send API de Meta, endpoint distinto
// (/{phone_number_id}/messages, no /me/messages) y auth por header Bearer
// (el System User token de Oscar) en vez de query param.
describe("sendWhatsAppMessage", () => {
  it("llama al endpoint de phone_number_id con Bearer y el body real de WhatsApp Cloud API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendWhatsAppMessage("pnid-1", "system-user-token", "5215500001111", "hola");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/pnid-1/messages");
    expect(init.headers.Authorization).toBe("Bearer system-user-token");
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: "whatsapp",
      to: "5215500001111",
      type: "text",
      text: { body: "hola" },
    });
  });

  it("lanza un error claro si Meta falla", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }));
    await expect(sendWhatsAppMessage("pnid-1", "token", "521", "hola")).rejects.toThrow(/WhatsApp Send API falló/);
  });
});

describe("sendWhatsAppPhoto", () => {
  it("manda type image con link y caption opcional", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendWhatsAppPhoto("pnid-1", "token", "521", "https://x.com/a.jpg", "Mira esto");

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: "whatsapp",
      to: "521",
      type: "image",
      image: { link: "https://x.com/a.jpg", caption: "Mira esto" },
    });
  });

  it("sin caption no manda esa clave", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendWhatsAppPhoto("pnid-1", "token", "521", "https://x.com/a.jpg");

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string).image).toEqual({ link: "https://x.com/a.jpg" });
  });
});

describe("subscribeWabaToApp", () => {
  it("devuelve ok:true si Meta confirma success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }));
    expect(await subscribeWabaToApp("waba-1", "token")).toEqual({ ok: true });
  });

  it("devuelve el mensaje de error real de Meta si falla", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { message: "Invalid token" } }) }));
    expect(await subscribeWabaToApp("waba-1", "token")).toEqual({ ok: false, error: "Invalid token" });
  });
});

describe("parseWhatsAppWebhookMessages", () => {
  it("extrae phoneNumberId/senderId/text de un mensaje de texto real", () => {
    const body = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "pnid-1" },
                messages: [{ from: "5215500001111", type: "text", text: { body: "hola" } }],
              },
            },
          ],
        },
      ],
    };
    expect(parseWhatsAppWebhookMessages(body)).toEqual([{ phoneNumberId: "pnid-1", senderId: "5215500001111", text: "hola" }]);
  });

  it("ignora actualizaciones de estado (value.statuses, sin value.messages)", () => {
    const body = {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: { metadata: { phone_number_id: "pnid-1" }, statuses: [{ status: "delivered" }] } }] }],
    };
    expect(parseWhatsAppWebhookMessages(body)).toEqual([]);
  });

  it("ignora mensajes que no son de tipo texto (ej. imagen entrante)", () => {
    const body = {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: { metadata: { phone_number_id: "pnid-1" }, messages: [{ from: "521", type: "image" }] } }] }],
    };
    expect(parseWhatsAppWebhookMessages(body)).toEqual([]);
  });

  it("devuelve [] si el object no es whatsapp_business_account", () => {
    const body = { object: "page", entry: [] };
    expect(parseWhatsAppWebhookMessages(body)).toEqual([]);
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
