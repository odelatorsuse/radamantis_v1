-- Etapa 10 (Fase B, refinamiento): horario de atención por día de la semana
-- en vez de un rango fijo para todos los días — Oscar señaló que esto va a
-- variar por tenant/bot y debe quedar bien modelado desde ahora.
ALTER TABLE tenant_settings ADD COLUMN business_hours TEXT NOT NULL DEFAULT
  '{"mon":{"start":"09:00","end":"18:00"},"tue":{"start":"09:00","end":"18:00"},"wed":{"start":"09:00","end":"18:00"},"thu":{"start":"09:00","end":"18:00"},"fri":{"start":"09:00","end":"18:00"},"sat":{"start":"09:00","end":"18:00"},"sun":null}';

ALTER TABLE tenant_settings DROP COLUMN business_hours_start;
ALTER TABLE tenant_settings DROP COLUMN business_hours_end;
