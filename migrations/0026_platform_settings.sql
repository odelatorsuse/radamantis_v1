-- Agencia (conectores, autoservicio real): Oscar pidió que TODO lo que le
-- pedíamos configurar por fuera (crear la App de Meta, guardar su App
-- ID/Secret) quede guardado y editable desde el panel — no un secret de
-- Worker que solo Claude puede escribir con `wrangler secret put`. Fila
-- única (singleton), mismo nivel de seguridad "sandbox" ya aceptado en el
-- proyecto para otros tokens en D1 (bot tokens, Page Access Tokens,
-- refresh tokens de Google Calendar).
CREATE TABLE platform_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  meta_app_id TEXT,
  meta_app_secret TEXT,
  meta_verify_token TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Semilla con el verify token ya generado y ya comunicado a Oscar para
-- pegar en el Webhook de su App de Meta — no invalidarlo generando uno
-- nuevo por accidente.
INSERT INTO platform_settings (id, meta_verify_token) VALUES (1, 'hq-ZJJImkt_-W5AMLfQVTpRLoGhD91un');
