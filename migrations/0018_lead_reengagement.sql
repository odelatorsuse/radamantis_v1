-- Etapa 10 (superpower "Reenganche de leads fríos", criterios confirmados
-- con Oscar 2026-08-29): a diferencia de no-shows/reporte diario (activados
-- por default), esto es opt-in — el dueño lo activa desde /console porque
-- alcanza a MÁS conversaciones (cualquier pregunta que no se convirtió en
-- cita, no solo citas ya agendadas) y el riesgo de sentirse invasivo es mayor.
ALTER TABLE tenant_settings ADD COLUMN lead_reengagement_enabled INTEGER NOT NULL DEFAULT 0;

-- Hasta 2 reintentos por conversación fría (confirmado con Oscar) — sin esto
-- el barrido reintentaría cada 30 min indefinidamente.
CREATE TABLE lead_reengagement (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  UNIQUE (tenant_id, channel, chat_id)
);
