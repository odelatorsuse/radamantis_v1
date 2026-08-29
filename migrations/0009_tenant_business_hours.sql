-- Etapa 10 (Fase B, refinamiento): horario de atención por tenant. Se usa
-- para filtrar la disponibilidad real y validar antes de agendar, en vez de
-- dejar que el modelo decida por su cuenta qué rango consultar (bug real:
-- interpretó "la tarde" como "desde las 13:30", ignorando 9:00-13:30).
ALTER TABLE tenant_settings ADD COLUMN business_hours_start TEXT NOT NULL DEFAULT '09:00';
ALTER TABLE tenant_settings ADD COLUMN business_hours_end TEXT NOT NULL DEFAULT '18:00';
