-- Agencia (conectores Facebook/Instagram): a diferencia de Telegram (el
-- bot_token va en la URL del webhook, un webhook por tenant) o del widget
-- de sitio web (el tenant_id va en la URL), Meta usa UN webhook COMPARTIDO
-- para todos los tenants — el payload solo trae el Page ID (Messenger) o
-- el Instagram Business Account ID (Instagram), nunca el access token.
-- route_key guarda ese identificador para poder resolver el tenant al
-- recibir un evento; external_id sigue siendo lo que se le pasa a
-- ChannelProvider.sendMessage (el Page Access Token), sin tocar esa
-- interfaz. NULL para canales que no lo necesitan (Telegram, Web).
ALTER TABLE channel_bindings ADD COLUMN route_key TEXT;
CREATE INDEX idx_channel_bindings_route_key ON channel_bindings (channel, route_key);
