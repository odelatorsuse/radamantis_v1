-- Etapa 10 (superpower "Reporte diario"): evita mandar el reporte dos veces
-- el mismo día — el barrido corre cada 30 min (mismo cron que no-shows) y
-- el disparo se basa en la hora local del tenant, no en un cron por tenant.
ALTER TABLE tenant_settings ADD COLUMN last_daily_report_date TEXT;
