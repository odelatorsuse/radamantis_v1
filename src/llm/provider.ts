// Etapa 10 (Fase B): tool calling real — un ToolCall es lo que el modelo
// pide ejecutar; el core lo corre y devuelve el resultado como un mensaje
// role:"tool" para que el modelo dé la respuesta final.
export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON crudo, cada handler lo parsea según su propio schema
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema del objeto de argumentos
}

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[]; // presente en mensajes assistant que piden tool calls
  toolCallId?: string; // presente en mensajes tool, liga con ToolCall.id
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface LLMResponse {
  text: string;
  toolCalls: ToolCall[];
  usage: LLMUsage;
}

// D5: interfaz desacoplada del proveedor. OpenAI es el default; Anthropic
// se agrega como otro adaptador que implemente esto, sin tocar el core.
export interface LLMProvider {
  readonly model: string;
  complete(messages: LLMMessage[], tools?: ToolDefinition[]): Promise<LLMResponse>;
}

export function buildMessages(systemPrompt: string, history: LLMMessage[], userText: string): LLMMessage[] {
  return [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: userText }];
}
