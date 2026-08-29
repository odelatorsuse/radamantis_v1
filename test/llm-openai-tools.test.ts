import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAIProvider } from "../src/llm/openai";
import type { ToolDefinition } from "../src/llm/provider";

const tool: ToolDefinition = {
  name: "checkAvailability",
  description: "test",
  parameters: { type: "object", properties: {} },
};

describe("OpenAIProvider.complete con tools", () => {
  afterEach(() => vi.restoreAllMocks());

  it("manda las tools en el body cuando se pasan", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "hola" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await new OpenAIProvider("key").complete([{ role: "user", content: "hola" }], [tool]);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools).toEqual([{ type: "function", function: { name: "checkAvailability", description: "test", parameters: tool.parameters } }]);
  });

  it("no manda 'tools' en el body si no se pasan", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "hola" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await new OpenAIProvider("key").complete([{ role: "user", content: "hola" }]);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools).toBeUndefined();
  });

  it("parsea tool_calls de la respuesta a nuestro shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [{ id: "call_1", function: { name: "checkAvailability", arguments: '{"rangeStart":"a"}' } }],
              },
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        }),
      }),
    );

    const result = await new OpenAIProvider("key").complete([{ role: "user", content: "hola" }], [tool]);

    expect(result.text).toBe("");
    expect(result.toolCalls).toEqual([{ id: "call_1", name: "checkAvailability", arguments: '{"rangeStart":"a"}' }]);
  });

  it("serializa mensajes assistant con toolCalls y mensajes tool con tool_call_id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "listo" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await new OpenAIProvider("key").complete([
      { role: "user", content: "agenda" },
      { role: "assistant", content: "", toolCalls: [{ id: "call_1", name: "bookAppointment", arguments: "{}" }] },
      { role: "tool", content: '{"ok":true}', toolCallId: "call_1" },
    ]);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[1]).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [{ id: "call_1", type: "function", function: { name: "bookAppointment", arguments: "{}" } }],
    });
    expect(body.messages[2]).toEqual({ role: "tool", tool_call_id: "call_1", content: '{"ok":true}' });
  });
});
