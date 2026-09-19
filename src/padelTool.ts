import {
  cancelRegistration,
  findTournamentAwaitingConfirmation,
  getOpenTournamentForCategory,
  getPlayerStatus,
  getTournamentByLabel,
  listOpenTournaments,
  listRegistrations,
  registerPair,
  registerPlayer,
  setConfirmedAttendance,
  type PadelTournament,
} from "./padel";
import { getCategoryByChatId } from "./padelCategories";
import type { ChannelProvider } from "./channels/provider";
import type { ToolDefinition } from "./llm/provider";
import { appendMessage, type ConversationRef } from "./messages";
import { utcToLocalDateTimeString } from "./calendar/timezone";

// Backlog de Agencia (padel, Fase 1: "Convocador Bot"). Los jugadores
// escriben en un GRUPO de Telegram compartido — el modelo ve los mensajes
// ya etiquetados con quién los escribió (ver index.ts) y decide cuándo
// llamar estas tools, igual que ya hace con bookAppointment (confirma el
// nombre antes de registrar, nunca asume). Un club puede tener varias
// convocatorias abiertas a la vez (categorías/fechas distintas) — por eso
// las tres tools aceptan un `tournamentLabel` opcional para desambiguar.

const TOURNAMENT_LABEL_PROPERTY = {
  type: "string",
  description:
    "Nombre/etiqueta de la convocatoria a la que se refiere (ej. 'Categoría B - Miércoles 7pm'). " +
    "Solo hace falta si hay más de una convocatoria abierta — si solo hay una, se usa esa automáticamente.",
};

export const CHECK_TOURNAMENT_STATUS_TOOL: ToolDefinition = {
  name: "checkTournamentStatus",
  description:
    "Consulta el estado real de una convocatoria de pádel: cupo, inscritos, tamaño de la lista de espera, " +
    "hora límite de inscripción, y si quien pregunta ya tiene un lugar (y en qué posición). " +
    "Úsala cuando alguien pregunte cuántos van, si hay lugar, o en qué lugar está.",
  parameters: {
    type: "object",
    properties: { tournamentLabel: TOURNAMENT_LABEL_PROPERTY },
    required: [],
  },
};

export const REGISTER_FOR_TOURNAMENT_TOOL: ToolDefinition = {
  name: "registerForTournament",
  description:
    "Inscribe a un jugador (o una pareja, si la convocatoria es de pareja fija) en una convocatoria de pádel " +
    "(o los pone en lista de espera si ya no hay cupo). Antes de llamarla, SIEMPRE confirma el/los nombre(s) " +
    "completo(s) con la persona que escribió — no asumas que es su nombre de Telegram ni inventes uno; si el " +
    "mensaje no deja claro de quién es el nombre, pregunta antes de registrar. Si la convocatoria es de PAREJA " +
    "FIJA (te lo dirá el error si intentas registrar sin partnerName), pregunta también el nombre completo del " +
    "compañero antes de volver a llamar la tool. No la llames dos veces para la misma persona/pareja en la misma " +
    "convocatoria.",
  parameters: {
    type: "object",
    properties: {
      playerName: { type: "string", description: "Nombre completo real del jugador a inscribir, confirmado por la persona que escribe" },
      partnerName: {
        type: "string",
        description: "Nombre completo real del compañero de pareja — solo hace falta si la convocatoria es de pareja fija (no rotativa)",
      },
      phone: { type: "string", description: "Teléfono de contacto del jugador (opcional)" },
      tournamentLabel: TOURNAMENT_LABEL_PROPERTY,
    },
    required: ["playerName"],
  },
};

export const CANCEL_TOURNAMENT_REGISTRATION_TOOL: ToolDefinition = {
  name: "cancelTournamentRegistration",
  description:
    "Cancela la inscripción de quien está escribiendo (no la de otra persona) a una convocatoria de pádel. " +
    "Si su lugar era un lugar confirmado (no lista de espera), el primero de la lista de espera se promueve " +
    "automáticamente — eso lo hace el sistema, no tienes que avisarle tú al promovido.",
  parameters: {
    type: "object",
    properties: { tournamentLabel: TOURNAMENT_LABEL_PROPERTY },
    required: [],
  },
};

// Backlog de Agencia (ronda de reestructura): "posterior a la hora límite
// de inscripción, buscar que confirmen que van a participar" — Oscar
// confirmó que el bot manda el mensaje pidiendo confirmar (ver
// src/padelDeadlineSweep.ts) y el jugador contesta en la misma
// conversación; esta tool guarda esa respuesta. A diferencia de las
// demás, NO usa tournamentLabel/resolveTournament (esas resuelven
// convocatorias ABIERTAS) — la confirmación pasa cuando la convocatoria
// ya CERRÓ inscripciones, así que se busca directo por la inscripción
// activa más reciente de quien escribe.
export const CONFIRM_ATTENDANCE_TOOL: ToolDefinition = {
  name: "confirmAttendance",
  description:
    "Usa esta tool cuando alguien responde confirmando o cancelando su asistencia después de que el bot le " +
    "preguntó '¿vas a poder venir?' tras cerrar las inscripciones. Interpreta la respuesta (sí/no, voy/no voy, " +
    "confirmo/cancelo, etc.) y pásala como willAttend true o false — nunca la ignores ni asumas sin llamarla.",
  parameters: {
    type: "object",
    properties: {
      willAttend: { type: "boolean", description: "true si confirma que va a ir, false si avisa que no puede ir" },
    },
    required: ["willAttend"],
  },
};

interface TournamentLabelArgs {
  tournamentLabel?: string;
}

// Backlog de Agencia (padel, ronda de categorías): resuelve a qué
// convocatoria se refiere el modelo, EN ESTE ORDEN:
// 1. Si el grupo de Telegram desde el que llegó el mensaje está vinculado
//    a una categoría (src/padelCategories.ts), se usa la convocatoria
//    abierta de ESA categoría directamente — sin ambigüedad, sin
//    preguntarle nada al jugador (así opera el club de verdad: cada
//    categoría tiene su propio grupo).
// 2. Si no (ej. canal "debug" al probar, o un grupo aún no vinculado a
//    ninguna categoría), cae al criterio anterior: tournamentLabel
//    explícito, o la única convocatoria abierta, o pedir que desambigüe
//    si hay varias.
async function resolveTournament(
  db: D1Database,
  tenantId: string,
  channel: string,
  chatId: string,
  args: TournamentLabelArgs,
): Promise<{ tournament: PadelTournament } | { error: string }> {
  const category = await getCategoryByChatId(db, tenantId, chatId);
  if (category) {
    const byCategory = await getOpenTournamentForCategory(db, tenantId, category);
    if (!byCategory) return { error: `No hay ninguna convocatoria de categoría ${category} abierta en este momento.` };
    return { tournament: byCategory };
  }

  if (args.tournamentLabel) {
    const byLabel = await getTournamentByLabel(db, tenantId, args.tournamentLabel);
    if (!byLabel) return { error: `No hay una convocatoria abierta llamada "${args.tournamentLabel}".` };
    return { tournament: byLabel };
  }
  const open = await listOpenTournaments(db, tenantId);
  if (open.length === 0) return { error: "No hay ninguna convocatoria abierta en este momento." };
  if (open.length === 1) return { tournament: open[0] };
  return { error: `Hay ${open.length} convocatorias abiertas — pregunta a cuál se refiere: ${open.map((t) => t.label).join(", ")}.` };
}

export async function executeCheckTournamentStatusTool(
  db: D1Database,
  ref: ConversationRef,
  playerId: string,
  timezone: string,
  rawArguments: string,
): Promise<string> {
  let args: TournamentLabelArgs;
  try {
    args = JSON.parse(rawArguments) as TournamentLabelArgs;
  } catch {
    return JSON.stringify({ error: "Argumentos inválidos" });
  }

  const resolved = await resolveTournament(db, ref.tenantId, ref.channel, ref.chatId, args);
  if ("error" in resolved) return JSON.stringify({ error: resolved.error });
  const { tournament } = resolved;

  const registrations = await listRegistrations(db, tournament.id);
  // En modo 'pareja' el cupo se cuenta en PAREJAS (ver registerPair) — hay
  // que contar pair_id distintos, no filas individuales, para no reportar
  // el doble de lugares ocupados de los reales.
  const isPareja = tournament.registrationMode === "pareja";
  const inscritos = isPareja
    ? new Set(registrations.filter((r) => r.status === "inscrito" && r.pairId).map((r) => r.pairId)).size
    : registrations.filter((r) => r.status === "inscrito").length;
  const listaEspera = isPareja
    ? new Set(registrations.filter((r) => r.status === "lista_espera" && r.pairId).map((r) => r.pairId)).size
    : registrations.filter((r) => r.status === "lista_espera").length;
  const personal = await getPlayerStatus(db, tournament.id, ref.channel, playerId);

  return JSON.stringify({
    label: tournament.label,
    modalidad: tournament.registrationMode === "pareja" ? "pareja fija" : "reta americana (pareja rotativa)",
    capacity: tournament.capacity,
    unidadDeCupo: isPareja ? "parejas" : "jugadores",
    inscritos,
    lugaresDisponibles: Math.max(0, tournament.capacity - inscritos),
    listaEspera,
    horaLimiteInscripcion: utcToLocalDateTimeString(tournament.registrationDeadlineUtc, timezone),
    fechaJornada: utcToLocalDateTimeString(tournament.scheduledAtUtc, timezone),
    tuEstado: personal ? { status: personal.status, posicion: personal.position } : null,
  });
}

interface RegisterArgs extends TournamentLabelArgs {
  playerName?: string;
  partnerName?: string;
  phone?: string;
}

export async function executeRegisterForTournamentTool(
  db: D1Database,
  ref: ConversationRef,
  playerId: string,
  rawArguments: string,
): Promise<string> {
  let args: RegisterArgs;
  try {
    args = JSON.parse(rawArguments) as RegisterArgs;
  } catch {
    return JSON.stringify({ error: "Argumentos inválidos" });
  }
  if (!args.playerName?.trim()) {
    return JSON.stringify({ error: "Falta playerName" });
  }

  const resolved = await resolveTournament(db, ref.tenantId, ref.channel, ref.chatId, args);
  if ("error" in resolved) return JSON.stringify({ error: resolved.error });
  const { tournament } = resolved;

  if (tournament.registrationMode === "pareja") {
    if (!args.partnerName?.trim()) {
      return JSON.stringify({
        error: `Esta convocatoria ("${tournament.label}") es de PAREJA FIJA — pregúntale a la persona el nombre completo de su compañero(a) y vuelve a llamar la tool con partnerName.`,
      });
    }
    const result = await registerPair(db, tournament, ref.tenantId, {
      player1Name: args.playerName.trim(),
      player2Name: args.partnerName.trim(),
      phone: args.phone?.trim() || null,
      channel: ref.channel,
      chatId: ref.chatId,
      playerId,
    });
    return JSON.stringify({ ok: true, label: tournament.label, pareja: true, ...result });
  }

  const result = await registerPlayer(db, tournament, ref.tenantId, {
    playerName: args.playerName.trim(),
    phone: args.phone?.trim() || null,
    channel: ref.channel,
    chatId: ref.chatId,
    playerId,
  });

  return JSON.stringify({ ok: true, label: tournament.label, ...result });
}

export async function executeCancelTournamentRegistrationTool(
  db: D1Database,
  ref: ConversationRef,
  playerId: string,
  channelProvider: ChannelProvider | null,
  channelExternalId: string | null,
  rawArguments: string,
): Promise<string> {
  let args: TournamentLabelArgs;
  try {
    args = JSON.parse(rawArguments) as TournamentLabelArgs;
  } catch {
    return JSON.stringify({ error: "Argumentos inválidos" });
  }

  const resolved = await resolveTournament(db, ref.tenantId, ref.channel, ref.chatId, args);
  if ("error" in resolved) return JSON.stringify({ error: resolved.error });
  const { tournament } = resolved;

  const result = await cancelRegistration(db, ref.tenantId, tournament.id, ref.channel, playerId);
  if (!result) return JSON.stringify({ error: "No encontramos una inscripción tuya activa en esa convocatoria." });

  if (result.promoted && channelProvider && channelExternalId) {
    await notifyPromotedPlayer(db, ref.tenantId, channelProvider, channelExternalId, result.promoted, tournament.label);
  }

  return JSON.stringify({ ok: true, label: tournament.label });
}

// Intenta avisarle en privado al jugador promovido de lista de espera (menos
// ruido en el grupo); si Telegram rechaza el DM (ej. "chat not found" —
// nunca inició una conversación privada con el bot), cae de vuelta a
// avisar en el grupo, mencionándolo por nombre ya que no siempre hay un
// @username confiable para etiquetarlo. Best-effort en ambos casos: si los
// dos fallan, el jugador simplemente no se entera a tiempo, pero su
// inscripción ya quedó registrada correctamente. Se guarda en `messages` el
// chat_id real donde de verdad aterrizó el aviso, para que /console lo
// muestre en la conversación correcta. Exportada porque la ruta de
// cancelación manual del club (src/client/routes.ts) necesita el mismo
// comportamiento — un jugador promovido se entera igual sin importar si lo
// canceló él mismo o el club desde /console.
interface ConfirmAttendanceArgs {
  willAttend?: boolean;
}

export async function executeConfirmAttendanceTool(
  db: D1Database,
  ref: ConversationRef,
  playerId: string,
  rawArguments: string,
): Promise<string> {
  let args: ConfirmAttendanceArgs;
  try {
    args = JSON.parse(rawArguments) as ConfirmAttendanceArgs;
  } catch {
    return JSON.stringify({ error: "Argumentos inválidos" });
  }
  if (typeof args.willAttend !== "boolean") {
    return JSON.stringify({ error: "Falta willAttend (true o false)" });
  }

  const pending = await findTournamentAwaitingConfirmation(db, ref.tenantId, ref.channel, playerId);
  if (!pending) {
    return JSON.stringify({ error: "No encontramos ninguna convocatoria tuya esperando confirmación en este momento." });
  }

  const result = await setConfirmedAttendance(db, ref.tenantId, pending.tournamentId, ref.channel, playerId, args.willAttend);
  if (!result) {
    return JSON.stringify({ error: "No encontramos tu inscripción activa en esa convocatoria." });
  }

  return JSON.stringify({ ok: true, label: pending.label, confirmed: args.willAttend });
}

export async function notifyPromotedPlayer(
  db: D1Database,
  tenantId: string,
  provider: ChannelProvider,
  externalId: string,
  promoted: { chatId: string; playerId: string; playerName: string },
  tournamentLabel?: string,
): Promise<void> {
  const text = tournamentLabel
    ? `¡${promoted.playerName}, se liberó un lugar y ya quedaste inscrito(a) en "${tournamentLabel}"!`
    : `¡${promoted.playerName}, se liberó un lugar y ya quedaste inscrito(a)!`;
  try {
    await provider.sendMessage(externalId, promoted.playerId, text);
    await appendMessage(db, { tenantId, channel: provider.channel, chatId: promoted.playerId }, { role: "assistant", content: text });
  } catch {
    try {
      await provider.sendMessage(externalId, promoted.chatId, text);
      await appendMessage(db, { tenantId, channel: provider.channel, chatId: promoted.chatId }, { role: "assistant", content: text });
    } catch {
      // best-effort — ver comentario de la función.
    }
  }
}
