-- Backlog de Agencia (padel, Fase 1: "Convocador Bot"). Un club de pádel
-- organiza "Retas Americanas" (torneos sociales de rotación) — los
-- jugadores se inscriben escribiendo en un GRUPO de Telegram compartido
-- (no cada uno por privado con el bot), y un club puede tener varias
-- convocatorias abiertas a la vez (distintas categorías/fechas), cada una
-- con su propio cupo y lista de espera — confirmado con Oscar. `label`
-- distingue unas de otras (ej. "Categoría B - Miércoles 7pm") tanto para
-- el club en /console como para que el bot sepa a cuál se refiere un
-- jugador cuando hay más de una abierta.
CREATE TABLE padel_tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  label TEXT NOT NULL,
  scheduled_at_utc TEXT NOT NULL,
  registration_deadline_utc TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 20,
  status TEXT NOT NULL DEFAULT 'abierta',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Un renglón por jugador inscrito o en lista de espera. `status` es TEXT
-- libre a propósito: se amplía en fases futuras (pagado/presente/campeón,
-- Fase 2 en adelante) sin necesitar otra migración — mismo patrón que
-- `appointments.attended` se agregó después vía su propia migración
-- cuando hizo falta.
--
-- `chat_id` es la conversación donde se registró (el grupo compartido, casi
-- siempre) — se usa para responder ahí y como destino de respaldo si un
-- aviso privado falla. `player_id` es el jugador individual real (su
-- Telegram user id dentro del grupo; en una conversación 1:1 es el mismo
-- valor que chat_id) — es la llave real de identidad/idempotencia, porque
-- dentro de un grupo TODOS comparten el mismo chat_id.
--
-- Re-registrarse tras cancelar SIEMPRE inserta una fila nueva, nunca
-- revive la cancelada: si se reciclara con un UPDATE, el jugador
-- conservaría su `registered_at` original y se colaría al frente de la
-- lista de espera por encima de gente que se inscribió mientras él estaba
-- cancelado — injusto. Una fila nueva le da su lugar real en la cola.
CREATE TABLE padel_registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES padel_tournaments (id),
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  player_name TEXT NOT NULL,
  phone TEXT,
  channel TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'inscrito',
  registered_at TEXT NOT NULL DEFAULT (datetime('now'))
);
