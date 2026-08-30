import { afterEach, describe, expect, it, vi } from "vitest";
import { describeImage, transcribeVoice } from "../src/media";

describe("transcribeVoice", () => {
  afterEach(() => vi.restoreAllMocks());

  it("devuelve el texto transcrito y la duración real (verbose_json)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: "hola doctor", duration: 4.2 }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await transcribeVoice("sk-test", new ArrayBuffer(4), "audio/ogg");

    expect(result).toEqual({ text: "hola doctor", durationSeconds: 4.2 });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/audio/transcriptions",
      expect.objectContaining({ method: "POST" }),
    );
    const [, init] = fetchMock.mock.calls[0];
    const form = init.body as FormData;
    expect(form.get("response_format")).toBe("verbose_json");
  });

  it("lanza un error claro si OpenAI falla", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }));

    await expect(transcribeVoice("sk-test", new ArrayBuffer(4), "audio/ogg")).rejects.toThrow(/transcription falló/);
  });
});

describe("describeImage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("devuelve la descripción y los tokens reales usados", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "un perro con una mancha roja en la pata" } }],
        usage: { prompt_tokens: 300, completion_tokens: 20 },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await describeImage("sk-test", new ArrayBuffer(4), "image/jpeg");

    expect(result).toEqual({ description: "un perro con una mancha roja en la pata", promptTokens: 300, completionTokens: 20 });
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
