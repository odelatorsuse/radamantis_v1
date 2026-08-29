-- Etapa 10 (unifica no-shows + encuesta de satisfacción + reseñas en un
-- solo seguimiento post-cita): el bot pregunta si el cliente asistió y su
-- calificación en la misma conversación de siempre — el LLM registra la
-- respuesta con una tool (recordAppointmentFeedback), nunca inventada.
ALTER TABLE appointments ADD COLUMN attended INTEGER;
ALTER TABLE appointments ADD COLUMN rating INTEGER;
ALTER TABLE appointments ADD COLUMN feedback_comment TEXT;

-- Link de reseñas (ej. Google Business) configurado por el dueño desde
-- /console — si no está configurado, el bot simplemente no pide reseña.
ALTER TABLE tenant_settings ADD COLUMN review_link TEXT;
