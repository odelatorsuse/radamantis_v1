-- Agencia ("auto-reanudar tras pausa por handoff", criterios confirmados con
-- Oscar 2026-08-30): opt-in, apagado por default — si el negocio sigue
-- atendiendo al cliente por su cuenta (teléfono, WhatsApp personal), el bot
-- no debe meterse solo a la conversación a menos que el dueño decida
-- explícitamente que quiere ese comportamiento. Mismo criterio que
-- lead_reengagement_enabled.
ALTER TABLE tenant_settings ADD COLUMN auto_resume_handoff_enabled INTEGER NOT NULL DEFAULT 0;
