import { getTenantSettings, upsertTenantSettings } from "../tenants";

// Etapa 10 (consola del cliente): toda query aquí recibe tenantId desde el
// token de sesión ya verificado (nunca desde un parámetro de URL que el
// cliente pudiera manipular) — es la garantía de aislamiento entre tenants
// para esta superficie nueva, análoga a D3 pero para el lado del cliente.

export interface TenantUser {
  id: number;
  tenantId: string;
  email: string;
  passwordHash: string;
}

export async function getTenantUserByEmail(db: D1Database, email: string): Promise<TenantUser | null> {
  const row = await db
    .prepare("SELECT id, tenant_id, email, password_hash FROM tenant_users WHERE email = ?")
    .bind(email)
    .first<{ id: number; tenant_id: string; email: string; password_hash: string }>();
  if (!row) return null;
  return { id: row.id, tenantId: row.tenant_id, email: row.email, passwordHash: row.password_hash };
}

export async function createTenantUser(db: D1Database, tenantId: string, email: string, passwordHash: string): Promise<void> {
  await db
    .prepare("INSERT INTO tenant_users (tenant_id, email, password_hash) VALUES (?, ?, ?)")
    .bind(tenantId, email, passwordHash)
    .run();
}

export async function setTenantUserPassword(db: D1Database, userId: number, passwordHash: string): Promise<void> {
  await db.prepare("UPDATE tenant_users SET password_hash = ? WHERE id = ?").bind(passwordHash, userId).run();
}

export interface TodayStats {
  messagesIn: number;
  messagesOut: number;
  uniqueClients: number;
}

export async function getTodayStats(db: D1Database, tenantId: string): Promise<TodayStats> {
  const row = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) AS messages_in,
         SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END) AS messages_out,
         COUNT(DISTINCT chat_id) AS unique_clients
       FROM messages
       WHERE tenant_id = ? AND date(created_at) = date('now')`,
    )
    .bind(tenantId)
    .first<{ messages_in: number | null; messages_out: number | null; unique_clients: number }>();
  return {
    messagesIn: row?.messages_in ?? 0,
    messagesOut: row?.messages_out ?? 0,
    uniqueClients: row?.unique_clients ?? 0,
  };
}

export interface DayActivity {
  date: string; // YYYY-MM-DD
  messagesIn: number;
  messagesOut: number;
}

// Devuelve siempre 7 puntos (hoy y los 6 días previos), rellenando con ceros
// los días sin actividad — para que la gráfica del cliente no tenga huecos.
export async function getWeeklyActivity(db: D1Database, tenantId: string): Promise<DayActivity[]> {
  const { results } = await db
    .prepare(
      `SELECT date(created_at) AS day,
         SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) AS messages_in,
         SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END) AS messages_out
       FROM messages
       WHERE tenant_id = ? AND date(created_at) >= date('now', '-6 days')
       GROUP BY day`,
    )
    .bind(tenantId)
    .all<{ day: string; messages_in: number; messages_out: number }>();

  const byDay = new Map(results.map((r) => [r.day, r]));
  const days: DayActivity[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const row = byDay.get(d);
    days.push({ date: d, messagesIn: row?.messages_in ?? 0, messagesOut: row?.messages_out ?? 0 });
  }
  return days;
}

export interface UniqueClient {
  channel: string;
  chatId: string;
  lastSeen: string;
  messageCount: number;
  attendeeName: string | null;
  attendeeContact: string | null;
}

// Sin una cita agendada de por medio, no tenemos ninguna identidad real del
// cliente — solo su hilo de conversación (channel+chatId). Cuando sí booking
// alguna vez, se le asocia el nombre/contacto de su última cita conocida.
export async function getUniqueClients(db: D1Database, tenantId: string): Promise<UniqueClient[]> {
  const { results } = await db
    .prepare(
      `SELECT m.channel, m.chat_id, MAX(m.created_at) AS last_seen, COUNT(*) AS message_count,
         (SELECT a.attendee_name FROM appointments a WHERE a.tenant_id = m.tenant_id AND a.channel = m.channel AND a.chat_id = m.chat_id ORDER BY a.created_at DESC LIMIT 1) AS attendee_name,
         (SELECT a.attendee_contact FROM appointments a WHERE a.tenant_id = m.tenant_id AND a.channel = m.channel AND a.chat_id = m.chat_id ORDER BY a.created_at DESC LIMIT 1) AS attendee_contact
       FROM messages m
       WHERE m.tenant_id = ?
       GROUP BY m.channel, m.chat_id
       ORDER BY last_seen DESC
       LIMIT 200`,
    )
    .bind(tenantId)
    .all<{ channel: string; chat_id: string; last_seen: string; message_count: number; attendee_name: string | null; attendee_contact: string | null }>();

  return results.map((r) => ({
    channel: r.channel,
    chatId: r.chat_id,
    lastSeen: r.last_seen,
    messageCount: r.message_count,
    attendeeName: r.attendee_name,
    attendeeContact: r.attendee_contact,
  }));
}

export interface AppointmentSummary {
  id: number;
  startUtc: string;
  endUtc: string;
  summary: string;
  attendeeName: string;
  attendeeContact: string;
  attended: number | null;
  staffMember: string | null;
}

type AppointmentRow = {
  id: number;
  start_utc: string;
  end_utc: string;
  summary: string;
  attendee_name: string;
  attendee_contact: string;
  attended: number | null;
  staff_member: string | null;
};

function mapAppointmentRow(r: AppointmentRow): AppointmentSummary {
  return {
    id: r.id,
    startUtc: r.start_utc,
    endUtc: r.end_utc,
    summary: r.summary,
    attendeeName: r.attendee_name,
    attendeeContact: r.attendee_contact,
    attended: r.attended,
    staffMember: r.staff_member,
  };
}

async function queryAppointments(db: D1Database, tenantId: string, when: "upcoming" | "past"): Promise<AppointmentSummary[]> {
  const comparison = when === "upcoming" ? ">=" : "<";
  const order = when === "upcoming" ? "ASC" : "DESC";
  const { results } = await db
    .prepare(
      `SELECT id, start_utc, end_utc, summary, attendee_name, attendee_contact, attended, staff_member
       FROM appointments
       WHERE tenant_id = ? AND end_utc ${comparison} datetime('now')
       ORDER BY start_utc ${order}
       LIMIT 50`,
    )
    .bind(tenantId)
    .all<AppointmentRow>();
  return results.map(mapAppointmentRow);
}

export const getUpcomingAppointments = (db: D1Database, tenantId: string) => queryAppointments(db, tenantId, "upcoming");
export const getPastAppointments = (db: D1Database, tenantId: string) => queryAppointments(db, tenantId, "past");

// Vista de "todo el mes en curso" pedida por Oscar — a diferencia de
// próximas/recientes (una ventana relativa a "ahora", tope 50), esto
// devuelve TODAS las citas cuyo inicio cae en el mes calendario actual,
// pasadas o futuras, ordenadas cronológicamente. Mes calendario en UTC
// (misma simplificación ya aceptada en getTodayStats/getWeeklyActivity)
// — strftime('%Y-%m', ...) sobre datetime('now') es una comparación
// SQLite-vs-SQLite, nunca ISO-string-vs-JS-Date, así que no cae en el
// bug de formato ya documentado para estas columnas.
export async function getAppointmentsForCurrentMonth(db: D1Database, tenantId: string): Promise<AppointmentSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT id, start_utc, end_utc, summary, attendee_name, attendee_contact, attended, staff_member
       FROM appointments
       WHERE tenant_id = ? AND strftime('%Y-%m', start_utc) = strftime('%Y-%m', 'now')
       ORDER BY start_utc ASC
       LIMIT 200`,
    )
    .bind(tenantId)
    .all<AppointmentRow>();
  return results.map(mapAppointmentRow);
}

export interface HealthStatus {
  channels: string[];
  calendarConnected: boolean;
  lastActivityAt: string | null;
}

// "Estado de conexión simple" (decisión de Oscar): datos ya en D1, sin
// llamadas de red en vivo a Telegram/Google en cada carga de la consola.
export async function getHealthStatus(db: D1Database, tenantId: string): Promise<HealthStatus> {
  const [channelsResult, calendarRow, usageRow] = await Promise.all([
    db.prepare("SELECT DISTINCT channel FROM channel_bindings WHERE tenant_id = ?").bind(tenantId).all<{ channel: string }>(),
    db.prepare("SELECT tenant_id FROM calendar_connections WHERE tenant_id = ?").bind(tenantId).first(),
    db.prepare("SELECT MAX(created_at) AS last FROM usage_log WHERE tenant_id = ?").bind(tenantId).first<{ last: string | null }>(),
  ]);
  return {
    channels: channelsResult.results.map((r) => r.channel),
    calendarConnected: calendarRow !== null,
    lastActivityAt: usageRow?.last ?? null,
  };
}

export interface ConversationSummary {
  channel: string;
  chatId: string;
  lastMessageAt: string;
  lastMessage: string;
  messageCount: number;
  paused: boolean;
}

export async function listConversations(db: D1Database, tenantId: string): Promise<ConversationSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT m.channel, m.chat_id, MAX(m.created_at) AS last_message_at, COUNT(*) AS message_count,
         (SELECT content FROM messages m2 WHERE m2.tenant_id = m.tenant_id AND m2.channel = m.channel AND m2.chat_id = m.chat_id ORDER BY m2.id DESC LIMIT 1) AS last_message,
         (SELECT id FROM handoffs h WHERE h.tenant_id = m.tenant_id AND h.channel = m.channel AND h.chat_id = m.chat_id AND h.resolved_at IS NULL LIMIT 1) AS open_handoff_id
       FROM messages m
       WHERE m.tenant_id = ?
       GROUP BY m.channel, m.chat_id
       ORDER BY last_message_at DESC
       LIMIT 200`,
    )
    .bind(tenantId)
    .all<{ channel: string; chat_id: string; last_message_at: string; message_count: number; last_message: string; open_handoff_id: number | null }>();

  return results.map((r) => ({
    channel: r.channel,
    chatId: r.chat_id,
    lastMessageAt: r.last_message_at,
    lastMessage: r.last_message,
    messageCount: r.message_count,
    paused: r.open_handoff_id !== null,
  }));
}

// Etapa 10 (superpower "Vigilante"): el dueño del negocio manda este código
// a su propio bot por Telegram una vez, y el webhook (src/index.ts) lo
// detecta y guarda su chat_id como destino de alertas — evita que tenga que
// buscar/copiar su chat_id a mano (Telegram no lo expone en ningún lado).
function generateActivationCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export interface AlertSettings {
  activationCode: string;
  configured: boolean;
}

// Genera el código la primera vez que se pide (lazy) y lo deja fijo después
// — reenviar el mismo código sirve para (re)activar alertas en otro chat.
export async function getOrCreateAlertSettings(db: D1Database, tenantId: string): Promise<AlertSettings> {
  const current = await getTenantSettings(db, tenantId);
  if (current.alertActivationCode) {
    return { activationCode: current.alertActivationCode, configured: current.alertChatId !== null };
  }
  const code = generateActivationCode();
  await upsertTenantSettings(db, tenantId, { ...current, alertActivationCode: code });
  return { activationCode: code, configured: false };
}

export async function setAlertChatId(db: D1Database, tenantId: string, chatId: string): Promise<void> {
  const current = await getTenantSettings(db, tenantId);
  await upsertTenantSettings(db, tenantId, { ...current, alertChatId: chatId });
}

export async function clearAlertChatId(db: D1Database, tenantId: string): Promise<void> {
  const current = await getTenantSettings(db, tenantId);
  await upsertTenantSettings(db, tenantId, { ...current, alertChatId: null });
}

// Etapa 10 (unifica no-shows + encuesta + reseñas): el dueño pega el link
// de reseñas (ej. Google Business) — sin esto, el bot no pide reseña.
export async function setReviewLink(db: D1Database, tenantId: string, reviewLink: string | null): Promise<void> {
  const current = await getTenantSettings(db, tenantId);
  await upsertTenantSettings(db, tenantId, { ...current, reviewLink });
}

// Etapa 10 (superpower "Reenganche de leads fríos"): opt-in, a diferencia
// de no-shows/reporte diario que son default-on.
export async function setLeadReengagementEnabled(db: D1Database, tenantId: string, enabled: boolean): Promise<void> {
  const current = await getTenantSettings(db, tenantId);
  await upsertTenantSettings(db, tenantId, { ...current, leadReengagementEnabled: enabled });
}

// Agencia ("auto-reanudar tras pausa por handoff"): opt-in, mismo criterio
// que arriba.
export async function setAutoResumeHandoffEnabled(db: D1Database, tenantId: string, enabled: boolean): Promise<void> {
  const current = await getTenantSettings(db, tenantId);
  await upsertTenantSettings(db, tenantId, { ...current, autoResumeHandoffEnabled: enabled });
}

// Agencia ("palabras de handoff editables por tenant"): se SUMAN a la
// lista base (src/handoff.ts), nunca la reemplazan.
export async function setCustomHandoffKeywords(db: D1Database, tenantId: string, keywords: string[]): Promise<void> {
  const current = await getTenantSettings(db, tenantId);
  await upsertTenantSettings(db, tenantId, { ...current, customHandoffKeywords: keywords });
}

// Agencia (White-label, por tenant en /console): el dueño del negocio pone
// su propio nombre/logo/color — los tres opcionales, null vuelve a la
// identidad visual de Radamantis por default.
export interface BrandingPatch {
  brandName: string | null;
  brandLogoUrl: string | null;
  brandColor: string | null;
}

export async function setBranding(db: D1Database, tenantId: string, branding: BrandingPatch): Promise<void> {
  const current = await getTenantSettings(db, tenantId);
  await upsertTenantSettings(db, tenantId, { ...current, ...branding });
}

// Agencia (Fase 2, agendar con persona específica): quién trabaja ahí lo
// mantiene el propio negocio, no Oscar — cambia con el tiempo (alguien
// entra, alguien se va). Vacío = las tools de agenda vuelven a funcionar
// sin distinguir por persona, sin ningún otro cambio.
export async function setStaffMembers(db: D1Database, tenantId: string, staffMembers: string[]): Promise<void> {
  const current = await getTenantSettings(db, tenantId);
  await upsertTenantSettings(db, tenantId, { ...current, staffMembers });
}
