import { getMostRecentFollowedUpAppointment, recordAppointmentFeedback, type AppointmentRef } from "./appointments";
import type { ToolDefinition } from "../llm/provider";
import { notifyBusinessOwner } from "../vigilante";

// Etapa 10 (unifica no-shows + encuesta de satisfacción + reseñas, D
// decidido con Oscar): el LLM llama a esta tool cuando el cliente responde
// al mensaje de seguimiento post-cita (buildAppointmentFollowUpMessage). El
// prompt (prompts.ts) le dice cuándo usarla y cómo reaccionar según el
// resultado (ofrecer reagendar, pedir reseña, o nada) — esta tool solo
// registra el dato real, nunca decide el texto de la respuesta.
export const RECORD_FEEDBACK_TOOL: ToolDefinition = {
  name: "recordAppointmentFeedback",
  description:
    "Registra si el cliente asistió a su cita más reciente y, si asistió, su calificación de satisfacción. " +
    "Úsala SOLO cuando el cliente esté respondiendo a una pregunta de seguimiento sobre una cita que ya pasó " +
    "(revisa el historial: un mensaje tuyo anterior preguntó si pudo venir y cómo calificaría su experiencia).",
  parameters: {
    type: "object",
    properties: {
      attended: { type: "boolean", description: "true si el cliente confirma que sí asistió a la cita, false si no pudo ir" },
      rating: { type: "number", description: "Calificación del 1 al 5 que dio el cliente — solo si asistió y la dio" },
      comment: { type: "string", description: "Comentario adicional del cliente sobre su experiencia, si lo hay" },
    },
    required: ["attended"],
  },
};

interface FeedbackToolArgs {
  attended?: boolean;
  rating?: number;
  comment?: string;
}

export async function executeFeedbackTool(db: D1Database, ref: AppointmentRef, rawArguments: string): Promise<string> {
  let args: FeedbackToolArgs;
  try {
    args = JSON.parse(rawArguments) as FeedbackToolArgs;
  } catch {
    return JSON.stringify({ error: "Argumentos inválidos" });
  }
  if (typeof args.attended !== "boolean") {
    return JSON.stringify({ error: "attended es requerido" });
  }

  const appointmentId = await getMostRecentFollowedUpAppointment(db, ref);
  if (!appointmentId) {
    return JSON.stringify({ error: "No se encontró una cita reciente con seguimiento pendiente para este chat" });
  }

  await recordAppointmentFeedback(db, appointmentId, { attended: args.attended, rating: args.rating, comment: args.comment });

  // Calificación baja (1-3, decidido con Oscar) -> avisa al dueño en vez de
  // pedir reseña — reutiliza Vigilante, mismo canal/chat_id de alertas.
  if (args.attended && typeof args.rating === "number" && args.rating <= 3) {
    await notifyBusinessOwner(db, ref, `Un cliente calificó su cita con ${args.rating}/5${args.comment ? `: "${args.comment}"` : ""}.`);
  }

  return JSON.stringify({ ok: true });
}
