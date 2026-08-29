-- Etapa 10 (superpower "Vigilante"): avisarle al dueño del negocio cuando
-- un cliente pide un humano o suena molesto. alert_chat_id es opt-in (NULL =
-- sin alertas configuradas, silencio total, no un error). alert_activation_code
-- es el código de un solo uso por tenant que el dueño manda a su propio bot
-- desde /console para vincular su chat_id sin tener que buscarlo él mismo
-- (Telegram no expone el chat_id en ningún lado de su UI).
ALTER TABLE tenant_settings ADD COLUMN alert_chat_id TEXT;
ALTER TABLE tenant_settings ADD COLUMN alert_activation_code TEXT;
