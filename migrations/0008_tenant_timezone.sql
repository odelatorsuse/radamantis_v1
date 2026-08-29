-- Etapa 10 (Fase B): zona horaria por tenant — sin esto, la conversión de
-- horas para el calendario queda a la interpretación del LLM (poco confiable).
ALTER TABLE tenant_settings ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/Mexico_City';
