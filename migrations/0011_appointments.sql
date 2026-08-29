-- Etapa 10 (superpower "Recupera no-shows"): registro local de cada cita
-- agendada con éxito (bookAppointment ya la escribió en Google Calendar;
-- esta tabla es solo el rastro que necesitamos para el barrido de no-shows
-- — quién es, en qué chat/canal contactarlo, y si ya se le dio seguimiento).
CREATE TABLE appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  channel TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  start_utc TEXT NOT NULL,
  end_utc TEXT NOT NULL,
  summary TEXT NOT NULL,
  attendee_name TEXT NOT NULL,
  attendee_contact TEXT NOT NULL,
  event_id TEXT,
  no_show_followup_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
