import type { LLMMessage, LLMProvider, LLMResponse } from "./provider";

interface OpenAIChatCompletion {
  choices: { message: { content: string | null } }[];
  usage: { prompt_tokens: number; completion_tokens: number };
}

export class OpenAIProvider implements LLMProvider {
  constructor(
    private readonly apiKey: string,
    readonly model: string = "gpt-4o-mini",
  ) {}

  async complete(messages: LLMMessage[]): Promise<LLMResponse> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI completion falló: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as OpenAIChatCompletion;
    return {
      text: data.choices[0]?.message?.content ?? "",
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
      },
    };
  }
}
