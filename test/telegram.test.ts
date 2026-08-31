import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadTelegramFile, extractIncomingMessage, sendTelegramPhoto } from "../src/telegram";

describe("extractIncomingMessage", () => {
  it("extrae chatId y texto de un update válido", () => {
    const update = {
      update_id: 1,
      message: { message_id: 1, chat: { id: 42 }, text: "hola" },
    };
    expect(extractIncomingMessage(update)).toEqual({ chatId: 42, text: "hola" });
  });

  it("devuelve null si el update no tiene mensaje", () => {
    expect(extractIncomingMessage({ update_id: 1 })).toBeNull();
  });

  it("devuelve null si el mensaje no tiene texto, voz ni foto (ej. sticker)", () => {
    const update = {
      update_id: 1,
      message: { message_id: 1, chat: { id: 42 } },
    };
    expect(extractIncomingMessage(update)).toBeNull();
  });

  it("extrae voice con fileId y mimeType", () => {
    const update = {
      update_id: 1,
      message: { message_id: 1, chat: { id: 42 }, voice: { file_id: "abc", mime_type: "audio/ogg" } },
    };
    expect(extractIncomingMessage(update)).toEqual({ chatId: 42, voice: { fileId: "abc", mimeType: "audio/ogg" } });
  });

  it("usa audio/ogg como mimeType por default si Telegram no lo manda", () => {
    const update = {
      update_id: 1,
      message: { message_id: 1, chat: { id: 42 }, voice: { file_id: "abc" } },
    };
    expect(extractIncomingMessage(update)).toEqual({ chatId: 42, voice: { fileId: "abc", mimeType: "audio/ogg" } });
  });

  it("extrae la foto de mayor resolución (última del arreglo)", () => {
    const update = {
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 42 },
        photo: [
          { file_id: "small", file_size: 100 },
          { file_id: "large", file_size: 5000 },
        ],
      },
    };
    expect(extractIncomingMessage(update)).toEqual({ chatId: 42, photo: { fileId: "large" } });
  });
});

describe("downloadTelegramFile", () => {
  afterEach(() => vi.restoreAllMocks());

  it("resuelve getFile y descarga los bytes del archivo", async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, result: { file_path: "voice/file.ogg" } }) })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => bytes });
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadTelegramFile("bot-token", "file-id");

    expect(result).toBe(bytes);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.telegram.org/botbot-token/getFile?file_id=file-id");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.telegram.org/file/botbot-token/voice/file.ogg");
  });

  it("lanza un error claro si getFile falla", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ ok: false, description: "bad" }) }),
    );

    await expect(downloadTelegramFile("bot-token", "file-id")).rejects.toThrow(/getFile falló/);
  });
});

describe("sendTelegramPhoto (Agencia, Fase 2b: catálogo con fotos)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("manda la foto por URL directa, sin descargarla primero", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendTelegramPhoto("bot-token", 42, "https://ejemplo.com/foto.jpg", "Depa en Polanco — $2,500,000");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/botbot-token/sendPhoto",
      expect.objectContaining({ method: "POST" }),
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({
      chat_id: 42,
      photo: "https://ejemplo.com/foto.jpg",
      caption: "Depa en Polanco — $2,500,000",
    });
  });

  it("lanza un error claro si Telegram falla", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "bad url" }));
    await expect(sendTelegramPhoto("bot-token", 42, "no-es-una-url")).rejects.toThrow(/sendPhoto falló/);
  });
});
