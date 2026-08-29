import { recordAppointmentFromToolCall } from "./calendar/appointments";
import { GoogleCalendarProvider } from "./calendar/google";
import { getValidAccessToken } from "./calendar/oauth";
import { CALENDAR_TOOLS, executeCalendarTool } from "./calendar/tools";
import { createHandoff, detectsHandoffRequest, detectsUrgentSentiment, HANDOFF_REPLY_MESSAGE, isPaused } from "./handoff";
import { OpenAIProvider } from "./llm/openai";
import { buildMessages, type LLMMessage, type LLMUsage } from "./llm/provider";
import { appendMessage, getHistory, type ConversationRef } from "./messages";
import { buildSystemPrompt, hasRelevantMatch } from "./prompts";
import { embedText } from "./rag/embeddings";
import { recordKbGap } from "./rag/gaps";
import { searchKb, type KbMatch } from "./rag/search";
import { getTenantSettings } from "./tenants";
import { logUsage } from "./usage";
import { getVerticalTemplate } from "./verticals/registry";
import { notifyBusinessOwner } from "./vigilante";

interface Env {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  OPENAI_API_KEY: string;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
}

interface ReplyRequest extends ConversationRef {
  userText: string;
  verticalId: string;
}

function sumUsage(a: LLMUsage, b: LLMUsage): LLMUsage {
  return { promptTokens: a.promptTokens + b.promptTokens, completionTokens: a.completionTokens + b.completionTokens };
}

// D2/D1: un Durable Object por conversación (tenantId:channel:chatId) —
// serializa la memoria de esa conversación y delega la persistencia a D1.
export class ConversationAgent {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const { tenantId, channel, chatId, userText, verticalId } = (await request.json()) as ReplyRequest;
    const ref: ConversationRef = { tenantId, channel, chatId };
    const template = getVerticalTemplate(verticalId);

    // Etapa 6 (CORE): mientras la conversación esté en handoff, el bot deja
    // de auto-responder — solo registra el mensaje para que lo vea un humano.
    if (await isPaused(this.env.DB, ref)) {
      await appendMessage(this.env.DB, ref, { role: "user", content: userText });
      return Response.json({ replyText: null });
    }

    if (template.toolsEnabled.includes("handoffHuman") && (detectsHandoffRequest(userText) || detectsUrgentSentiment(userText))) {
      await appendMessage(this.env.DB, ref, { role: "user", content: userText });
      await createHandoff(this.env.DB, ref, userText);
      await appendMessage(this.env.DB, ref, { role: "assistant", content: HANDOFF_REPLY_MESSAGE });
      // Etapa 10 (superpower "Vigilante"): avisa al dueño en tiempo real —
      // antes de esto, un handoff pasaba en silencio hasta que alguien
      // revisara /admin o /console.
      await notifyBusinessOwner(this.env.DB, ref, userText);
      return Response.json({ replyText: HANDOFF_REPLY_MESSAGE });
    }

    const history = await getHistory(this.env.DB, ref);
    const historyMessages: LLMMessage[] = history.map((m) => ({ role: m.role, content: m.content }));

    // Etapa 7 (D6): la tool "searchKb" solo corre si el Vertical Template
    // del tenant la tiene habilitada — un vertical sin KB no gasta en
    // embeddings ni en Vectorize.
    let kbMatches: KbMatch[] | null = null;
    if (template.toolsEnabled.includes("searchKb")) {
      const queryEmbedding = await embedText(this.env.OPENAI_API_KEY, userText);
      kbMatches = await searchKb(this.env.VECTORIZE, queryEmbedding, tenantId);
      // Etapa 10 (superpower "Mejoras"): ninguna respuesta con confianza en
      // la KB — se registra para que el dueño sepa qué le falta agregar. El
      // bot nunca "aprende solo" de esto, la decisión de qué agregar es
      // siempre humana (mismo principio que el blindaje anti-invento).
      if (!hasRelevantMatch(kbMatches)) {
        await recordKbGap(this.env.DB, tenantId, userText);
      }
    }

    // Etapa 10 (Fase B): calendario solo se ofrece como tool si el vertical
    // lo tiene habilitado Y el tenant ya conectó su propio Google Calendar.
    let calendarProvider: GoogleCalendarProvider | null = null;
    const wantsCalendar =
      template.toolsEnabled.includes("checkAvailability") || template.toolsEnabled.includes("bookAppointment");
    if (wantsCalendar) {
      const connection = await getValidAccessToken(
        this.env.DB,
        this.env.GOOGLE_OAUTH_CLIENT_ID,
        this.env.GOOGLE_OAUTH_CLIENT_SECRET,
        tenantId,
      );
      if (connection) {
        calendarProvider = new GoogleCalendarProvider(connection.accessToken, connection.calendarId);
      }
    }

    // Etapa 8.5: config en caliente (tono/idioma/moneda/override de prompt),
    // sin redeploy — se lee en cada request, no hay caché.
    const tenantSettings = await getTenantSettings(this.env.DB, tenantId);
    const systemPrompt = buildSystemPrompt(
      template.promptBase,
      kbMatches,
      tenantSettings,
      calendarProvider !== null,
      userText,
    );

    const llm = new OpenAIProvider(this.env.OPENAI_API_KEY);
    const messages = buildMessages(systemPrompt, historyMessages, userText);
    const tools = calendarProvider ? CALENDAR_TOOLS : undefined;

    let completion = await llm.complete(messages, tools);
    let usage = completion.usage;

    // Una sola vuelta de tool-calling: si el modelo pidió herramientas, las
    // ejecutamos contra el calendario real y le devolvemos los resultados
    // para que dé la respuesta final en texto. No se persisten los pasos
    // intermedios en `messages`, solo el mensaje final.
    if (completion.toolCalls.length > 0 && calendarProvider) {
      const toolResultMessages: LLMMessage[] = [];
      for (const toolCall of completion.toolCalls) {
        // Log de auditoría — sin esto, depurar "por qué dijo tal horario"
        // significa adivinar (ya nos pasó). Visible con `wrangler tail`.
        console.log("calendar tool call", tenantId, toolCall.name, toolCall.arguments);
        const result = await executeCalendarTool(
          toolCall.name,
          toolCall.arguments,
          calendarProvider,
          tenantSettings.timezone,
          tenantSettings.businessHours,
        );
        console.log("calendar tool result", tenantId, toolCall.name, result);
        toolResultMessages.push({ role: "tool", content: result, toolCallId: toolCall.id });

        // Etapa 10 (superpower "Recupera no-shows"): guarda un rastro local
        // de la cita agendada — Google Calendar no nos da de vuelta el
        // chat_id/canal para poder recontactar al cliente después.
        if (toolCall.name === "bookAppointment") {
          await recordAppointmentFromToolCall(this.env.DB, ref, toolCall.arguments, result, tenantSettings.timezone);
        }
      }

      const followUpMessages: LLMMessage[] = [
        ...messages,
        { role: "assistant", content: completion.text, toolCalls: completion.toolCalls },
        ...toolResultMessages,
      ];
      const followUp = await llm.complete(followUpMessages);
      usage = sumUsage(usage, followUp.usage);
      completion = followUp;
    }

    await appendMessage(this.env.DB, ref, { role: "user", content: userText });
    await appendMessage(this.env.DB, ref, { role: "assistant", content: completion.text });
    await logUsage(this.env.DB, { tenantId, channel, model: llm.model, usage });

    return Response.json({ replyText: completion.text });
  }
}
