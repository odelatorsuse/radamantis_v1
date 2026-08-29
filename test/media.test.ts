import { afterEach, describe, expect, it, vi } from "vitest";
import { describeImage, transcribeVoice } from "../src/media";

describe("transcribeVoice", () => {
  afterEach(() => vi.restoreAllMocks());

  it("devuelve el texto transcrito por Whisper", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: "hola doctor" }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await transcribeVoice("sk-test", new ArrayBuffer(4), "audio/ogg");

    expect(result).toBe("hola doctor");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/audio/transcriptions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("lanza un error claro si OpenAI falla", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }));

    await expect(transcribeVoice("sk-test", new ArrayBuffer(4), "audio/ogg")).rejects.toThrow(/transcription falló/);
  });
});

describe("describeImage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("devuelve la descripción generada por el modelo de visión", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "un perro con una mancha roja en la pata" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await describeImage("sk-test", new ArrayBuffer(4), "image/jpeg");

    expect(result).toBe("un perro con una mancha roja en la pata");
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages[0].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("lanza un error claro si OpenAI falla", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }));

    await expect(describeImage("sk-test", new ArrayBuffer(4), "image/jpeg")).rejects.toThrow(/vision falló/);
  });
});
