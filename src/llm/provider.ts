export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface LLMResponse {
  text: string;
  usage: LLMUsage;
}

// D5: interfaz desacoplada del proveedor. OpenAI es el default; Anthropic
// se agrega como otro adaptador que implemente esto, sin tocar el core.
export interface LLMProvider {
  readonly model: string;
  complete(messages: LLMMessage[]): Promise<LLMResponse>;
}

export function buildMessages(systemPrompt: string, userText: string): LLMMessage[] {
  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userText },
  ];
}
