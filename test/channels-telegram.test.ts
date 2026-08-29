import { afterEach, describe, expect, it, vi } from "vitest";
import { registerTelegramWebhook, telegramChannelProvider } from "../src/channels/telegram";

describe("registerTelegramWebhook", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("arma la URL con el origen del Worker y el token, y manda el secret_token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await registerTelegramWebhook("https://radamantis.example.workers.dev", "bot-token-123", "shh");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/botbot-token-123/setWebhook",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          url: "https://radamantis.example.workers.dev/webhook/telegram/bot-token-123",
          secret_token: "shh",
        }),
      }),
    );
  });

  it("devuelve ok:false con el motivo si Telegram rechaza el setWebhook", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: false, description: "token inválido" }) }),
    );

    const result = await registerTelegramWebhook("https://x.workers.dev", "bad-token", "shh");

    expect(result).toEqual({ ok: false, error: "token inválido" });
  });

  it("devuelve ok:false si la request HTTP falla", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => null }));

    const result = await registerTelegramWebhook("https://x.workers.dev", "bad-token", "shh");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("500");
  });

  it("reintenta respetando retry_after cuando Telegram responde 429 (Etapa 9)", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 429,
        ok: false,
        json: async () => ({ ok: false, parameters: { retry_after: 1 } }),
      })
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const promise = registerTelegramWebhook("https://x.workers.dev", "bot-token", "shh");
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("deja de reintentar tras el máximo de intentos y devuelve el error 429", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 429, ok: false, json: async () => ({ ok: false, parameters: { retry_after: 1 } }) }),
    );

    const promise = registerTelegramWebhook("https://x.workers.dev", "bot-token", "shh");
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result.ok).toBe(false);
    expect(result.error).toContain("429");
    vi.useRealTimers();
  });
});

describe("telegramChannelProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("implementa ChannelProvider: sendMessage manda por la API real de Telegram", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    await telegramChannelProvider.sendMessage("bot-token-123", "555", "hola");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/botbot-token-123/sendMessage",
      expect.objectContaining({ body: JSON.stringify({ chat_id: 555, text: "hola" }) }),
    );
  });

  it("expone channel y displayName", () => {
    expect(telegramChannelProvider.channel).toBe("telegram");
    expect(telegramChannelProvider.displayName).toBe("Telegram");
  });
});
