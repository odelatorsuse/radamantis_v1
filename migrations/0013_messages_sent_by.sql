-- Etapa 10 (consola del cliente — manejo de chats): distingue una respuesta
-- del LLM de una escrita a mano por el negocio desde la consola. Se guarda
-- igual con role='assistant' (así se ve para el cliente en Telegram y para
-- el propio LLM si la conversación se reactiva), pero sent_by='human' deja
-- rastro de quién la mandó realmente, para que la consola la muestre distinto.
ALTER TABLE messages ADD COLUMN sent_by TEXT;
