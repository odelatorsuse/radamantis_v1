-- Backlog de Agencia: Oscar pidió un tablero tipo Kanban DENTRO de /admin
-- para anotar modificaciones pendientes a Radamantis (no es un dato de
-- ningún tenant — es la lista de trabajo del propio proyecto), para que
-- una sesión de Claude Code las recoja automáticamente todos los días a
-- las 11am y empiece a implementarlas sin que él tenga que volver a
-- pedirlas. Sin tenant_id a propósito: esto es meta, sobre Radamantis
-- mismo, no sobre un cliente.
--
-- `status` es TEXT libre (mismo criterio que el resto del proyecto —
-- padel_tournaments.status, appointments.attended, etc.): 'pendiente',
-- 'en_progreso', 'hecho' hoy, ampliable después sin migración nueva.
-- `result_notes` es lo que la sesión autónoma deja al terminar (o al
-- toparse con algo que necesita que Oscar decida) — así él puede leer qué
-- pasó sin tener que revisar el código o el chat.
CREATE TABLE backlog_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pendiente',
  created_by TEXT,
  result_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
