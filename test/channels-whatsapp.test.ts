import { afterEach, describe, expect, it, vi } from "vitest";
import { buildWhatsAppExternalId, parseWhatsAppExternalId, whatsappChannelProvider } from "../src/channels/whatsapp";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildWhatsAppExternalId / parseWhatsAppExternalId", () => {
  it("hace round-trip de los 3 valores reales", () => {
    const creds = { phoneNumberId: "pnid-1", accessToken: "system-user-token", wabaId: "waba-1" };
    expect(parseWhatsAppExternalId(buildWhatsAppExternalId(creds))).toEqual(creds);
  });
});

describe("whatsappChannelProvider.sendMessage", () => {
  it("separa phoneNumberId/accessToken del externalId compuesto y llama al Send API real", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const externalId = buildWhatsAppExternalId({ phoneNumberId: "pnid-1", accessToken: "token-1", wabaId: "waba-1" });
    await whatsappChannelProvider.sendMessage(externalId, "5215500001111", "hola");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/pnid-1/messages");
    expect(init.headers.Authorization).toBe("Bearer token-1");
    expect(JSON.parse(init.body as string).to).toBe("5215500001111");
  });
});

describe("whatsappChannelProvider.sendPhoto", () => {
  it("usa el mismo externalId compuesto para mandar una imagen", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const externalId = buildWhatsAppExternalId({ phoneNumberId: "pnid-1", accessToken: "token-1", wabaId: "waba-1" });
    await whatsappChannelProvider.sendPhoto!(externalId, "521", "https://x.com/a.jpg");

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string).type).toBe("image");
  });
});

describe("whatsappChannelProvider.registerWebhook", () => {
  it("suscribe el WABA (no el número) al App, con el access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const externalId = buildWhatsAppExternalId({ phoneNumberId: "pnid-1", accessToken: "token-1", wabaId: "waba-77" });
    const result = await whatsappChannelProvider.registerWebhook!("https://radamantis.example", externalId, "unused");

    expect(result).toEqual({ ok: true });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/waba-77/subscribed_apps");
  });

  it("falla con un mensaje claro si el externalId no trae wabaId", async () => {
    const result = await whatsappChannelProvider.registerWebhook!("https://radamantis.example", "pnid-1|token-1", "unused");
    expect(result.ok).toBe(false);
  });
});
