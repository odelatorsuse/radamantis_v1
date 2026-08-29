import type { LLMMessage, LLMProvider, LLMResponse, ToolDefinition } from "./provider";

interface OpenAIToolCall {
  id: string;
  function: { name: string; arguments: string };
}

interface OpenAIChatCompletion {
  choices: { message: { content: string | null; tool_calls?: OpenAIToolCall[] } }[];
  usage: { prompt_tokens: number; completion_tokens: number };
}

function toOpenAIMessages(messages: LLMMessage[]): Record<string, unknown>[] {
  return messages.map((m) => {
    if (m.role === "assistant" && m.toolCalls?.length) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
    }
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
    }
    return { role: m.role, content: m.content };
  });
}

function toOpenAITools(tools: ToolDefinition[]): Record<string, unknown>[] {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export class OpenAIProvider implements LLMProvider {
  constructor(
    private readonly apiKey: string,
    readonly model: string = "gpt-4o-mini",
  ) {}

  async complete(messages: LLMMessage[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    const body: Record<string, unknown> = { model: this.model, messages: toOpenAIMessages(messages) };
    if (tools?.length) {
      body.tools = toOpenAITools(tools);
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`OpenAI completion falló: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as OpenAIChatCompletion;
    const message = data.choices[0]?.message;
    return {
      text: message?.content ?? "",
      toolCalls: (message?.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      })),
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
      },
    };
  }
}
