import { recordAppointmentFromToolCall } from "./calendar/appointments";
import { executeFeedbackTool, RECORD_FEEDBACK_TOOL } from "./calendar/feedbackTool";
import { GoogleCalendarProvider } from "./calendar/google";
import { getValidAccessToken } from "./calendar/oauth";
import { buildCalendarTools, executeCalendarTool } from "./calendar/tools";
import { executeSearchCatalogTool, SEARCH_CATALOG_TOOL } from "./catalogTool";
import { getChannelProvider } from "./channels/registry";
import { createHandoff, detectsHandoffRequest, detectsUrgentSentiment, HANDOFF_REPLY_MESSAGE, isPaused } from "./handoff";
import { OpenAIProvider } from "./llm/openai";
import { buildMessages, type LLMMessage, type LLMUsage } from "./llm/provider";
import { appendMessage, getHistory, type ConversationRef } from "./messages";
import { buildSystemPrompt, hasRelevantMatch } from "./prompts";
import { embedText } from "./rag/embeddings";
import { recordKbGap } from "./rag/gaps";
import { searchKb, type KbMatch } from "./rag/search";
import { getChannelExternalId, getTenantSettings } from "./tenants";
import { logToolCall } from "./toolCalls";
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
  // Agencia ("velocidad de respuesta"): si se manda (>0), este mensaje se
  // encola junto con los que lleguen en los próximos `bufferSeconds` y se
  // procesan juntos como un solo turno, en vez de responder de inmediato
  // — para no contestarle por partes a alguien que está escribiendo
  // varios mensajes seguidos (común en apps de mensajería tipo Telegram).
  // El agente NUNCA decide esto mirando el nombre del canal — es el
  // llamador quien sabe si puede recibir la respuesta después por su
  // cuenta (push, ej. Telegram) o necesita la respuesta en la misma
  // petición (ej. el widget de sitio web, que por eso nunca manda esto).
  bufferSeconds?: number;
}

const PENDING_TEXTS_KEY = "pendingTexts";
const PENDING_REF_KEY = "pendingRef";
const PENDING_VERTICAL_KEY = "pendingVerticalId";

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
    const { tenantId, channel, chatId, userText, verticalId, bufferSeconds } = (await request.json()) as ReplyRequest;
    const ref: ConversationRef = { tenantId, channel, chatId };
    const template = getVerticalTemplate(verticalId);

    // Etapa 6 (CORE): mientras la conversación esté en handoff, el bot deja
    // de auto-responder — solo registra el mensaje para que lo vea un humano.
    if (await isPaused(this.env.DB, ref)) {
      await appendMessage(this.env.DB, ref, { role: "user", content: userText });
      return Response.json({ replyText: null });
    }

    // Agencia ("palabras de handoff editables por tenant"): solo se lee
    // tenantSettings aquí si el vertical realmente tiene handoffHuman
    // habilitado — un vertical sin esa tool no gasta esta lectura extra.
    const customHandoffKeywords = template.toolsEnabled.includes("handoffHuman")
      ? (await getTenantSettings(this.env.DB, tenantId)).customHandoffKeywords
      : [];

    if (
      template.toolsEnabled.includes("handoffHuman") &&
      (detectsHandoffRequest(userText, customHandoffKeywords) || detectsUrgentSentiment(userText))
    ) {
      await appendMessage(this.env.DB, ref, { role: "user", content: userText });
      await createHandoff(this.env.DB, ref, userText);
      await appendMessage(this.env.DB, ref, { role: "assistant", content: HANDOFF_REPLY_MESSAGE });
      await logToolCall(this.env.DB, tenantId, "handoffHuman");
      // Etapa 10 (superpower "Vigilante"): avisa al dueño en tiempo real —
      // antes de esto, un handoff pasaba en silencio hasta que alguien
      // revisara /admin o /console.
      await notifyBusinessOwner(this.env.DB, ref, userText);
      return Response.json({ replyText: HANDOFF_REPLY_MESSAGE });
    }

    if (bufferSeconds && bufferSeconds > 0) {
      const pending = (await this.state.storage.get<string[]>(PENDING_TEXTS_KEY)) ?? [];
      pending.push(userText);
      await this.state.storage.put(PENDING_TEXTS_KEY, pending);
      await this.state.storage.put(PENDING_REF_KEY, ref);
      await this.state.storage.put(PENDING_VERTICAL_KEY, verticalId);
      await this.state.storage.setAlarm(Date.now() + bufferSeconds * 1000);
      return Response.json({ replyText: null });
    }

    const replyText = await this.runAgentTurn(ref, verticalId, userText);
    return Response.json({ replyText });
  }

  // Dispara cuando se cumple la ventana de espera de un mensaje encolado.
  // La respuesta ya no tiene a quién devolvérsela por HTTP (esa petición
  // terminó hace rato) — se empuja por el ChannelProvider real del canal.
  async alarm(): Promise<void> {
    const pending = await this.state.storage.get<string[]>(PENDING_TEXTS_KEY);
    const ref = await this.state.storage.get<ConversationRef>(PENDING_REF_KEY);
    const verticalId = await this.state.storage.get<string>(PENDING_VERTICAL_KEY);
    await this.state.storage.delete(PENDING_TEXTS_KEY);
    await this.state.storage.delete(PENDING_REF_KEY);
    await this.state.storage.delete(PENDING_VERTICAL_KEY);
    if (!pending || pending.length === 0 || !ref || !verticalId) return;

    // Pudo pausarse mientras esperábamos (ej. un mensaje posterior en el
    // mismo lote pidió un humano, o alguien respondió manual desde /console).
    if (await isPaused(this.env.DB, ref)) return;

    const combinedText = pending.join("\n");
    const replyText = await this.runAgentTurn(ref, verticalId, combinedText);
    if (!replyText) return;

    // best-effort: para cuando dispara el alarm ya se borró el estado
    // pendiente (a propósito, para no reintentar un LLM/tool-call real si
    // Cloudflare reintenta la alarm) — si el push falla, la respuesta ya
    // quedó guardada en `messages`, solo no le llegó al cliente por Telegram.
    try {
      const provider = getChannelProvider(ref.channel);
      const externalId = provider ? await getChannelExternalId(this.env.DB, ref.tenantId, ref.channel) : null;
      if (provider && externalId) {
        await provider.sendMessage(externalId, ref.chatId, replyText);
      }
    } catch {
      // best-effort — ver comentario arriba.
    }
  }

  // Núcleo del agente (RAG, calendario, LLM, tools) — el mismo para una
  // respuesta inmediata que para una encolada, `userText` ya viene
  // combinado si hubo buffer. Extraído a método propio para que fetch()
  // y alarm() lo compartan sin duplicar lógica.
  private async runAgentTurn(ref: ConversationRef, verticalId: string, userText: string): Promise<string> {
    const { tenantId, channel } = ref;
    const template = getVerticalTemplate(verticalId);

    const history = await getHistory(this.env.DB, ref);
    const historyMessages: LLMMessage[] = history.map((m) => ({ role: m.role, content: m.content }));

    // Etapa 7 (D6): la tool "searchKb" solo corre si el Vertical Template
    // del tenant la tiene habilitada — un vertical sin KB no gasta en
    // embeddings ni en Vectorize.
    let kbMatches: KbMatch[] | null = null;
    if (template.toolsEnabled.includes("searchKb")) {
      const { embedding: queryEmbedding, totalTokens: embeddingTokens } = await embedText(this.env.OPENAI_API_KEY, userText);
      await logUsage(this.env.DB, {
        tenantId,
        channel,
        model: "text-embedding-3-small",
        usage: { promptTokens: embeddingTokens, completionTokens: 0 },
      });
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

    // Agencia (Fase 2b: catálogo con fotos) — capacidad independiente del
    // calendario: tienda/cafetería no tienen agenda pero sí pueden tener
    // catálogo, e inmobiliaria/restaurante pueden tener ambas cosas a la
    // vez. channelProvider/externalId solo se resuelven si hace falta (un
    // tenant sin catálogo no paga esa lectura extra de D1).
    const wantsCatalog = template.toolsEnabled.includes("searchCatalog");
    const catalogChannelProvider = wantsCatalog ? getChannelProvider(channel) : null;
    const catalogExternalId = wantsCatalog ? await getChannelExternalId(this.env.DB, tenantId, channel) : null;

    const llm = new OpenAIProvider(this.env.OPENAI_API_KEY);
    const messages = buildMessages(systemPrompt, historyMessages, userText);
    const tools = [
      ...(calendarProvider ? [...buildCalendarTools(tenantSettings.staffMembers), RECORD_FEEDBACK_TOOL] : []),
      ...(wantsCatalog ? [SEARCH_CATALOG_TOOL] : []),
    ];

    let completion = await llm.complete(messages, tools.length > 0 ? tools : undefined);
    let usage = completion.usage;

    // Una sola vuelta de tool-calling: si el modelo pidió herramientas, las
    // ejecutamos contra el proveedor real (calendario y/o catálogo) y le
    // devolvemos los resultados para que dé la respuesta final en texto. No
    // se persisten los pasos intermedios en `messages`, solo el mensaje final.
    if (completion.toolCalls.length > 0 && (calendarProvider || wantsCatalog)) {
      const toolResultMessages: LLMMessage[] = [];
      for (const toolCall of completion.toolCalls) {
        // Log de auditoría — sin esto, depurar "por qué dijo tal horario"
        // significa adivinar (ya nos pasó). Visible con `wrangler tail`.
        console.log("tool call", tenantId, toolCall.name, toolCall.arguments);
        await logToolCall(this.env.DB, tenantId, toolCall.name);
        const result =
          toolCall.name === "recordAppointmentFeedback"
            ? await executeFeedbackTool(this.env.DB, ref, toolCall.arguments)
            : toolCall.name === "searchCatalog"
              ? await executeSearchCatalogTool(this.env.DB, tenantId, toolCall.arguments, catalogChannelProvider, catalogExternalId, ref.chatId)
              : calendarProvider
                ? await executeCalendarTool(
                    toolCall.name,
                    toolCall.arguments,
                    calendarProvider,
                    tenantSettings.timezone,
                    tenantSettings.businessHours,
                    tenantSettings.staffMembers,
                  )
                : JSON.stringify({ error: `Tool desconocida: ${toolCall.name}` });
        console.log("tool result", tenantId, toolCall.name, result);
        toolResultMessages.push({ role: "tool", content: result, toolCallId: toolCall.id });

        // Etapa 10 (superpower "Recupera no-shows"): guarda un rastro local
        // de la cita agendada — Google Calendar no nos da de vuelta el
        // chat_id/canal necesario para recontactar al cliente después.
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

    return completion.text;
  }
}
