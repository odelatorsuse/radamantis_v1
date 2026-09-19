-- Backlog de Agencia (padel, ronda de categorías). Oscar aclaró cómo opera
-- de verdad el club: 6 categorías fijas (6ta a 1ra, de menor a mayor nivel),
-- cada una con su PROPIO grupo de Telegram donde se inscriben los jugadores
-- de esa categoría, y normalmente un día fijo de la semana (ej. 6ta los
-- martes, 5ta los jueves) — pero esto debe poder configurarse, no quedar
-- fijo en código.
--
-- `chat_id` es el grupo de Telegram vinculado a esa categoría — cuando un
-- mensaje llega desde ese chat, el sistema ya sabe a qué categoría
-- pertenece sin tener que preguntarle al jugador "¿cuál convocatoria?".
-- Nullable: el club puede configurar el día antes de tener el grupo listo.
CREATE TABLE padel_categories (
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  category TEXT NOT NULL,
  weekday INTEGER,
  chat_id TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, category)
);

-- Cada convocatoria/reta pertenece a una categoría. Nullable para no romper
-- las convocatorias ya creadas antes de esta migración (quedan sin
-- categoría asignada, no se les inventa una).
ALTER TABLE padel_tournaments ADD COLUMN category TEXT;

-- Reglas configurables desde /console (Oscar: "tienen que poder
-- modificarse si es necesario") — SOLO parámetros que el código respeta al
-- pie de la letra, nunca texto libre que el modelo tenga que interpretar
-- (ese patrón ya causó bugs reales en este proyecto con fechas/horarios).
-- El emparejamiento de playoffs (top 8, 1°+8°/2°+7°/3°+6°/4°+5°) se deja
-- fijo — Oscar lo confirmó como la regla real, sin pedir que cambie.
CREATE TABLE padel_settings (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants (id),
  rounds INTEGER NOT NULL DEFAULT 5,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
