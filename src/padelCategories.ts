// Backlog de Agencia (padel, ronda de categorías). 6 categorías fijas
// reales de pádel (6ta = menor nivel, 1ra = mayor nivel) — no es texto
// libre, es un enum real porque el resto del sistema (resolución de chat,
// playoffs) depende de que sean exactamente estos 6 valores.
export const PADEL_CATEGORIES = ["6ta", "5ta", "4ta", "3ra", "2da", "1ra"] as const;
export type PadelCategory = (typeof PADEL_CATEGORIES)[number];

export function isPadelCategory(value: string): value is PadelCategory {
  return (PADEL_CATEGORIES as readonly string[]).includes(value);
}

export interface PadelCategoryConfig {
  category: PadelCategory;
  weekday: number | null; // 0=domingo..6=sábado, mismo criterio que Date#getDay()
  chatId: string | null; // grupo de Telegram vinculado a esta categoría
}

interface CategoryRow {
  category: string;
  weekday: number | null;
  chat_id: string | null;
}

// Siempre devuelve las 6 categorías, aunque el club solo haya configurado
// algunas — las que faltan vienen con weekday/chatId en null (nunca se
// inventa un valor), para que /console pueda mostrar el formulario
// completo de una vez.
export async function listCategoryConfigs(db: D1Database, tenantId: string): Promise<PadelCategoryConfig[]> {
  const { results } = await db.prepare("SELECT category, weekday, chat_id FROM padel_categories WHERE tenant_id = ?").bind(tenantId).all<CategoryRow>();
  const byCategory = new Map(results.map((r) => [r.category, r]));
  return PADEL_CATEGORIES.map((category) => {
    const row = byCategory.get(category);
    return { category, weekday: row?.weekday ?? null, chatId: row?.chat_id ?? null };
  });
}

export async function upsertCategoryConfig(
  db: D1Database,
  tenantId: string,
  category: PadelCategory,
  input: { weekday: number | null; chatId: string | null },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO padel_categories (tenant_id, category, weekday, chat_id, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT (tenant_id, category) DO UPDATE SET weekday = excluded.weekday, chat_id = excluded.chat_id, updated_at = excluded.updated_at`,
    )
    .bind(tenantId, category, input.weekday, input.chatId)
    .run();
}

// Núcleo de la resolución sin ambigüedad: dado el chat de Telegram del que
// llegó un mensaje, ¿a qué categoría pertenece? Si no hay ninguna
// configurada con ese chat_id (ej. probando por el canal "debug", o un
// grupo que todavía no se vinculó), regresa null — el llamador cae de
// vuelta al criterio anterior (una sola convocatoria abierta, o preguntar).
export async function getCategoryByChatId(db: D1Database, tenantId: string, chatId: string): Promise<PadelCategory | null> {
  const row = await db.prepare("SELECT category FROM padel_categories WHERE tenant_id = ? AND chat_id = ?").bind(tenantId, chatId).first<{ category: string }>();
  return row && isPadelCategory(row.category) ? row.category : null;
}

export type PadelRegistrationMode = "individual" | "pareja";

export interface PadelSettings {
  rounds: number;
  // Backlog de Agencia (ronda de canchas + parejas): número REAL de
  // canchas del club — el fixture nunca programa más partidos simultáneos
  // que esto, sin importar cuántos jugadores confirmen (antes se inferían
  // implícitamente del número de jugadores, lo que podía "perder" rondas
  // completas para grupos chicos — ver src/padelMatches.ts).
  courtCount: number;
  // Solo precarga el formulario de "Nueva convocatoria" en /console — la
  // modalidad real de cada convocatoria se elige (y puede cambiar) cada
  // vez que el club abre una nueva, nunca queda fija por el tenant.
  defaultRegistrationMode: PadelRegistrationMode;
}

const DEFAULT_PADEL_SETTINGS: PadelSettings = { rounds: 5, courtCount: 5, defaultRegistrationMode: "individual" };

interface SettingsRow {
  rounds: number;
  court_count: number;
  default_registration_mode: string;
}

// Backlog de Agencia: "las reglas deben poder modificarse si es
// necesario" — Oscar confirmó que se refiere a un panel real de
// configuración, no a texto libre en la KB que el modelo tendría que
// interpretar (eso ya causó bugs reales con fechas/horarios en este
// proyecto). El emparejamiento de playoffs (top 8, 1°+8°/2°+7°/3°+6°/4°+5°)
// queda fijo, confirmado por Oscar como la regla real sin pedir cambiarlo.
export async function getPadelSettings(db: D1Database, tenantId: string): Promise<PadelSettings> {
  const row = await db
    .prepare("SELECT rounds, court_count, default_registration_mode FROM padel_settings WHERE tenant_id = ?")
    .bind(tenantId)
    .first<SettingsRow>();
  if (!row) return DEFAULT_PADEL_SETTINGS;
  return {
    rounds: row.rounds,
    courtCount: row.court_count,
    defaultRegistrationMode: row.default_registration_mode === "pareja" ? "pareja" : "individual",
  };
}

export async function upsertPadelSettings(
  db: D1Database,
  tenantId: string,
  input: { rounds: number; courtCount: number; defaultRegistrationMode: PadelRegistrationMode },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO padel_settings (tenant_id, rounds, court_count, default_registration_mode, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT (tenant_id) DO UPDATE SET rounds = excluded.rounds, court_count = excluded.court_count, default_registration_mode = excluded.default_registration_mode, updated_at = excluded.updated_at`,
    )
    .bind(tenantId, input.rounds, input.courtCount, input.defaultRegistrationMode)
    .run();
}
