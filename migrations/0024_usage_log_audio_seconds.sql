-- Agencia ("widgets de costo real en /admin"): whisper-1 (transcripción de
-- voz) se factura por minuto de audio, no por tokens — prompt_tokens/
-- completion_tokens se quedan en 0 para esas filas, audio_seconds lleva el
-- dato real que sí importa para calcular su costo.
ALTER TABLE usage_log ADD COLUMN audio_seconds REAL;
