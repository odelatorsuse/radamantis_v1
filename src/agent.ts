import { createHandoff, detectsHandoffRequest, HANDOFF_REPLY_MESSAGE, isPaused } from "./handoff";
import { OpenAIProvider } from "./llm/openai";
import { buildMessages, type LLMMessage } from "./llm/provider";
import { appendMessage, getHistory, type ConversationRef } from "./messages";
import { buildRagSystemPrompt } from "./prompts";
import { embedText } from "./rag/embeddings";
import { searchKb } from "./rag/search";
import { logUsage } from "./usage";

interface Env {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  OPENAI_API_KEY: string;
}

interface ReplyRequest extends ConversationRef {
  userText: string;
}

// D2/D1: un Durable Object por conversación (tenantId:channel:chatId) —
// serializa la memoria de esa conversación y delega la persistencia a D1.
export class ConversationAgent {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const { tenantId, channel, chatId, userText } = (await request.json()) as ReplyRequest;
    const ref: ConversationRef = { tenantId, channel, chatId };

    // Etapa 6 (CORE): mientras la conversación esté en handoff, el bot deja
    // de auto-responder — solo registra el mensaje para que lo vea un humano.
    if (await isPaused(this.env.DB, ref)) {
      await appendMessage(this.env.DB, ref, { role: "user", content: userText });
      return Response.json({ replyText: null });
    }

    if (detectsHandoffRequest(userText)) {
      await appendMessage(this.env.DB, ref, { role: "user", content: userText });
      await createHandoff(this.env.DB, ref, userText);
      await appendMessage(this.env.DB, ref, { role: "assistant", content: HANDOFF_REPLY_MESSAGE });
      return Response.json({ replyText: HANDOFF_REPLY_MESSAGE });
    }

    const history = await getHistory(this.env.DB, ref);
    const historyMessages: LLMMessage[] = history.map((m) => ({ role: m.role, content: m.content }));

    const queryEmbedding = await embedText(this.env.OPENAI_API_KEY, userText);
    const kbMatches = await searchKb(this.env.VECTORIZE, queryEmbedding, tenantId);
    const systemPrompt = buildRagSystemPrompt(kbMatches);

    const llm = new OpenAIProvider(this.env.OPENAI_API_KEY);
    const messages = buildMessages(systemPrompt, historyMessages, userText);
    const completion = await llm.complete(messages);

    await appendMessage(this.env.DB, ref, { role: "user", content: userText });
    await appendMessage(this.env.DB, ref, { role: "assistant", content: completion.text });
    await logUsage(this.env.DB, { tenantId, channel, model: llm.model, usage: completion.usage });

    return Response.json({ replyText: completion.text });
  }
}
